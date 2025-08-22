import { 
  CostManagementSystem, 
  CostTracker, 
  ModelPricingManager,
  BudgetConfig,
  TokenUsage,
  CostBreakdown
} from '../types/cost-management';
import { PrecisionCostTracker } from './CostTrackingSystem';
import { PrecisionModelPricingManager } from './ModelPricingManager';

export class PrecisionCostManagementSystem implements CostManagementSystem {
  public tracker: CostTracker;
  public pricing: ModelPricingManager;
  
  private initialized: boolean = false;
  private config: BudgetConfig | null = null;

  constructor(dataDir: string = './data/cost-management') {
    this.tracker = new PrecisionCostTracker(`${dataDir}/tracking`);
    this.pricing = new PrecisionModelPricingManager(`${dataDir}/pricing`);
  }

  async initialize(config: BudgetConfig): Promise<void> {
    console.log('[CostManagement] 🔧 Initializing Precision Cost Management System...');
    
    try {
      // 予算設定
      await this.tracker.setBudget(config);
      this.config = config;
      
      // 価格データの更新
      await this.pricing.refreshPricing();
      
      this.initialized = true;
      
      console.log('[CostManagement] ✅ System initialized successfully');
      console.log(`[CostManagement] 💰 Monthly budget: $${config.monthly_budget_usd}`);
      console.log(`[CostManagement] 🚨 Warning at: ${(config.warning_threshold * 100).toFixed(1)}%`);
      console.log(`[CostManagement] 🔴 Critical at: ${(config.critical_threshold * 100).toFixed(1)}%`);
      console.log(`[CostManagement] ⏸️  Auto-pause: ${config.auto_pause_at_limit ? 'Enabled' : 'Disabled'}`);
      
    } catch (error) {
      console.error('[CostManagement] ❌ Initialization failed:', error);
      throw error;
    }
  }

