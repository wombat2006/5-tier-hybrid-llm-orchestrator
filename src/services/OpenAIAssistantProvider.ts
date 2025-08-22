// OpenAI Assistant APIを活用したシンプルなCapabilityProvider実装

import { OpenAI } from 'openai';
import { LLMRequest, LLMResponse, ResponseMetadata, CostInfo, PerformanceInfo } from '../types/index';
import { CapabilityProvider, CapabilityUsageStats } from '../types/capability';
import { 
  AssistantConfig, 
  AssistantProvider, 
  AssistantRequest, 
  AssistantResponse,
  AssistantUsageStats 
} from '../types/assistant';

export class OpenAIAssistantProvider implements AssistantProvider {
  public readonly name = 'OpenAIAssistantProvider';
  public readonly version = '1.0.0';
  public readonly supported_task_types = [
    'rag_search', 
    'document_query', 
    'semantic_search',
    'file_search',
    'code_interpreter',
    'general_assistant'
  ];

  private client: OpenAI;
  private config: AssistantConfig;
  private stats: AssistantUsageStats;

  constructor(config: AssistantConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.openai_api_key,
    });
    
    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      average_latency_ms: 0,
      total_cost_usd: 0,
      last_24h_requests: 0,
      error_rate: 0,
      uptime_percentage: 100,
      threads_created: 0,
      files_processed: 0,
      vector_stores_created: 0,
      code_executions: 0,
      file_searches: 0,
      total_run_time_seconds: 0
    };
  }

  canHandle(request: LLMRequest): boolean {
    const assistantRequest = request as AssistantRequest;
    
    // OpenAI Assistant APIが得意とするタスク
    if (this.supported_task_types.includes(request.task_type || '')) {
      return true;
    }
    
    // ファイル処理が含まれる場合
    if (assistantRequest.files && assistantRequest.files.length > 0) {
      return true;
    }
    
    // 複雑な分析タスク
    if (request.task_type === 'complex_analysis' || request.task_type === 'premium') {
      return true;
    }
    
    return false;
  }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    console.log(`[OpenAIAssistant] 🤖 Processing request: ${request.task_type}`);
    
    const startTime = Date.now();
    this.stats.total_requests++;
    
    try {
      const assistantRequest = request as AssistantRequest;
      
      // スレッド作成またはexisting threadを使用
      let threadId = assistantRequest.thread_id;
      if (!threadId) {
        threadId = await this.createThread();
        this.stats.threads_created++;
      }

      // Assistant作成（またはexistingを使用）
      let assistantId = assistantRequest.assistant_id;
      if (!assistantId) {
        assistantId = await this.createAssistant({
          model: this.config.model,
          tools: this.inferRequiredTools(assistantRequest),
          temperature: this.config.temperature
        });
      }

      // メッセージをスレッドに追加
      await this.client.beta.threads.messages.create(threadId, {
        role: 'user',
        content: request.prompt,
        attachments: assistantRequest.files?.map(f => ({
          file_id: f.file_id,
          tools: [{ type: 'file_search' as const }]
        }))
      });

      // 実行
      const run = await this.client.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        additional_instructions: assistantRequest.additional_instructions,
      });

      // 実行完了を待機
      const completedRun = await this.waitForRunCompletion(threadId, run.id);
      
      // 結果を取得
      const messages = await this.client.beta.threads.messages.list(threadId, {
        limit: 1,
        order: 'desc'
      });

      const latency = Date.now() - startTime;
      const response = this.buildResponse(
        completedRun, 
        messages.data[0], 
        threadId, 
        assistantId, 
        run.id, 
        latency
      );

      this.stats.successful_requests++;
      this.updateStats(latency, response.cost_info.total_cost_usd, true);
      
      console.log(`[OpenAIAssistant] ✅ Request completed: ${response.success}, Cost: $${response.cost_info.total_cost_usd.toFixed(6)}`);
      
      return response;

    } catch (error) {
      const latency = Date.now() - startTime;
      this.stats.failed_requests++;
      this.updateStats(latency, 0, false);
      
      console.error('[OpenAIAssistant] ❌ Request failed:', error);
      
      return {
        success: false,
        model_used: this.config.model,
        tier_used: 2, // Assistant APIはTier 2相当
        error: {
          code: 'ASSISTANT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          provider_error: error
        },
        cost_info: {
          total_cost_usd: 0,
          input_cost_usd: 0,
          output_cost_usd: 0
        },
        performance_info: {
          latency_ms: Date.now() - startTime,
          processing_time_ms: Date.now() - startTime,
          fallback_used: false,
          tier_escalation: false
        },
        metadata: {
          model_id: this.config.model,
          provider: 'openai_assistant',
          tokens_used: { input: 0, output: 0, total: 0 },
          tier_used: 2,
          processing_time_ms: Date.now() - startTime,
          estimated_complexity: 0,
          generated_at: new Date().toISOString(),
          operation_type: this.inferOperationType(request.task_type)
        }
      };
    }
  }

  // Thread管理
  async createThread(): Promise<string> {
    const thread = await this.client.beta.threads.create();
    return thread.id;
  }

  async deleteThread(thread_id: string): Promise<void> {
    await this.client.beta.threads.delete(thread_id);
  }

  // Assistant管理
  async createAssistant(config: Partial<AssistantConfig>): Promise<string> {
    const assistant = await this.client.beta.assistants.create({
      name: 'Hybrid LLM Assistant',
      instructions: 'You are a helpful assistant integrated with a 5-tier hybrid LLM system.',
      model: config.model || this.config.model,
      tools: config.tools || this.config.tools,
      temperature: config.temperature || this.config.temperature,
    });
    return assistant.id;
  }

  async updateAssistant(assistant_id: string, config: Partial<AssistantConfig>): Promise<void> {
    await this.client.beta.assistants.update(assistant_id, {
      model: config.model,
      tools: config.tools,
      temperature: config.temperature,
    });
  }

  async deleteAssistant(assistant_id: string): Promise<void> {
    await this.client.beta.assistants.delete(assistant_id);
  }

  // File管理
  async uploadFile(file_path: string, purpose: 'assistants' | 'vision' = 'assistants'): Promise<string> {
    const fs = await import('fs');
    const file = await this.client.files.create({
      file: fs.createReadStream(file_path),
      purpose,
    });
    this.stats.files_processed++;
    return file.id;
  }

  async deleteFile(file_id: string): Promise<void> {
    await this.client.files.delete(file_id);
  }

  // Vector Store管理 (注意: OpenAI SDK のバージョンによっては利用できない場合があります)
  async createVectorStore(name: string, file_ids?: string[]): Promise<string> {
    // TODO: OpenAI SDK version compatibility check
    try {
      const vectorStore = await (this.client.beta as any).vectorStores?.create({
        name,
        file_ids,
      });
      if (vectorStore) {
        this.stats.vector_stores_created++;
        return vectorStore.id;
      }
      throw new Error('Vector Store API not available');
    } catch (error) {
      console.warn('[OpenAIAssistant] Vector Store creation failed:', error);
      throw new Error('Vector Store functionality not supported in current OpenAI SDK version');
    }
  }

  async addFilesToVectorStore(vector_store_id: string, file_ids: string[]): Promise<void> {
    try {
      await (this.client.beta as any).vectorStores?.fileBatches.create(vector_store_id, {
        file_ids,
      });
    } catch (error) {
      console.warn('[OpenAIAssistant] Vector Store file addition failed:', error);
      throw new Error('Vector Store functionality not supported in current OpenAI SDK version');
    }
  }

  async deleteVectorStore(vector_store_id: string): Promise<void> {
    try {
      await (this.client.beta as any).vectorStores?.delete(vector_store_id);
    } catch (error) {
      console.warn('[OpenAIAssistant] Vector Store deletion failed:', error);
      throw new Error('Vector Store functionality not supported in current OpenAI SDK version');
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  async getUsageStats(): Promise<CapabilityUsageStats> {
    return { ...this.stats };
  }

  async estimateCost(request: LLMRequest): Promise<number> {
    // 簡単な見積もり（実際の使用量で後から調整）
    const estimatedInputTokens = Math.ceil(request.prompt.length / 4);
    const estimatedOutputTokens = 500; // 平均的な出力長
    
    const inputCost = (estimatedInputTokens / 1000) * this.config.cost_per_1k_input_tokens;
    const outputCost = (estimatedOutputTokens / 1000) * this.config.cost_per_1k_output_tokens;
    
    return inputCost + outputCost;
  }

  async initialize(config: any): Promise<void> {
    if (config.openai_api_key) {
      this.config.openai_api_key = config.openai_api_key;
      this.client = new OpenAI({ apiKey: config.openai_api_key });
    }
  }

  async shutdown(): Promise<void> {
    // クリーンアップ処理
  }

  // Private helper methods
  private inferRequiredTools(request: AssistantRequest) {
    const tools: any[] = [];
    
    // タスクタイプに基づいてツールを推論
    if (request.task_type === 'code_interpreter' || 
        (request.prompt && request.prompt.includes('code'))) {
      tools.push({ type: 'code_interpreter' });
      this.stats.code_executions++;
    }
    
    if (request.task_type === 'file_search' || 
        request.files?.length || 
        request.task_type === 'rag_search' ||
        request.task_type === 'document_query') {
      tools.push({ type: 'file_search' });
      this.stats.file_searches++;
    }
    
    return tools.length > 0 ? tools : [{ type: 'file_search' }];
  }

  private inferFileTools(file: any) {
    // ファイル拡張子に基づいてツールを推論
    if (file.filename?.endsWith('.py') || file.filename?.endsWith('.js') || file.filename?.endsWith('.ts')) {
      return [{ type: 'code_interpreter' }];
    }
    return [{ type: 'file_search' }];
  }

  private async waitForRunCompletion(threadId: string, runId: string, maxWaitMs = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const run = await this.client.beta.threads.runs.retrieve(threadId, runId as any);
      
      if (run.status === 'completed') {
        return run;
      } else if (run.status === 'failed' || run.status === 'expired') {
        throw new Error(`Run failed with status: ${run.status}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
    }
    
    throw new Error('Run timeout');
  }

  private buildResponse(
    run: any, 
    message: any, 
    threadId: string, 
    assistantId: string, 
    runId: string, 
    latency: number
  ): AssistantResponse {
    
    // コスト計算（usage情報から）
    const inputTokens = run.usage?.prompt_tokens || 0;
    const outputTokens = run.usage?.completion_tokens || 0;
    
    const cost_info: CostInfo = {
      input_cost_usd: (inputTokens / 1000) * this.config.cost_per_1k_input_tokens,
      output_cost_usd: (outputTokens / 1000) * this.config.cost_per_1k_output_tokens,
      total_cost_usd: 0
    };
    cost_info.total_cost_usd = cost_info.input_cost_usd + cost_info.output_cost_usd;

    const metadata: ResponseMetadata = {
      model_id: run.model || this.config.model,
      provider: 'openai_assistant',
      tokens_used: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      },
      tier_used: 2,
      processing_time_ms: latency,
      estimated_complexity: outputTokens / 100, // 出力長ベースの複雑性推定
      generated_at: new Date().toISOString(),
      operation_type: 'llm_generation'
    };

    return {
      success: true,
      model_used: run.model || this.config.model,
      tier_used: 2,
      response_text: message?.content?.[0]?.text?.value || '',
      metadata,
      cost_info,
      performance_info: {
        latency_ms: latency,
        processing_time_ms: latency,
        fallback_used: false,
        tier_escalation: false
      },
      thread_id: threadId,
      assistant_id: assistantId,
      run_id: runId,
      tools_used: run.tools?.map((t: any) => t.type) || []
    };
  }

  private updateStats(latency: number, cost: number, success: boolean) {
    this.stats.average_latency_ms = 
      (this.stats.average_latency_ms * (this.stats.total_requests - 1) + latency) / this.stats.total_requests;
    
    this.stats.total_cost_usd += cost;
    this.stats.error_rate = this.stats.failed_requests / this.stats.total_requests;
    
    if (success) {
      this.stats.total_run_time_seconds += latency / 1000;
    }
  }

  private inferOperationType(task_type?: string) {
    switch (task_type) {
      case 'code_interpreter': return 'code_execution';
      case 'file_search': return 'file_search';
      case 'rag_search':
      case 'document_query': return 'vector_search';
      default: return 'llm_generation';
    }
  }
}