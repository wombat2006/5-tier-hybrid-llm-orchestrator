import { 
  CostTracker, 
  ModelPricingManager,
  CostManagementSystem,
  UsageSession, 
  TokenUsage, 
  CostBreakdown, 
  ModelPricing,
  BudgetConfig,
  CostAlert,
  UsageReport
} from '../types/cost-management';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PrecisionCostTracker implements CostTracker {
  private sessions: Map<string, UsageSession> = new Map();
  private budget: BudgetConfig;
  private alerts: CostAlert[] = [];
  private dataDir: string;

  constructor(dataDir: string = './data/cost-tracking') {
    this.dataDir = dataDir;
    // デフォルト予算設定で初期化
    this.budget = {
      monthly_budget_usd: 70.0,
      warning_threshold: 0.8,
      critical_threshold: 0.95,
      auto_pause_at_limit: false,
      budget_reset_day: 1,
      timezone: 'UTC'
    };
    this.initializeDataDirectory();
  }

  private async initializeDataDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'sessions'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'reports'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'alerts'), { recursive: true });
    } catch (error) {
      console.error('[CostTracker] Failed to initialize data directory:', error);
    }
  }

  async trackUsage(
    session_id: string, 
    model_id: string, 
    tokens: TokenUsage, 
    cost: CostBreakdown
  ): Promise<void> {
    console.log(`[CostTracker] 📊 Tracking usage: ${session_id}, Model: ${model_id}, Cost: $${cost.total_cost_usd.toFixed(4)}`);
    
    let session = this.sessions.get(session_id);
    if (!session) {
      // セッションが存在しない場合は作成
      session = await this.startSession(session_id);
    }

    // セッション統計の更新
    session.total_requests++;
    session.successful_requests++;
    
    // トークン統計の更新
    session.total_tokens.input += tokens.input;
    session.total_tokens.output += tokens.output;
    session.total_tokens.total += tokens.total;
    if (tokens.cached) session.total_tokens.cached = (session.total_tokens.cached || 0) + tokens.cached;
    if (tokens.reasoning) session.total_tokens.reasoning = (session.total_tokens.reasoning || 0) + tokens.reasoning;

    // モデル別統計の更新
    if (!session.model_breakdown[model_id]) {
      session.model_breakdown[model_id] = {
        requests: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: {
          input_cost_usd: 0,
          output_cost_usd: 0,
          total_cost_usd: 0,
          currency: 'USD' as const,
          calculated_at: new Date().toISOString()
        },
        avg_latency_ms: 0,
        errors: 0
      };
    }

    const modelStats = session.model_breakdown[model_id];
    modelStats.requests++;
    modelStats.tokens.input += tokens.input;
    modelStats.tokens.output += tokens.output;
    modelStats.tokens.total += tokens.total;
    
    // コスト累積
    modelStats.cost.input_cost_usd += cost.input_cost_usd;
    modelStats.cost.output_cost_usd += cost.output_cost_usd;
    modelStats.cost.total_cost_usd += cost.total_cost_usd;
    if (cost.cached_cost_usd) modelStats.cost.cached_cost_usd = (modelStats.cost.cached_cost_usd || 0) + cost.cached_cost_usd;
    if (cost.reasoning_cost_usd) modelStats.cost.reasoning_cost_usd = (modelStats.cost.reasoning_cost_usd || 0) + cost.reasoning_cost_usd;

    // セッション総コストの更新
    session.total_cost.input_cost_usd += cost.input_cost_usd;
    session.total_cost.output_cost_usd += cost.output_cost_usd;
    session.total_cost.total_cost_usd += cost.total_cost_usd;
    if (cost.cached_cost_usd) session.total_cost.cached_cost_usd = (session.total_cost.cached_cost_usd || 0) + cost.cached_cost_usd;
    if (cost.reasoning_cost_usd) session.total_cost.reasoning_cost_usd = (session.total_cost.reasoning_cost_usd || 0) + cost.reasoning_cost_usd;

    // セッションを保存
    await this.saveSession(session);

    // 予算チェックとアラート
    await this.checkAndTriggerAlerts(session);

    console.log(`[CostTracker] ✅ Usage tracked: Session total: $${session.total_cost.total_cost_usd.toFixed(4)}, Requests: ${session.total_requests}`);
  }

  async estimateCost(model_id: string, estimated_tokens: Partial<TokenUsage>): Promise<CostBreakdown> {
    const pricing = await this.getPricingForModel(model_id);
    if (!pricing) {
      throw new Error(`Pricing not found for model: ${model_id}`);
    }

    const input_cost = ((estimated_tokens.input || 0) / 1000) * pricing.input_price_per_1k;
    const output_cost = ((estimated_tokens.output || 0) / 1000) * pricing.output_price_per_1k;
    const cached_cost = estimated_tokens.cached && pricing.cached_price_per_1k 
      ? ((estimated_tokens.cached || 0) / 1000) * pricing.cached_price_per_1k 
      : 0;
    const reasoning_cost = estimated_tokens.reasoning && pricing.reasoning_price_per_1k
      ? ((estimated_tokens.reasoning || 0) / 1000) * pricing.reasoning_price_per_1k
      : 0;

    const total_cost = input_cost + output_cost + cached_cost + reasoning_cost;
    const minimum_charge = pricing.minimum_charge || 0;

    return {
      input_cost_usd: input_cost,
      output_cost_usd: output_cost,
      cached_cost_usd: cached_cost > 0 ? cached_cost : undefined,
      reasoning_cost_usd: reasoning_cost > 0 ? reasoning_cost : undefined,
      total_cost_usd: Math.max(total_cost, minimum_charge),
      currency: 'USD',
      calculated_at: new Date().toISOString()
    };
  }

  async startSession(session_id: string, metadata?: Record<string, any>): Promise<UsageSession> {
    const session: UsageSession = {
      session_id,
      started_at: new Date().toISOString(),
      status: 'active',
      user_id: metadata?.user_id,
      project_id: metadata?.project_id,
      
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      cached_requests: 0,
      
      total_tokens: { input: 0, output: 0, total: 0 },
      model_breakdown: {},
      
      total_cost: {
        input_cost_usd: 0,
        output_cost_usd: 0,
        total_cost_usd: 0,
        currency: 'USD',
        calculated_at: new Date().toISOString()
      },
      estimated_cost: {
        input_cost_usd: 0,
        output_cost_usd: 0,
        total_cost_usd: 0,
        currency: 'USD',
        calculated_at: new Date().toISOString()
      },
      cost_variance: 0,
      
      total_latency_ms: 0,
      avg_latency_ms: 0,
      max_latency_ms: 0,
      min_latency_ms: Infinity
    };

    this.sessions.set(session_id, session);
    await this.saveSession(session);
    
    console.log(`[CostTracker] 🚀 Started session: ${session_id}`);
    return session;
  }

  async endSession(session_id: string): Promise<UsageSession> {
    const session = this.sessions.get(session_id);
    if (!session) {
      throw new Error(`Session not found: ${session_id}`);
    }

    session.status = 'completed';
    session.completed_at = new Date().toISOString();
    
    // 統計の最終計算
    if (session.successful_requests > 0) {
      session.avg_latency_ms = session.total_latency_ms / session.successful_requests;
    }

    // コスト差異の計算
    if (session.estimated_cost.total_cost_usd > 0) {
      session.cost_variance = ((session.total_cost.total_cost_usd - session.estimated_cost.total_cost_usd) / session.estimated_cost.total_cost_usd) * 100;
    }

    await this.saveSession(session);
    console.log(`[CostTracker] ✅ Ended session: ${session_id}, Final cost: $${session.total_cost.total_cost_usd.toFixed(4)}`);
    
    return session;
  }

  async getSession(session_id: string): Promise<UsageSession | null> {
    const session = this.sessions.get(session_id);
    if (session) return session;

    // ディスクから読み込み
    try {
      const sessionPath = path.join(this.dataDir, 'sessions', `${session_id}.json`);
      const data = await fs.readFile(sessionPath, 'utf-8');
      const loadedSession = JSON.parse(data) as UsageSession;
      this.sessions.set(session_id, loadedSession);
      return loadedSession;
    } catch (error) {
      return null;
    }
  }

  async checkBudgetStatus(): Promise<{
    current_usage: number;
    remaining_budget: number;
    can_proceed: boolean;
    warnings: CostAlert[];
  }> {
    if (!this.budget) {
      return {
        current_usage: 0,
        remaining_budget: Infinity,
        can_proceed: true,
        warnings: []
      };
    }

    const currentUsage = await this.getCurrentPeriodUsage();
    const remaining = this.budget.monthly_budget_usd - currentUsage;
    const usagePercentage = currentUsage / this.budget.monthly_budget_usd;
    
    const warnings = this.alerts.filter(alert => !alert.acknowledged);
    const canProceed = !this.budget.auto_pause_at_limit || remaining > 0;

    return {
      current_usage: currentUsage,
      remaining_budget: Math.max(0, remaining),
      can_proceed: canProceed,
      warnings
    };
  }

  async generateReport(period: { start: string; end: string }): Promise<UsageReport> {
    const sessions = await this.getSessionsInPeriod(period.start, period.end);
    
    // 基本統計の計算
    const summary = this.calculateSummaryStats(sessions);
    const modelBreakdown = this.calculateModelBreakdown(sessions);
    const timeSeries = this.generateTimeSeries(sessions, period);
    const costEfficiency = this.calculateCostEfficiency(sessions);
    const recommendations = this.generateRecommendations(summary, modelBreakdown);

    return {
      period: {
        start: period.start,
        end: period.end,
        type: 'custom'
      },
      summary,
      model_breakdown: modelBreakdown,
      time_series: timeSeries,
      cost_efficiency: costEfficiency,
      recommendations
    };
  }

  async getUsageStats(model_id?: string): Promise<any> {
    const activeSessions = Array.from(this.sessions.values());
    
    if (model_id) {
      const modelStats = {
        total_requests: 0,
        total_cost: 0,
        total_tokens: 0,
        avg_latency: 0,
        error_rate: 0
      };

      for (const session of activeSessions) {
        const modelData = session.model_breakdown[model_id];
        if (modelData) {
          modelStats.total_requests += modelData.requests;
          modelStats.total_cost += modelData.cost.total_cost_usd;
          modelStats.total_tokens += modelData.tokens.total;
          modelStats.avg_latency += modelData.avg_latency_ms * modelData.requests;
        }
      }

      if (modelStats.total_requests > 0) {
        modelStats.avg_latency /= modelStats.total_requests;
        modelStats.error_rate = modelStats.total_requests > 0 ? 
          (activeSessions.reduce((sum, s) => sum + (s.model_breakdown[model_id]?.errors || 0), 0) / modelStats.total_requests) * 100 : 0;
      }

      return modelStats;
    }

    // 全体統計
    return {
      active_sessions: activeSessions.length,
      total_cost: activeSessions.reduce((sum, s) => sum + s.total_cost.total_cost_usd, 0),
      total_requests: activeSessions.reduce((sum, s) => sum + s.total_requests, 0),
      total_tokens: activeSessions.reduce((sum, s) => sum + s.total_tokens.total, 0)
    };
  }

  async setBudget(config: BudgetConfig): Promise<void> {
    this.budget = config;
    await this.saveBudgetConfig(config);
    console.log(`[CostTracker] 💰 Budget set: $${config.monthly_budget_usd}/month`);
  }

  async getBudget(): Promise<BudgetConfig> {
    // 予算設定のファイルから読み込みを試みる
    try {
      const budgetPath = path.join(this.dataDir, 'budget.json');
      const data = await fs.readFile(budgetPath, 'utf-8');
      this.budget = JSON.parse(data);
    } catch (error) {
      // ファイルがない場合はデフォルト設定を保存
      await this.saveBudgetConfig(this.budget);
    }
    return this.budget;
  }

  async getAlerts(unacknowledged_only: boolean = false): Promise<CostAlert[]> {
    if (unacknowledged_only) {
      return this.alerts.filter(alert => !alert.acknowledged);
    }
    return this.alerts;
  }

  async acknowledgeAlert(alert_id: string, user_id?: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alert_id);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledged_at = new Date().toISOString();
      alert.acknowledged_by = user_id;
      await this.saveAlerts();
    }
  }

  // プライベートメソッド

  private async saveSession(session: UsageSession): Promise<void> {
    try {
      const sessionPath = path.join(this.dataDir, 'sessions', `${session.session_id}.json`);
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error(`[CostTracker] Failed to save session ${session.session_id}:`, error);
    }
  }

  private async saveBudgetConfig(config: BudgetConfig): Promise<void> {
    try {
      const budgetPath = path.join(this.dataDir, 'budget.json');
      await fs.writeFile(budgetPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('[CostTracker] Failed to save budget config:', error);
    }
  }

  private async saveAlerts(): Promise<void> {
    try {
      const alertsPath = path.join(this.dataDir, 'alerts', 'alerts.json');
      await fs.writeFile(alertsPath, JSON.stringify(this.alerts, null, 2));
    } catch (error) {
      console.error('[CostTracker] Failed to save alerts:', error);
    }
  }

  private async getPricingForModel(model_id: string): Promise<ModelPricing | null> {
    // 実装では外部のPricingManagerから取得
    // ここではモック価格を返す
    const mockPricing: Record<string, ModelPricing> = {
      'qwen3_coder': {
        model_id: 'qwen3_coder',
        provider: 'alibaba_cloud',
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        minimum_charge: 0.001,
        last_updated: new Date().toISOString()
      },
      'claude_sonnet': {
        model_id: 'claude_sonnet',
        provider: 'anthropic',
        input_price_per_1k: 3.00,
        output_price_per_1k: 15.00,
        minimum_charge: 0.01,
        last_updated: new Date().toISOString()
      },
      'gpt4o': {
        model_id: 'gpt4o',
        provider: 'openai',
        input_price_per_1k: 2.50,
        output_price_per_1k: 10.00,
        reasoning_price_per_1k: 60.00,
        minimum_charge: 0.01,
        last_updated: new Date().toISOString()
      }
    };

    return mockPricing[model_id] || null;
  }

  private async getCurrentPeriodUsage(): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sessions = await this.getSessionsInPeriod(startOfMonth.toISOString(), now.toISOString());
    return sessions.reduce((sum, session) => sum + session.total_cost.total_cost_usd, 0);
  }

  private async getSessionsInPeriod(start: string, end: string): Promise<UsageSession[]> {
    // 実装では効率的なデータベースクエリを使用
    // ここでは簡単な実装
    const sessions: UsageSession[] = [];
    const startTime = new Date(start);
    const endTime = new Date(end);

    for (const session of this.sessions.values()) {
      const sessionTime = new Date(session.started_at);
      if (sessionTime >= startTime && sessionTime <= endTime) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  private async checkAndTriggerAlerts(session: UsageSession): Promise<void> {
    if (!this.budget) return;

    const currentUsage = await this.getCurrentPeriodUsage();
    const usagePercentage = currentUsage / this.budget.monthly_budget_usd;

    // 警告アラート
    if (usagePercentage >= this.budget.warning_threshold && usagePercentage < this.budget.critical_threshold) {
      await this.createAlert('warning', `予算の${(usagePercentage * 100).toFixed(1)}%を使用しました`, currentUsage);
    }

    // 重要アラート
    if (usagePercentage >= this.budget.critical_threshold && usagePercentage < 1.0) {
      await this.createAlert('critical', `予算の${(usagePercentage * 100).toFixed(1)}%を使用しました - 制限近いです`, currentUsage);
    }

    // 予算超過アラート
    if (usagePercentage >= 1.0) {
      await this.createAlert('budget_exceeded', `月間予算$${this.budget.monthly_budget_usd}を超過しました`, currentUsage);
    }
  }

  private async createAlert(type: CostAlert['type'], message: string, current_usage: number): Promise<void> {
    // 重複アラートの防止
    const recentAlert = this.alerts.find(alert => 
      alert.type === type && 
      !alert.acknowledged && 
      Date.now() - new Date(alert.triggered_at).getTime() < 3600000 // 1時間以内
    );

    if (recentAlert) return;

    const alert: CostAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      current_usage_usd: current_usage,
      budget_limit_usd: this.budget.monthly_budget_usd,
      usage_percentage: (current_usage / this.budget.monthly_budget_usd) * 100,
      triggered_at: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.push(alert);
    await this.saveAlerts();

    console.log(`[CostTracker] 🚨 Alert triggered: ${type} - ${message}`);
  }

  private calculateSummaryStats(sessions: UsageSession[]): UsageReport['summary'] {
    const totalRequests = sessions.reduce((sum, s) => sum + s.total_requests, 0);
    const successfulRequests = sessions.reduce((sum, s) => sum + s.successful_requests, 0);
    
    return {
      total_requests: totalRequests,
      total_tokens: sessions.reduce((acc, s) => ({
        input: acc.input + s.total_tokens.input,
        output: acc.output + s.total_tokens.output,
        total: acc.total + s.total_tokens.total
      }), { input: 0, output: 0, total: 0 }),
      total_cost: sessions.reduce((acc, s) => ({
        input_cost_usd: acc.input_cost_usd + s.total_cost.input_cost_usd,
        output_cost_usd: acc.output_cost_usd + s.total_cost.output_cost_usd,
        total_cost_usd: acc.total_cost_usd + s.total_cost.total_cost_usd,
        currency: 'USD' as const,
        calculated_at: new Date().toISOString()
      }), { input_cost_usd: 0, output_cost_usd: 0, total_cost_usd: 0, currency: 'USD' as const, calculated_at: new Date().toISOString() }),
      avg_request_cost: totalRequests > 0 ? sessions.reduce((sum, s) => sum + s.total_cost.total_cost_usd, 0) / totalRequests : 0,
      avg_tokens_per_request: totalRequests > 0 ? sessions.reduce((sum, s) => sum + s.total_tokens.total, 0) / totalRequests : 0,
      success_rate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      avg_latency_ms: sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.avg_latency_ms, 0) / sessions.length : 0
    };
  }

  private calculateModelBreakdown(sessions: UsageSession[]): UsageReport['model_breakdown'] {
    const breakdown: Record<string, any> = {};
    
    for (const session of sessions) {
      for (const [modelId, modelData] of Object.entries(session.model_breakdown)) {
        if (!breakdown[modelId]) {
          breakdown[modelId] = {
            usage: {
              requests: 0,
              tokens: { input: 0, output: 0, total: 0 },
              cost: { input_cost_usd: 0, output_cost_usd: 0, total_cost_usd: 0, currency: 'USD', calculated_at: new Date().toISOString() },
              percentage_of_total: 0
            },
            performance: {
              avg_latency_ms: 0,
              success_rate: 0,
              error_rate: 0
            }
          };
        }
        
        breakdown[modelId].usage.requests += modelData.requests;
        breakdown[modelId].usage.tokens.input += modelData.tokens.input;
        breakdown[modelId].usage.tokens.output += modelData.tokens.output;
        breakdown[modelId].usage.tokens.total += modelData.tokens.total;
        breakdown[modelId].usage.cost.total_cost_usd += modelData.cost.total_cost_usd;
      }
    }
    
    return breakdown;
  }

  private generateTimeSeries(sessions: UsageSession[], period: { start: string; end: string }): UsageReport['time_series'] {
    // 時系列データの生成（簡単な実装）
    const timeSeries: UsageReport['time_series'] = [];
    const startTime = new Date(period.start);
    const endTime = new Date(period.end);
    const hourInterval = 60 * 60 * 1000; // 1時間
    
    for (let time = startTime.getTime(); time <= endTime.getTime(); time += hourInterval) {
      const timestamp = new Date(time).toISOString();
      const hourSessions = sessions.filter(s => {
        const sessionTime = new Date(s.started_at).getTime();
        return sessionTime >= time && sessionTime < time + hourInterval;
      });
      
      timeSeries.push({
        timestamp,
        requests: hourSessions.reduce((sum, s) => sum + s.total_requests, 0),
        cost: hourSessions.reduce((sum, s) => sum + s.total_cost.total_cost_usd, 0),
        tokens: hourSessions.reduce((sum, s) => sum + s.total_tokens.total, 0),
        errors: hourSessions.reduce((sum, s) => sum + s.failed_requests, 0)
      });
    }
    
    return timeSeries;
  }

  private calculateCostEfficiency(sessions: UsageSession[]): UsageReport['cost_efficiency'] {
    const successfulSessions = sessions.filter(s => s.successful_requests > 0);
    const totalCost = sessions.reduce((sum, s) => sum + s.total_cost.total_cost_usd, 0);
    const totalTokens = sessions.reduce((sum, s) => sum + s.total_tokens.total, 0);
    
    return {
      cost_per_successful_task: successfulSessions.length > 0 ? totalCost / successfulSessions.length : 0,
      token_efficiency: totalTokens > 0 ? sessions.reduce((sum, s) => sum + s.total_tokens.output, 0) / totalTokens : 0,
      model_utilization: {} // モデル利用率の計算
    };
  }

  private generateRecommendations(
    summary: UsageReport['summary'], 
    modelBreakdown: UsageReport['model_breakdown']
  ): UsageReport['recommendations'] {
    const recommendations: UsageReport['recommendations'] = [];
    
    // コスト効率の分析
    if (summary.avg_request_cost > 0.10) {
      recommendations.push({
        type: 'cost_optimization',
        priority: 'high',
        description: '平均リクエストコストが高いです。より安価なモデルの使用を検討してください',
        estimated_savings_usd: summary.total_cost.total_cost_usd * 0.3,
        implementation_effort: 'medium'
      });
    }
    
    // トークン効率の分析
    if (summary.avg_tokens_per_request > 5000) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        description: 'リクエストあたりのトークン数が多いです。プロンプト最適化を検討してください',
        implementation_effort: 'easy'
      });
    }
    
    return recommendations;
  }
}