  async preRequestCheck(
    model_id: string, 
    estimated_tokens: Partial<TokenUsage>
  ): Promise<{
    approved: boolean;
    estimated_cost: CostBreakdown;
    warnings: string[];
    reason?: string;
  }> {
    console.log(`[CostManagement] 🔍 Pre-request check: ${model_id} (${JSON.stringify(estimated_tokens)})`);
    
    if (!this.initialized) {
      return {
        approved: false,
        estimated_cost: { input_cost_usd: 0, output_cost_usd: 0, total_cost_usd: 0, currency: 'USD', calculated_at: new Date().toISOString() },
        warnings: [],
        reason: 'Cost management system not initialized'
      };
    }

    const warnings: string[] = [];
    let approved = true;
    let reason: string | undefined;

    try {
      // コスト見積もり
      const estimated_cost = await this.pricing.calculateCost(model_id, {
        input: estimated_tokens.input || 0,
        output: estimated_tokens.output || 0,
        total: (estimated_tokens.input || 0) + (estimated_tokens.output || 0),
        cached: estimated_tokens.cached,
        reasoning: estimated_tokens.reasoning
      });

      // 予算状況チェック
      const budget_status = await this.tracker.checkBudgetStatus();
      
      // 単一リクエストコスト制限チェック
      if (this.config?.max_request_cost_usd && estimated_cost.total_cost_usd > this.config.max_request_cost_usd) {
        approved = false;
        reason = `Request cost $${estimated_cost.total_cost_usd.toFixed(4)} exceeds limit $${this.config.max_request_cost_usd.toFixed(4)}`;
      }

      // 残予算チェック
      if (budget_status.remaining_budget < estimated_cost.total_cost_usd) {
        approved = false;
        reason = `Insufficient budget: $${budget_status.remaining_budget.toFixed(4)} remaining, $${estimated_cost.total_cost_usd.toFixed(4)} required`;
      }

      // 自動停止設定チェック
      if (this.config?.auto_pause_at_limit && !budget_status.can_proceed) {
        approved = false;
        reason = 'Auto-pause activated due to budget limit';
      }

      // 警告生成
      if (budget_status.warnings.length > 0) {
        warnings.push(...budget_status.warnings.map(alert => alert.message));
      }

      if (budget_status.current_usage / (this.config?.monthly_budget_usd || 1) > 0.9) {
        warnings.push('Warning: Over 90% of monthly budget used');
      }

      console.log(`[CostManagement] ${approved ? '✅' : '❌'} Pre-check result: ${approved ? 'Approved' : 'Rejected'}, Cost: $${estimated_cost.total_cost_usd.toFixed(4)}`);
      if (reason) console.log(`[CostManagement] 📝 Reason: ${reason}`);
      if (warnings.length > 0) console.log(`[CostManagement] ⚠️ Warnings: ${warnings.join(', ')}`);

      return {
        approved,
        estimated_cost,
        warnings,
        reason
      };

    } catch (error) {
      console.error(`[CostManagement] ❌ Pre-request check failed:`, error);
      return {
        approved: false,
        estimated_cost: { input_cost_usd: 0, output_cost_usd: 0, total_cost_usd: 0, currency: 'USD', calculated_at: new Date().toISOString() },
        warnings: ['Pre-request check failed'],
        reason: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async postRequestProcessing(
    session_id: string,
    model_id: string,
    actual_tokens: TokenUsage,
    latency_ms: number,
    success: boolean,
    error?: Error
  ): Promise<void> {
    console.log(`[CostManagement] 📊 Post-request processing: ${session_id}, ${model_id}, Success: ${success}`);

    try {
      // 実際のコスト計算
      const actual_cost = await this.pricing.calculateCost(model_id, actual_tokens);

      // 使用量追跡
      if (success) {
        await this.tracker.trackUsage(session_id, model_id, actual_tokens, actual_cost);
      } else {
        // 失敗したリクエストも追跡（コストは発生している可能性）
        await this.trackFailedRequest(session_id, model_id, actual_tokens, actual_cost, error);
      }

      // パフォーマンス統計の更新
      await this.updatePerformanceStats(session_id, model_id, latency_ms, success);

      console.log(`[CostManagement] ✅ Post-processing completed: $${actual_cost.total_cost_usd.toFixed(6)}`);

    } catch (error) {
      console.error(`[CostManagement] ❌ Post-request processing failed:`, error);
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    budget_status: string;
    active_sessions: number;
    recent_errors: number;
    system_recommendations: string[];
  }> {
    console.log('[CostManagement] 🏥 Performing health check...');

    try {
      const budget_status = await this.tracker.checkBudgetStatus();
      const usage_stats = await this.tracker.getUsageStats();
      const unacknowledged_alerts = await this.tracker.getAlerts(true);
      
      // ステータス判定
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      const recommendations: string[] = [];

      // 予算状況に基づくステータス
      const usage_percentage = this.config ? budget_status.current_usage / this.config.monthly_budget_usd : 0;
      
      if (usage_percentage >= 0.95) {
        status = 'critical';
        recommendations.push('予算の95%以上を使用しています - 緊急対応が必要');
      } else if (usage_percentage >= 0.8) {
        status = 'warning';
        recommendations.push('予算の80%以上を使用しています - 使用量を監視してください');
      }

      // アラート状況
      const critical_alerts = unacknowledged_alerts.filter(a => a.type === 'critical' || a.type === 'budget_exceeded');
      if (critical_alerts.length > 0) {
        status = 'critical';
        recommendations.push(`${critical_alerts.length}個の重要なアラートが未確認です`);
      }

      // アクティブセッション数（推定）
      const active_sessions = 5; // 実際の実装では正確な数を取得

      // 最近のエラー数（推定）
      const recent_errors = 2; // 実際の実装では過去1時間のエラー数を取得

      // 追加の推奨事項
      if (usage_percentage > 0.5) {
        recommendations.push('コスト効率の良いモデルの使用を検討してください');
      }
      
      if (recent_errors > 10) {
        recommendations.push('エラー率が高いです - システムの調査が必要');
      }

      const budget_status_text = `$${budget_status.current_usage.toFixed(4)} / $${this.config?.monthly_budget_usd || 0} (${(usage_percentage * 100).toFixed(1)}%)`;

      console.log(`[CostManagement] 🏥 Health check completed: ${status.toUpperCase()}`);

      return {
        status,
        budget_status: budget_status_text,
        active_sessions,
        recent_errors,
        system_recommendations: recommendations
      };

    } catch (error) {
      console.error('[CostManagement] ❌ Health check failed:', error);
      
      return {
        status: 'critical',
        budget_status: 'Unknown - health check failed',
        active_sessions: 0,
        recent_errors: 0,
        system_recommendations: ['Health check failed - system investigation required']
      };
    }
  }

  // コスト最適化機能
  async suggestCostOptimizations(): Promise<{
    current_monthly_spend: number;
    projected_monthly_spend: number;
    optimizations: Array<{
      type: 'model_switch' | 'usage_pattern' | 'batch_processing' | 'caching';
      description: string;
      estimated_savings: number;
      implementation_effort: 'low' | 'medium' | 'high';
      priority: 'low' | 'medium' | 'high';
    }>;
  }> {
    console.log('[CostManagement] 💡 Generating cost optimization suggestions...');

    const usage_stats = await this.tracker.getUsageStats();
    const current_spend = usage_stats.total_cost || 0;
    const projected_spend = current_spend * (30 / new Date().getDate()); // 今月の投影

    const optimizations = [
      {
        type: 'model_switch' as const,
        description: 'シンプルなタスクでより安価なモデル（Qwen3 Coder）を使用',
        estimated_savings: projected_spend * 0.3,
        implementation_effort: 'low' as const,
        priority: 'high' as const
      },
      {
        type: 'batch_processing' as const,
        description: 'リクエストをバッチ処理してAPI効率を向上',
        estimated_savings: projected_spend * 0.15,
        implementation_effort: 'medium' as const,
        priority: 'medium' as const
      },
      {
        type: 'caching' as const,
        description: '頻繁な処理結果をキャッシュして重複リクエストを削減',
        estimated_savings: projected_spend * 0.20,
        implementation_effort: 'medium' as const,
        priority: 'high' as const
      }
    ];

    return {
      current_monthly_spend: current_spend,
      projected_monthly_spend: projected_spend,
      optimizations
    };
  }

  // リアルタイム使用量ダッシュボード
  async getRealTimeDashboard(): Promise<{
    current_cost: number;
    hourly_rate: number;
    budget_remaining: number;
    top_models: Array<{ model: string; cost: number; percentage: number }>;
    recent_activity: Array<{ timestamp: string; model: string; cost: number; success: boolean }>;
    alerts: number;
  }> {
    const budget_status = await this.tracker.checkBudgetStatus();
    const usage_stats = await this.tracker.getUsageStats();
    const alerts = await this.tracker.getAlerts(true);

    // 上位モデルの使用コスト（モック）
    const top_models = [
      { model: 'qwen3_coder', cost: budget_status.current_usage * 0.6, percentage: 60 },
      { model: 'claude_sonnet', cost: budget_status.current_usage * 0.3, percentage: 30 },
      { model: 'gpt4o', cost: budget_status.current_usage * 0.1, percentage: 10 }
    ];

    // 最近のアクティビティ（モック）
    const recent_activity = [
      { timestamp: new Date().toISOString(), model: 'qwen3_coder', cost: 0.05, success: true },
      { timestamp: new Date(Date.now() - 300000).toISOString(), model: 'claude_sonnet', cost: 0.15, success: true },
      { timestamp: new Date(Date.now() - 600000).toISOString(), model: 'qwen3_coder', cost: 0.03, success: false }
    ];

    return {
      current_cost: budget_status.current_usage,
      hourly_rate: budget_status.current_usage / (new Date().getHours() || 1), // 簡易計算
      budget_remaining: budget_status.remaining_budget,
      top_models,
      recent_activity,
      alerts: alerts.length
    };
  }

  // プライベートメソッド

  private async trackFailedRequest(
    session_id: string,
    model_id: string,
    tokens: TokenUsage,
    cost: CostBreakdown,
    error?: Error
  ): Promise<void> {
    // 失敗したリクエストの追跡
    console.log(`[CostManagement] 📉 Tracking failed request: ${session_id}, ${model_id}, Error: ${error?.message || 'Unknown'}`);
    
    // 通常のトラッキングは行わず、エラー統計のみ更新
    const session = await this.tracker.getSession(session_id);
    if (session) {
      session.failed_requests++;
      if (session.model_breakdown[model_id]) {
        session.model_breakdown[model_id].errors++;
      }
    }
  }

  private async updatePerformanceStats(
    session_id: string,
    model_id: string,
    latency_ms: number,
    success: boolean
  ): Promise<void> {
    const session = await this.tracker.getSession(session_id);
    if (!session) return;

    // レイテンシ統計の更新
    session.total_latency_ms += latency_ms;
    
    if (latency_ms > session.max_latency_ms) {
      session.max_latency_ms = latency_ms;
    }
    
    if (latency_ms < session.min_latency_ms) {
      session.min_latency_ms = latency_ms;
    }

    // モデル別レイテンシ統計
    if (session.model_breakdown[model_id]) {
      const model_stats = session.model_breakdown[model_id];
      const total_requests = model_stats.requests;
      model_stats.avg_latency_ms = ((model_stats.avg_latency_ms * (total_requests - 1)) + latency_ms) / total_requests;
    }
  }
}