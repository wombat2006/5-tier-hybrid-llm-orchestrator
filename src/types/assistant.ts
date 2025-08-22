// OpenAI Assistant API統合型定義

import { LLMRequest, LLMResponse, PerformanceInfo, CostInfo } from './index';
import { CapabilityProvider, CapabilityUsageStats } from './capability';

export interface AssistantConfig {
  openai_api_key: string;
  model: string;
  tools: AssistantTool[];
  temperature?: number;
  top_p?: number;
  max_prompt_tokens?: number;
  max_completion_tokens?: number;
  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
}

export type AssistantTool = 
  | { type: 'code_interpreter' }
  | { type: 'file_search' }
  | { type: 'function'; function: AssistantFunction };

export interface AssistantFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AssistantRequest extends LLMRequest {
  files?: AssistantFile[];
  thread_id?: string;
  assistant_id?: string;
  vector_store_ids?: string[];
  additional_instructions?: string;
}

export interface AssistantFile {
  file_id: string;
  filename: string;
  purpose: 'assistants' | 'vision';
}

export interface AssistantResponse extends LLMResponse {
  thread_id: string;
  assistant_id: string;
  run_id: string;
  files_used?: string[];
  tools_used?: string[];
}

export interface AssistantProvider extends CapabilityProvider {
  // Thread管理
  createThread(): Promise<string>;
  deleteThread(thread_id: string): Promise<void>;
  
  // Assistant管理
  createAssistant(config: Partial<AssistantConfig>): Promise<string>;
  updateAssistant(assistant_id: string, config: Partial<AssistantConfig>): Promise<void>;
  deleteAssistant(assistant_id: string): Promise<void>;
  
  // File管理
  uploadFile(file_path: string, purpose?: 'assistants' | 'vision'): Promise<string>;
  deleteFile(file_id: string): Promise<void>;
  
  // Vector Store管理
  createVectorStore(name: string, file_ids?: string[]): Promise<string>;
  addFilesToVectorStore(vector_store_id: string, file_ids: string[]): Promise<void>;
  deleteVectorStore(vector_store_id: string): Promise<void>;
}

// 使用統計
export interface AssistantUsageStats extends CapabilityUsageStats {
  threads_created: number;
  files_processed: number;
  vector_stores_created: number;
  code_executions: number;
  file_searches: number;
  total_run_time_seconds: number;
}