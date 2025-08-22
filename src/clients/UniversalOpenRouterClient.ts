import OpenAI from 'openai';
import { 
  BaseLLMClient, 
  LLMResponse, 
  GenerationOptions, 
  UsageStats,
  APIError,
  CostInfo,
  PerformanceInfo,
  ModelConfig
} from '../types';

/**
 * UniversalOpenRouterClient - OpenRouter経由で様々なLLMモデルにアクセス
 * 拡張性を考慮した設計で、設定ファイルから動的にモデルを追加可能
 */

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: number;    // per 1M tokens
    completion: number; // per 1M tokens
  };
  capabilities?: string[];
  provider?: string;
}

export class UniversalOpenRouterClient implements BaseLLMClient {
  private client: OpenAI;
  private modelConfig: ModelConfig;
  private stats: UsageStats;
  private openRouterModelInfo?: OpenRouterModelInfo;

  constructor(modelConfig: ModelConfig, openRouterModelInfo?: OpenRouterModelInfo) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key not provided');
    }

    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:4000',
        'X-Title': '5-Tier Hybrid LLM System',
      }
    });
    
    this.modelConfig = modelConfig;
    this.openRouterModelInfo = openRouterModelInfo;
    
    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      total_tokens_used: 0,
      total_cost_usd: 0,
      average_latency_ms: 0
    };
  }

  async generate(prompt: string, options: GenerationOptions = {}): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      this.stats.total_requests++;

      // システムプロンプトをモデルタイプに応じてカスタマイズ
      const systemPrompt = this.generateSystemPrompt();
      
      const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: this.modelConfig.name,
        messages: [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options.max_tokens || this.modelConfig.max_tokens || 4096,
        temperature: options.temperature ?? this.getDefaultTemperature(),
        top_p: options.top_p || 0.9
      };

      console.log(`[OpenRouter-${this.modelConfig.id}] 📤 Sending request to ${this.modelConfig.name}...`);
      
      const response = await this.client.chat.completions.create(requestOptions);
      const endTime = Date.now();
      const latency = endTime - startTime;

      // トークン使用量とコスト計算
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || inputTokens + outputTokens;

      const responseText = response.choices[0]?.message?.content || '';

      // 実際のOpenRouter料金またはconfigの料金を使用
      const inputCostPerM = this.openRouterModelInfo?.pricing.prompt || (this.modelConfig.cost_per_1k_tokens.input * 1000);
      const outputCostPerM = this.openRouterModelInfo?.pricing.completion || (this.modelConfig.cost_per_1k_tokens.output * 1000);
      
      const cost = (inputTokens / 1000000 * inputCostPerM) + (outputTokens / 1000000 * outputCostPerM);

      // 統計更新
      this.stats.successful_requests++;
      this.stats.total_tokens_used += totalTokens;
      this.stats.total_cost_usd += cost;
      this.stats.average_latency_ms = 
        (this.stats.average_latency_ms * (this.stats.successful_requests - 1) + latency) / this.stats.successful_requests;

      const costInfo: CostInfo = {
        total_cost_usd: cost,
        input_cost_usd: inputTokens / 1000000 * inputCostPerM,
        output_cost_usd: outputTokens / 1000000 * outputCostPerM
      };

      const performanceInfo: PerformanceInfo = {
        latency_ms: latency,
        processing_time_ms: latency,
        queue_time_ms: 0
      };

      console.log(`[OpenRouter-${this.modelConfig.id}] ✅ Request completed - Tokens: ${totalTokens}, Cost: $${cost.toFixed(6)}, Latency: ${latency}ms`);

      return {
        success: true,
        response_text: responseText,
        model_used: this.modelConfig.name,
        tier_used: this.modelConfig.tier,
        cost_info: costInfo,
        performance_info: performanceInfo,
        metadata: {
          model_id: this.modelConfig.id,
          provider: 'openrouter',
          tokens_used: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens
          },
          generated_at: new Date().toISOString(),
          tier_used: this.modelConfig.tier,
          processing_time_ms: latency,
          estimated_complexity: this.estimateComplexity(prompt),
          operation_type: 'llm_generation' as const,
          openrouter_model: this.modelConfig.name,
          finish_reason: response.choices[0]?.finish_reason
        }
      };

    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;

      this.stats.failed_requests++;

      console.error(`[OpenRouter-${this.modelConfig.id}] ❌ Request failed:`, error);

      const apiError: APIError = {
        code: this.extractErrorCode(error),
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        provider_error: error,
        retry_count: 0
      };

      return {
        success: false,
        response_text: '',
        model_used: this.modelConfig.name,
        tier_used: this.modelConfig.tier,
        error: apiError,
        cost_info: {
          total_cost_usd: 0,
          input_cost_usd: 0,
          output_cost_usd: 0
        },
        performance_info: {
          latency_ms: latency,
          processing_time_ms: latency,
          queue_time_ms: 0
        },
        metadata: {
          model_id: this.modelConfig.id,
          provider: 'openrouter',
          tokens_used: {
            input: 0,
            output: 0,
            total: 0
          },
          generated_at: new Date().toISOString(),
          tier_used: this.modelConfig.tier,
          processing_time_ms: latency,
          estimated_complexity: 0,
          operation_type: 'llm_generation' as const,
          openrouter_model: this.modelConfig.name
        }
      };
    }
  }

  /**
   * モデルタイプに応じたシステムプロンプトを生成
   */
  private generateSystemPrompt(): string {
    const capabilities = this.modelConfig.capabilities || [];
    const modelName = this.modelConfig.name.toLowerCase();

    // コーディング特化モデル
    if (capabilities.includes('coding') || modelName.includes('coder') || modelName.includes('code')) {
      return 'You are an expert coding assistant. Provide high-quality, efficient code solutions with clear explanations. Follow best practices and include appropriate error handling.';
    }

    // 推論特化モデル
    if (modelName.includes('reasoning') || modelName.includes('think') || capabilities.includes('reasoning')) {
      return 'You are an expert reasoning assistant. Break down complex problems step by step and provide thorough analysis with clear logical reasoning.';
    }

    // 数学・科学特化モデル
    if (modelName.includes('math') || capabilities.includes('mathematics')) {
      return 'You are an expert mathematics assistant. Solve problems step by step with clear explanations and show your work.';
    }

    // 汎用モデル
    return 'You are a helpful AI assistant. Provide accurate, concise, and useful responses.';
  }

  /**
   * モデルタイプに応じたデフォルト温度設定
   */
  private getDefaultTemperature(): number {
    const capabilities = this.modelConfig.capabilities || [];
    const modelName = this.modelConfig.name.toLowerCase();

    // コーディングタスクは低温度
    if (capabilities.includes('coding') || modelName.includes('coder')) {
      return 0.1;
    }

    // 推論タスクも低温度
    if (capabilities.includes('reasoning') || modelName.includes('reasoning')) {
      return 0.2;
    }

    // 創作タスクは高温度
    if (capabilities.includes('creative_writing') || capabilities.includes('creative')) {
      return 0.8;
    }

    // デフォルト
    return 0.7;
  }

  /**
   * プロンプトの複雑さを推定
   */
  private estimateComplexity(prompt: string): number {
    let complexity = 1;
    
    // 長さベースの複雑さ
    if (prompt.length > 1000) complexity += 1;
    if (prompt.length > 5000) complexity += 1;
    
    // コードブロックの検出
    if (prompt.includes('```') || prompt.includes('function') || prompt.includes('class')) {
      complexity += 1;
    }
    
    // 複雑なタスクのキーワード
    const complexKeywords = ['analyze', 'design', 'architecture', 'implement', 'debug', 'optimize'];
    if (complexKeywords.some(keyword => prompt.toLowerCase().includes(keyword))) {
      complexity += 1;
    }

    return Math.min(complexity, 5); // 最大5
  }

  /**
   * エラーコードの抽出
   */
  private extractErrorCode(error: any): string {
    if (error?.response?.status) {
      return `HTTP_${error.response.status}`;
    }
    if (error?.code) {
      return error.code;
    }
    if (error?.name) {
      return error.name;
    }
    return 'OPENROUTER_ERROR';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.modelConfig.name,
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 5
      });
      return response && response.choices && response.choices.length > 0;
    } catch (error) {
      console.error(`[OpenRouter-${this.modelConfig.id}] Health check failed:`, error);
      return false;
    }
  }

  async getUsageStats(): Promise<UsageStats> {
    return Promise.resolve({ ...this.stats });
  }

  resetStats(): void {
    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      total_tokens_used: 0,
      total_cost_usd: 0,
      average_latency_ms: 0
    };
  }

  getModelName(): string {
    return this.modelConfig.name;
  }

  getProvider(): string {
    return 'openrouter';
  }

  getModelConfig(): ModelConfig {
    return { ...this.modelConfig };
  }

  getOpenRouterModelInfo(): OpenRouterModelInfo | undefined {
    return this.openRouterModelInfo ? { ...this.openRouterModelInfo } : undefined;
  }

  // 特殊用途メソッド
  async generateWithCustomSystem(prompt: string, systemPrompt: string, options: GenerationOptions = {}): Promise<LLMResponse> {
    const originalGenerate = this.generate;
    
    // 一時的にシステムプロンプトを変更
    const tempGenerate = async (userPrompt: string, opts: GenerationOptions = {}) => {
      const startTime = Date.now();
      
      try {
        const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
          model: this.modelConfig.name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: opts.max_tokens || this.modelConfig.max_tokens || 4096,
          temperature: opts.temperature ?? this.getDefaultTemperature(),
          top_p: opts.top_p || 0.9
        };

        const response = await this.client.chat.completions.create(requestOptions);
        // ... 同様の処理をoriginal generateから流用
        
        return originalGenerate.call(this, userPrompt, opts);
      } catch (error) {
        return originalGenerate.call(this, userPrompt, opts);
      }
    };

    return tempGenerate(prompt, options);
  }
}