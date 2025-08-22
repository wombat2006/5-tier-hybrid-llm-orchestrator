// 厳密なコスト・トークン管理システム型定義

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cached?: number; // キャッシュされたトークン
  reasoning?: number; // 推論トークン（o3等）
}

// Vector操作など非LLMオペレーション用の使用量定義
export interface OperationUsage {
  operation_type: 'embedding' | 'vector_search' | 'vector_upsert' | 'vector_delete' | 
                  'file_upload' | 'file_download' | 'file_search' |
                  'code_execution' | 'container_startup' | 'custom';
  operation_count: number;
  data_volume?: number; // bytes, vectors, files等
  execution_time_ms?: number;
  resources_used?: Record<string, number>; // CPU, memory等
}

export interface CostBreakdown {
  input_cost_usd: number;
  output_cost_usd: number;
  cached_cost_usd?: number;
  reasoning_cost_usd?: number;
  operation_cost_usd?: number; // Vector/File/Code操作コスト
  total_cost_usd: number;
  currency: 'USD';
  calculated_at: string; // ISO timestamp
  operation_breakdown?: Record<string, number>; // 操作別内訳
}

export interface ModelPricing {
  model_id: string;
  provider: string;
  input_price_per_1k: number;
  output_price_per_1k: number;
  cached_price_per_1k?: number;
  reasoning_price_per_1k?: number;
  minimum_charge?: number;
  free_tier?: {
    requests_per_month?: number;
    tokens_per_month?: number;
    reset_day?: number; // 1-31
  };
  last_updated: string;
}

export interface UsageSession {
  session_id: string;
  started_at: string;
  completed_at?: string;
  status: 'active' | 'completed' | 'failed' | 'timeout';
  user_id?: string;
  project_id?: string;
  
  // リクエスト統計
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  cached_requests: number;
  
  // トークン統計
  total_tokens: TokenUsage;
  model_breakdown: Record<string, {
    requests: number;
    tokens: TokenUsage;
    cost: CostBreakdown;
    avg_latency_ms: number;
    errors: number;
  }>;
  
  // コスト統計
  total_cost: CostBreakdown;
  estimated_cost: CostBreakdown; // リクエスト前の見積もり
  cost_variance: number; // 見積もりとの差異パーセント
  
  // パフォーマンス統計
  total_latency_ms: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  min_latency_ms: number;
}

export interface BudgetConfig {
  monthly_budget_usd: number;
  daily_budget_usd?: number;
  hourly_budget_usd?: number;
  
  // 警告しきい値
  warning_threshold: number; // 0.0-1.0 (例: 0.8 = 80%)
  critical_threshold: number; // 0.0-1.0 (例: 0.95 = 95%)
  
  // 制限設定
  auto_pause_at_limit: boolean;
  max_request_cost_usd?: number; // 単一リクエストの最大コスト
  max_session_cost_usd?: number; // セッション単位の最大コスト
  
  // 通知設定
  notification_webhook?: string;
  notification_email?: string;
  
  // リセット設定
  budget_reset_day: number; // 1-31, 月間予算リセット日
  timezone: string; // IANA timezone (例: 'Asia/Tokyo')
}

export interface CostAlert {
  id: string;
  type: 'warning' | 'critical' | 'limit_reached' | 'budget_exceeded';
  message: string;
  current_usage_usd: number;
  budget_limit_usd: number;
  usage_percentage: number;
  model_breakdown?: Record<string, number>;
  triggered_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
  acknowledged_by?: string;
}

export interface UsageReport {
  period: {
    start: string;
    end: string;
    type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  };
  
  summary: {
    total_requests: number;
    total_tokens: TokenUsage;
    total_cost: CostBreakdown;
    avg_request_cost: number;
    avg_tokens_per_request: number;
    success_rate: number;
    avg_latency_ms: number;
  };
  
  model_breakdown: Record<string, {
    usage: {
      requests: number;
      tokens: TokenUsage;
      cost: CostBreakdown;
      percentage_of_total: number;
    };
    performance: {
      avg_latency_ms: number;
      success_rate: number;
      error_rate: number;
    };
  }>;
  
