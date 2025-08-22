import { 
  CapabilityProvider, 
  CapabilityRegistry, 
  CapabilityUsageStats, 
  ProviderSelectionStrategy,
  BuiltinSelectionStrategy,
  CapabilityMetrics,
  RoutingInfo
} from '../types/capability';
import { LLMRequest } from '../types/index';

export class DefaultCapabilityRegistry implements CapabilityRegistry {
  private providers: Map<string, CapabilityProvider> = new Map();
  private selectionStrategy: ProviderSelectionStrategy;
  private metrics: Map<string, CapabilityMetrics> = new Map();

  constructor(selectionStrategy?: ProviderSelectionStrategy) {
    this.selectionStrategy = selectionStrategy || new CostOptimizedStrategy();
  }

  register(provider: CapabilityProvider): void {
    console.log(`[CapabilityRegistry] Registering provider: ${provider.name} v${provider.version}`);
    this.providers.set(provider.name, provider);
    
    // 初期メトリクスを作成
    this.metrics.set(provider.name, {
      provider_name: provider.name,
      request_count: 0,
      success_rate: 0,
      average_latency_ms: 0,
      total_cost_usd: 0,
      error_distribution: {},
      last_updated: new Date().toISOString()
    });
  }

  unregister(name: string): void {
    console.log(`[CapabilityRegistry] Unregistering provider: ${name}`);
    this.providers.delete(name);
    this.metrics.delete(name);
  }

  findBestProvider(request: LLMRequest): CapabilityProvider | null {
    console.log(`[CapabilityRegistry] Finding best provider for task: ${request.task_type}`);
    
    const candidates = this.getProvidersForTaskType(request.task_type || 'auto');
    
    if (candidates.length === 0) {
      console.warn(`[CapabilityRegistry] No providers found for task type: ${request.task_type}`);
      return null;
    }

    const selected = this.selectionStrategy.select(candidates, request);
    if (selected) {
      console.log(`[CapabilityRegistry] Selected provider: ${selected.name}`);
    }
    
    return selected;
  }

  getProvidersForTaskType(task_type: string): CapabilityProvider[] {
    const providers: CapabilityProvider[] = [];
    
    for (const provider of this.providers.values()) {
      if (provider.supported_task_types.includes(task_type) || task_type === 'auto') {
        providers.push(provider);
      }
    }
    
    return providers;
  }

  getAllProviders(): CapabilityProvider[] {
    return Array.from(this.providers.values());
  }

