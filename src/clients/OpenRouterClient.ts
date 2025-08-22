import OpenAI from 'openai';
import { 
  BaseLLMClient, 
  LLMResponse, 
  GenerationOptions, 
  UsageStats,
  APIError,
  CostInfo,
  PerformanceInfo
} from '../types';

/**
 * OpenRouterAPIClient - OpenRouter経由でQwen3-Coderなど様々なモデルにアクセス
 * OpenRouter API（https://openrouter.ai/）を通じてQwen3-Coderを使用
 */
export class OpenRouterAPIClient implements BaseLLMClient {
  private client: OpenAI;
  private modelName: string;
  private stats: UsageStats;

  constructor(modelName: string = 'qwen/qwen-3-coder-32b-instruct') {
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
    
    this.modelName = modelName;
    
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

      // OpenRouter APIリクエスト設定（OpenAI互換）
      const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: 'You are Qwen3-Coder, a specialized AI assistant optimized for coding tasks. Provide high-quality, efficient code solutions with clear explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options.max_tokens || 4096,
        temperature: options.temperature || 0.1,
        top_p: options.top_p || 0.8
      };

      console.log(`[OpenRouter] 📤 Sending request to ${this.modelName}...`);
      
      const response = await this.client.chat.completions.create(requestOptions);
      const endTime = Date.now();
      const latency = endTime - startTime;

      // トークン使用量取得
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || inputTokens + outputTokens;

      // レスポンステキスト抽出
      const responseText = response.choices[0]?.message?.content || '';

      // コスト計算（Qwen3-Coderの概算料金 - OpenRouterの実際の料金に合わせる）
      const inputCostPerK = 0.05; // $0.05 per 1K input tokens (概算)
      const outputCostPerK = 0.10; // $0.10 per 1K output tokens (概算)
      const cost = (inputTokens / 1000 * inputCostPerK) + (outputTokens / 1000 * outputCostPerK);

      // 統計更新
      this.stats.successful_requests++;
      this.stats.total_tokens_used += totalTokens;
      this.stats.total_cost_usd += cost;
      this.stats.average_latency_ms = 
        (this.stats.average_latency_ms * (this.stats.successful_requests - 1) + latency) / this.stats.successful_requests;

      const costInfo: CostInfo = {
        total_cost_usd: cost,
        input_cost_usd: inputTokens / 1000 * inputCostPerK,
        output_cost_usd: outputTokens / 1000 * outputCostPerK
      };

      const performanceInfo: PerformanceInfo = {
        latency_ms: latency,
        processing_time_ms: latency,
        queue_time_ms: 0
      };

      console.log(`[OpenRouter] ✅ Request completed - Tokens: ${totalTokens}, Cost: $${cost.toFixed(4)}, Latency: ${latency}ms`);

      return {
        success: true,
        response_text: responseText,
        model_used: this.modelName,
        tier_used: 0, // OpenRouter Qwen3-Coder is Tier 0
        cost_info: costInfo,
        performance_info: performanceInfo,
        metadata: {
          model_id: this.modelName,
          provider: 'openrouter',
          tokens_used: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens
          },
          generated_at: new Date().toISOString(),
          tier_used: 0,
          processing_time_ms: latency,
          estimated_complexity: 1,
          operation_type: 'llm_generation' as const
        }
      };

    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;

      this.stats.failed_requests++;

      console.error(`[OpenRouter] ❌ Request failed:`, error);

      const apiError: APIError = {
        code: (error as any)?.status?.toString() || 'OPENROUTER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        provider_error: error,
        retry_count: 0
      };

      return {
        success: false,
        response_text: '',
        model_used: this.modelName,
        tier_used: 0,
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
          model_id: this.modelName,
          provider: 'openrouter',
          tokens_used: {
            input: 0,
            output: 0,
            total: 0
          },
          generated_at: new Date().toISOString(),
          tier_used: 0,
          processing_time_ms: latency,
          estimated_complexity: 1,
          operation_type: 'llm_generation' as const
        }
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
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
      console.error(`[OpenRouter] Health check failed:`, error);
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
    return this.modelName;
  }

  getProvider(): string {
    return 'openrouter';
  }

  // Qwen3-Coder専用のコーディング支援メソッド
  async generateCode(
    task: string, 
    language: string = 'python',
    includeTests: boolean = false
  ): Promise<LLMResponse> {
    const codePrompt = `Generate ${language} code for the following task:
${task}

Requirements:
- Write clean, efficient, and well-documented code
- Follow ${language} best practices and conventions
- Include type hints where applicable
${includeTests ? '- Include unit tests for the code' : ''}

Please provide the complete solution with explanations.`;

    return this.generate(codePrompt, {
      temperature: 0.1,
      max_tokens: 2048
    });
  }

  async reviewCode(code: string, language: string = 'python'): Promise<LLMResponse> {
    const reviewPrompt = `Please review the following ${language} code and provide detailed feedback:

\`\`\`${language}
${code}
\`\`\`

Please analyze:
1. Code quality and readability
2. Performance optimizations
3. Security considerations
4. Best practices compliance
5. Potential bugs or issues
6. Suggested improvements

Provide specific, actionable recommendations.`;

    return this.generate(reviewPrompt, {
      temperature: 0.2,
      max_tokens: 1500
    });
  }
}