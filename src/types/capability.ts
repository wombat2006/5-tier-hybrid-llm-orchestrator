// CapabilityProviderパターンの実装
// LLMOrchestratorの肥大化を防ぎ、新機能を効率的に統合するための抽象化

import { LLMRequest, LLMResponse } from './index';

export interface CapabilityProvider {
  readonly name: string;
  readonly version: string;
  readonly supported_task_types: string[];
  
  /**
   * このプロバイダーが指定されたリクエストを処理できるかを判定
   * @param request 処理対象のリクエスト
   * @returns 処理可能な場合true
   */
  canHandle(request: LLMRequest): boolean;
  
  /**
   * リクエストを処理して結果を返す
   * @param request 処理対象のリクエスト
   * @returns 処理結果
   */
  execute(request: LLMRequest): Promise<LLMResponse>;
  
  /**
   * プロバイダーの健康状態をチェック
   * @returns 健康な場合true
   */
  isHealthy(): Promise<boolean>;
  
  /**
   * 使用統計を取得
   * @returns 使用統計データ
   */
  getUsageStats(): Promise<CapabilityUsageStats>;
  
  /**
   * リクエストのコストを事前見積もり
   * @param request 見積もり対象のリクエスト
   * @returns 推定コスト (USD)
   */
  estimateCost(request: LLMRequest): Promise<number>;
  
  /**
   * プロバイダーを初期化
   * @param config 設定オブジェクト
   */
  initialize(config: any): Promise<void>;
  
  /**
   * プロバイダーを終了処理
   */
  shutdown(): Promise<void>;
}

export interface CapabilityUsageStats {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  average_latency_ms: number;
  total_cost_usd: number;
  last_24h_requests: number;
  error_rate: number;
  uptime_percentage: number;
}

// 特殊なCapabilityProvider - LLM処理用
export interface LLMCapabilityProvider extends CapabilityProvider {
  readonly provider: 'alibaba_cloud' | 'google' | 'anthropic' | 'openai';
  readonly model_id: string;
  readonly tier: 0 | 1 | 2 | 3;
  readonly max_tokens: number;
  readonly cost_per_1k_tokens: {
    input: number;
    output: number;
  };
}

// Vector Storage専用CapabilityProvider
export interface VectorCapabilityProvider extends CapabilityProvider {
  readonly provider: 'pinecone' | 'weaviate' | 'chromadb' | 'local';
  readonly index_name: string;
  readonly dimension: number;
}

// File Storage専用CapabilityProvider
export interface FileCapabilityProvider extends CapabilityProvider {
  readonly provider: 's3' | 'azure_blob' | 'gcs' | 'local';
  readonly bucket_name?: string;
  readonly container_name?: string;
}

// Code Execution専用CapabilityProvider
export interface CodeCapabilityProvider extends CapabilityProvider {
  readonly executor_type: 'docker' | 'sandbox' | 'lambda';
  readonly supported_languages: string[];
  readonly max_execution_time_ms: number;
  readonly max_memory_mb: number;
}

// CapabilityProviderの登録・管理用レジストリ
export interface CapabilityRegistry {
  /**
   * CapabilityProviderを登録
   * @param provider 登録するプロバイダー
   */
  register(provider: CapabilityProvider): void;
  
  /**
   * CapabilityProviderを登録解除
   * @param name プロバイダー名
   */
  unregister(name: string): void;
  
  /**
   * リクエストに最適なプロバイダーを選択
   * @param request 処理リクエスト
   * @returns 選択されたプロバイダー、または null
   */
  findBestProvider(request: LLMRequest): CapabilityProvider | null;
  
  /**
   * ルーティング情報を含む最適なプロバイダーを選択
   * @param request 処理リクエスト
   * @returns プロバイダーとルーティング情報
   */
  findBestProviderWithRouting(request: LLMRequest): { provider: CapabilityProvider | null; routing: RoutingInfo };
  
  /**
   * プロバイダーのメトリクスを更新
   * @param providerName プロバイダー名
   * @param success 成功/失敗
   * @param latency レイテンシ (ms)
   * @param cost コスト (USD)
   * @param errorCode エラーコード (オプション)
   */
  updateMetrics(providerName: string, success: boolean, latency: number, cost: number, errorCode?: string): void;
  
  /**
   * タスクタイプに対応するプロバイダー一覧を取得
   * @param task_type タスクタイプ
   * @returns 対応プロバイダー一覧
   */
  getProvidersForTaskType(task_type: string): CapabilityProvider[];
  
  /**
   * 全プロバイダー一覧を取得
   * @returns 登録済みプロバイダー一覧
   */
  getAllProviders(): CapabilityProvider[];
  
  /**
   * プロバイダーの健康状態を一括チェック
   * @returns プロバイダー名 -> 健康状態のマップ
   */
  checkAllHealth(): Promise<Record<string, boolean>>;
  
  /**
   * 全プロバイダーの使用統計を取得
   * @returns プロバイダー名 -> 使用統計のマップ
   */
  getAllStats(): Promise<Record<string, CapabilityUsageStats>>;
}

// CapabilityProviderの選択戦略
export interface ProviderSelectionStrategy {
  /**
   * 複数の候補から最適なプロバイダーを選択
   * @param candidates 候補プロバイダー一覧
   * @param request 処理リクエスト
   * @returns 選択されたプロバイダー
   */
  select(candidates: CapabilityProvider[], request: LLMRequest): CapabilityProvider | null;
}

// 組み込みの選択戦略
export type BuiltinSelectionStrategy = 
  | 'cost_optimized'      // コスト重視
  | 'performance_first'   // 性能重視  
  | 'balanced'           // バランス重視
  | 'reliability_first'; // 信頼性重視

// CapabilityProvider用のメトリクス収集インターフェース
export interface CapabilityMetrics {
  provider_name: string;
  request_count: number;
  success_rate: number;
  average_latency_ms: number;
  total_cost_usd: number;
  error_distribution: Record<string, number>;
  last_updated: string;
}

// リクエストルーティング情報
export interface RoutingInfo {
  selected_provider: string;
  selection_reason: string;
  alternatives_considered: string[];
  routing_latency_ms: number;
  cost_estimate_usd: number;
}