  async checkAllHealth(): Promise<Record<string, boolean>> {
    console.log('[CapabilityRegistry] Checking health of all providers...');
    
    const healthStatus: Record<string, boolean> = {};
    
    const healthChecks = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        const healthy = await provider.isHealthy();
        healthStatus[name] = healthy;
        console.log(`[CapabilityRegistry] ${name}: ${healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
      } catch (error) {
        console.error(`[CapabilityRegistry] Health check failed for ${name}:`, error);
        healthStatus[name] = false;
      }
    });

    await Promise.all(healthChecks);
    
    const healthyCount = Object.values(healthStatus).filter(Boolean).length;
    console.log(`[CapabilityRegistry] Health check complete: ${healthyCount}/${this.providers.size} providers healthy`);
    
    return healthStatus;
  }

  async getAllStats(): Promise<Record<string, CapabilityUsageStats>> {
    const stats: Record<string, CapabilityUsageStats> = {};
    
    const statPromises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        stats[name] = await provider.getUsageStats();
      } catch (error) {
        console.error(`[CapabilityRegistry] Failed to get stats for ${name}:`, error);
        stats[name] = {
          total_requests: 0,
          successful_requests: 0,
          failed_requests: 0,
          average_latency_ms: 0,
          total_cost_usd: 0,
          last_24h_requests: 0,
          error_rate: 0,
          uptime_percentage: 0
        };
      }
    });

    await Promise.all(statPromises);
    return stats;
  }

  // メトリクス更新
  updateMetrics(providerName: string, success: boolean, latency: number, cost: number, errorCode?: string): void {
    const metrics = this.metrics.get(providerName);
    if (!metrics) return;

    metrics.request_count++;
    
    if (success) {
      metrics.success_rate = (metrics.success_rate * (metrics.request_count - 1) + 1) / metrics.request_count;
    } else {
      metrics.success_rate = metrics.success_rate * (metrics.request_count - 1) / metrics.request_count;
      
      if (errorCode) {
        metrics.error_distribution[errorCode] = (metrics.error_distribution[errorCode] || 0) + 1;
      }
    }
    
    metrics.average_latency_ms = 
      (metrics.average_latency_ms * (metrics.request_count - 1) + latency) / metrics.request_count;
    
    metrics.total_cost_usd += cost;
    metrics.last_updated = new Date().toISOString();
  }

  // ルーティング情報を含むプロバイダー選択
  findBestProviderWithRouting(request: LLMRequest): { provider: CapabilityProvider | null; routing: RoutingInfo } {
    const startTime = Date.now();
    const candidates = this.getProvidersForTaskType(request.task_type || 'auto');
    
    const provider = candidates.length > 0 ? this.selectionStrategy.select(candidates, request) : null;
    
    const routing: RoutingInfo = {
      selected_provider: provider?.name || 'none',
      selection_reason: this.getSelectionReason(provider, candidates),
      alternatives_considered: candidates.map(p => p.name),
      routing_latency_ms: Date.now() - startTime,
      cost_estimate_usd: 0 // 実際の実装では事前見積もりを取得
    };

    if (provider) {
      provider.estimateCost(request).then(cost => {
        routing.cost_estimate_usd = cost;
      }).catch(() => {
        routing.cost_estimate_usd = 0;
      });
    }

    return { provider, routing };
  }

  private getSelectionReason(selected: CapabilityProvider | null, candidates: CapabilityProvider[]): string {
    if (!selected) {
      return 'No suitable provider found';
    }
    
    if (candidates.length === 1) {
      return 'Only available provider';
    }
    
    return `Selected by ${this.selectionStrategy.constructor.name}`;
  }

  // プロバイダーの動的有効化/無効化
  enableProvider(name: string): void {
    // 実装は必要に応じて
  }

  disableProvider(name: string): void {
    // 実装は必要に応じて
  }

  // プロバイダーの負荷分散
  getLoadBalancedProvider(taskType: string): CapabilityProvider | null {
    const candidates = this.getProvidersForTaskType(taskType);
    if (candidates.length === 0) return null;
    
    // 簡単なラウンドロビン実装
    const metrics = candidates.map(p => this.metrics.get(p.name));
    const leastLoadedIndex = metrics.findIndex(m => 
      m && m.request_count === Math.min(...metrics.filter(Boolean).map(m => m!.request_count))
    );
    
    return candidates[leastLoadedIndex >= 0 ? leastLoadedIndex : 0];
  }

  // プロバイダーの重み付き選択
  getWeightedProvider(taskType: string, weights: Record<string, number>): CapabilityProvider | null {
    const candidates = this.getProvidersForTaskType(taskType);
    if (candidates.length === 0) return null;
    
    const weightedCandidates = candidates.filter(p => weights[p.name] > 0);
    if (weightedCandidates.length === 0) return candidates[0];
    
    const totalWeight = weightedCandidates.reduce((sum, p) => sum + weights[p.name], 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const candidate of weightedCandidates) {
      currentWeight += weights[candidate.name];
      if (random <= currentWeight) {
        return candidate;
      }
    }
    
    return weightedCandidates[0];
  }
}

// 組み込み選択戦略の実装
export class CostOptimizedStrategy implements ProviderSelectionStrategy {
  select(candidates: CapabilityProvider[], request: LLMRequest): CapabilityProvider | null {
    if (candidates.length === 0) return null;
    
    // 最も安価なプロバイダーを選択
    // 実際の実装では各プロバイダーのコスト見積もりを比較
    return candidates[0];
  }
}

export class PerformanceFirstStrategy implements ProviderSelectionStrategy {
  select(candidates: CapabilityProvider[], request: LLMRequest): CapabilityProvider | null {
    if (candidates.length === 0) return null;
    
    // 最も高速なプロバイダーを選択
    // 実際の実装では各プロバイダーのレイテンシ履歴を比較
    return candidates[0];
  }
}

export class BalancedStrategy implements ProviderSelectionStrategy {
  select(candidates: CapabilityProvider[], request: LLMRequest): CapabilityProvider | null {
    if (candidates.length === 0) return null;
    
    // コストと性能のバランスを考慮
    return candidates[0];
  }
}

export class ReliabilityFirstStrategy implements ProviderSelectionStrategy {
  select(candidates: CapabilityProvider[], request: LLMRequest): CapabilityProvider | null {
    if (candidates.length === 0) return null;
    
    // 信頼性(成功率)重視
    return candidates[0];
  }
}

// ファクトリクラス
export class ProviderSelectionStrategyFactory {
  static create(strategy: BuiltinSelectionStrategy | ProviderSelectionStrategy): ProviderSelectionStrategy {
    if (typeof strategy === 'object') {
      return strategy;
    }
    
    switch (strategy) {
      case 'cost_optimized':
        return new CostOptimizedStrategy();
      case 'performance_first':
        return new PerformanceFirstStrategy();
      case 'balanced':
        return new BalancedStrategy();
      case 'reliability_first':
        return new ReliabilityFirstStrategy();
      default:
        throw new Error(`Unknown selection strategy: ${strategy}`);
    }
  }
}