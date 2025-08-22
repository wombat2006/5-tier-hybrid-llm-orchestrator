// 5層ハイブリッドLLMシステム型定義

export interface ModelConfig {
  id: string;
  name: string;
  provider: 'alibaba_cloud' | 'google' | 'anthropic' | 'openai' | 'openrouter';
  tier: 0 | 1 | 2 | 3;
  cost_per_1k_tokens: {
    input: number;
    output: number;
  };
  latency_ms: number;
  max_tokens: number;
  capabilities: string[];
  languages?: string[];
  priority_keywords: string[];
  api_client: string;
}

export interface SystemConfig {
  models: Record<string, ModelConfig>;
  routing: RoutingConfig;
  collaboration: CollaborationConfig;
  cost_management: CostManagementConfig;
  external_apis: Record<string, ExternalAPIConfig>;
}

export interface RoutingConfig {
  default_tier: number;
  fallback_enabled: boolean;
  max_retries: number;
  timeout_ms: number;
  task_classification: Record<string, TaskClassificationRule>;
}

export interface TaskClassificationRule {
  keywords: string[];
  preferred_tier: number;
}

export interface CollaborationConfig {
  cascade_enabled: boolean;
  refinement_enabled: boolean;
  parallel_enabled: boolean;
  quality_thresholds: QualityThresholds;
}

export interface QualityThresholds {
  min_response_length: number;
  max_error_rate: number;
  min_confidence_score: number;
}

export interface CostManagementConfig {
  monthly_budget_usd: number;
  tier0_allocation: number;
  tier1_allocation: number;
  tier2_allocation: number;
  tier3_allocation: number;
  cost_alerts: {
    warning_threshold: number;
    critical_threshold: number;
  };
}

export interface ExternalAPIConfig {
  provider: string;
  cost_per_request?: number;
  // Vector Storage固有設定
  index_name?: string;
  dimension?: number;
  metric?: 'cosine' | 'euclidean' | 'dotproduct';
  cost_per_embedding?: number;
  cost_per_search?: number;
  cost_per_upsert?: number;
  cost_per_delete?: number;
  max_batch_size?: number;
  // File Storage固有設定
  cost_per_upload?: number;
  cost_per_download?: number;
  max_file_size_mb?: number;
  supported_formats?: string[];
  // Code Execution固有設定
  cost_per_execution?: number;
  max_execution_time_ms?: number;
  max_memory_mb?: number;
  supported_languages?: string[];
  // OpenAI Assistant API固有設定
  model?: string;
  tools?: Array<{ type: string }>;
  temperature?: number;
  max_prompt_tokens?: number;
  max_completion_tokens?: number;
  cost_per_1k_input_tokens?: number;
  cost_per_1k_output_tokens?: number;
  vector_store_cost_per_gb_day?: number;
  file_search_cost_per_session?: number;
  code_interpreter_cost_per_session?: number;
}

export interface LLMRequest {
  prompt: string;
  user_metadata?: UserMetadata;
  task_type?: TaskType;
  preferred_tier?: number;
  context?: ConversationContext;
}

export interface UserMetadata {
  user_id?: string;
  session_id?: string;
  task_type?: TaskType;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  budget_limit?: number;
  language?: string;
  include_tests?: boolean;
  endpoint?: string;
}

export type TaskType = 'coding' | 'general' | 'complex_analysis' | 'premium' | 'auto' |
                     'rag_search' | 'document_query' | 'semantic_search' | 'vector_upsert' | 'vector_delete' |
                     'file_search' | 'code_interpreter' | 'general_assistant';

export interface ConversationContext {
  previous_responses?: LLMResponse[];
  conversation_id?: string;
  turn_count?: number;
}

export interface LLMResponse {
  success: boolean;
  model_used: string;
  tier_used: number;
  response_text?: string;
  metadata: ResponseMetadata;
  error?: APIError;
  cost_info: CostInfo;
  performance_info: PerformanceInfo;
}

export interface ResponseMetadata {
  model_id: string;
  provider: string;
  tokens_used: {
    input: number;
    output: number;
    total: number;
  };
  confidence_score?: number;
  quality_score?: number;
  generated_at: string;
  session_id?: string;
  subtasks_completed?: number;
  qwen3_usage?: number;
  claude_usage?: number;
  tier_used: number;
  processing_time_ms: number;
  estimated_complexity: number;
  operation_type?: 'embedding' | 'vector_search' | 'vector_upsert' | 'vector_delete' | 
                  'file_upload' | 'file_download' | 'file_search' |
                  'code_execution' | 'container_startup' | 'custom' | 'llm_generation';
  routing_info?: any;
  capability_provider?: string;
  openrouter_model?: string;
  finish_reason?: string;
}

export interface APIError {
  code: string;
  message: string;
  provider_error?: any;
  retry_count?: number;
}

export interface CostInfo {
  total_cost_usd: number;
  input_cost_usd: number;
  output_cost_usd: number;
  monthly_spend_percentage?: number;
}

export interface PerformanceInfo {
  latency_ms: number;
  processing_time_ms: number;
  queue_time_ms?: number;
  fallback_used?: boolean;
  tier_escalation?: boolean;
  collaborative_session?: boolean;
}

// APIクライアントインターフェース
export interface BaseLLMClient {
  generate(prompt: string, options?: GenerationOptions): Promise<LLMResponse>;
  isHealthy(): Promise<boolean>;
  getUsageStats(): Promise<UsageStats>;
}

export interface GenerationOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  timeout_ms?: number;
  metadata?: Record<string, any>;
}

export interface UsageStats {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  average_latency_ms: number;
  total_tokens_used: number;
  total_cost_usd: number;
}

// Qwen3 Coder専用型定義
export interface QwenRequest {
  model: string;
  input: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
  };
  parameters: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
}

export interface QwenResponse {
  output: {
    choices: Array<{
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }>;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  request_id: string;
}

// 協調メカニズム用型定義
export interface CollaborationRequest {
  primary_response: LLMResponse;
  collaboration_type: 'cascade' | 'refinement' | 'parallel';
  target_tier?: number;
  refinement_instructions?: string;
}

export interface CollaborationResponse {
  final_response: LLMResponse;
  collaboration_chain: LLMResponse[];
  total_cost: CostInfo;
  total_time_ms: number;
}

// メトリクス・監視用型定義
export interface SystemMetrics {
  requests_per_tier: Record<number, number>;
  success_rate_per_tier: Record<number, number>;
  average_latency_per_tier: Record<number, number>;
  cost_per_tier: Record<number, number>;
  total_monthly_spend: number;
  budget_utilization_percentage: number;
  most_used_capabilities: string[];
  error_distribution: Record<string, number>;
}