  time_series: Array<{
    timestamp: string;
    requests: number;
    cost: number;
    tokens: number;
    errors: number;
  }>;
  
  cost_efficiency: {
    cost_per_successful_task: number;
    token_efficiency: number; // successful_outputs / total_tokens
    model_utilization: Record<string, number>; // utilization percentage
  };
  
  recommendations: Array<{
    type: 'cost_optimization' | 'performance' | 'model_selection';
    priority: 'low' | 'medium' | 'high';
    description: string;
    estimated_savings_usd?: number;
    implementation_effort: 'easy' | 'medium' | 'hard';
  }>;
}

export interface CostTracker {
  // リアルタイム使用量追跡
  trackUsage(session_id: string, model_id: string, tokens: TokenUsage, cost: CostBreakdown): Promise<void>;
  
  // 見積もり計算
  estimateCost(model_id: string, estimated_tokens: Partial<TokenUsage>): Promise<CostBreakdown>;
  
  // セッション管理
  startSession(session_id: string, metadata?: Record<string, any>): Promise<UsageSession>;
  endSession(session_id: string): Promise<UsageSession>;
  getSession(session_id: string): Promise<UsageSession | null>;
  
  // 予算チェック
  checkBudgetStatus(): Promise<{
    current_usage: number;
    remaining_budget: number;
    can_proceed: boolean;
    warnings: CostAlert[];
  }>;
  
  // 統計とレポート
  generateReport(period: { start: string; end: string }): Promise<UsageReport>;
  getUsageStats(model_id?: string): Promise<any>;
  
  // 予算管理
  setBudget(config: BudgetConfig): Promise<void>;
  getBudget(): Promise<BudgetConfig>;
  
  // アラート管理
  getAlerts(unacknowledged_only?: boolean): Promise<CostAlert[]>;
  acknowledgeAlert(alert_id: string, user_id?: string): Promise<void>;
}

export interface ModelPricingManager {
  // 価格設定管理
  updatePricing(model_id: string, pricing: ModelPricing): Promise<void>;
  getPricing(model_id: string): Promise<ModelPricing | null>;
  getAllPricing(): Promise<Record<string, ModelPricing>>;
  
  // 価格計算
  calculateCost(model_id: string, tokens: TokenUsage): Promise<CostBreakdown>;
  
  // 価格比較
  compareCosts(models: string[], tokens: TokenUsage): Promise<Record<string, CostBreakdown>>;
  
  // 自動価格更新
  refreshPricing(): Promise<void>;
}

// 実装インターフェース
export interface CostManagementSystem {
  tracker: CostTracker;
  pricing: ModelPricingManager;
  
  // システム初期化
  initialize(config: BudgetConfig): Promise<void>;
  
  // リクエスト前チェック
  preRequestCheck(model_id: string, estimated_tokens: Partial<TokenUsage>): Promise<{
    approved: boolean;
    estimated_cost: CostBreakdown;
    warnings: string[];
    reason?: string;
  }>;
  
  // リクエスト後処理
  postRequestProcessing(
    session_id: string, 
    model_id: string, 
    actual_tokens: TokenUsage, 
    latency_ms: number,
    success: boolean,
    error?: Error
  ): Promise<void>;
  
  // 健全性チェック
  healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    budget_status: string;
    active_sessions: number;
    recent_errors: number;
    system_recommendations: string[];
  }>;

  // コスト最適化提案
  suggestCostOptimizations(): Promise<{
    current_monthly_spend: number;
    projected_monthly_spend: number;
    optimizations: Array<{
      type: 'model_switch' | 'usage_pattern' | 'batch_processing' | 'caching';
      description: string;
      estimated_savings: number;
      implementation_effort: 'low' | 'medium' | 'high';
      priority: 'low' | 'medium' | 'high';
    }>;
  }>;

  // リアルタイムダッシュボード
  getRealTimeDashboard(): Promise<{
    current_cost: number;
    hourly_rate: number;
    budget_remaining: number;
    top_models: Array<{ model: string; cost: number; percentage: number }>;
    recent_activity: Array<{ timestamp: string; model: string; cost: number; success: boolean }>;
    alerts: number;
  }>;
}