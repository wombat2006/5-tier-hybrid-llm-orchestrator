import axios, { AxiosInstance } from 'axios';
import { 
  BaseLLMClient, 
  LLMResponse, 
  GenerationOptions, 
  UsageStats,
  QwenRequest,
  QwenResponse,
  APIError,
  CostInfo,
  PerformanceInfo
} from '../types';

export class QwenCoderAPIClient implements BaseLLMClient {
  private client: AxiosInstance;
  private accessKeyId: string;
  private accessKeySecret: string;
  private region: string;
  private endpoint: string;
  private stats: UsageStats;

  constructor() {
    this.accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID || '';
    this.accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET || '';
    this.region = process.env.ALIBABA_REGION || 'cn-beijing';
    this.endpoint = process.env.QWEN_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

    if (!this.accessKeyId || !this.accessKeySecret) {
      throw new Error('Alibaba Cloud credentials not provided');
    }

    this.client = axios.create({
      baseURL: this.endpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessKeyId}`, // Simplified auth - production should use proper signature
        'X-DashScope-DataInspection': 'enable'
      }
    });

    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      average_latency_ms: 0,
      total_tokens_used: 0,
      total_cost_usd: 0
    };

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        (config as any).metadata = { ...(config as any).metadata, startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        const startTime = (response.config as any).metadata?.startTime || Date.now();
        (response as any).metadata = { ...(response as any).metadata, latency: Date.now() - startTime };
        return response;
      },
      (error) => Promise.reject(error)
    );
  }

  async generate(prompt: string, options: GenerationOptions = {}): Promise<LLMResponse> {
    const startTime = Date.now();
    this.stats.total_requests++;

    try {
      const qwenRequest: QwenRequest = {
        model: 'qwen-max-longcontext', // Qwen3 Coderのモデル名
        input: {
          messages: [
            {
              role: 'system',
              content: 'You are Qwen3 Coder, a specialized AI assistant optimized for coding tasks. Provide high-quality, efficient code solutions with clear explanations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        parameters: {
          temperature: options.temperature || 0.1,
          top_p: options.top_p || 0.8,
          max_tokens: options.max_tokens || 2048
        }
      };

      console.log(`[Qwen3 Coder] Sending request to: ${this.endpoint}`);
      
      const response = await this.client.post('', qwenRequest);
      const qwenResponse: QwenResponse = response.data;

      const endTime = Date.now();
      const latency = endTime - startTime;

      // レスポンス検証
      if (!qwenResponse.output?.choices?.length) {
        throw new Error('Invalid response format from Qwen3 Coder API');
      }

      const choice = qwenResponse.output.choices[0];
      const responseText = choice.message.content;

      // コスト計算
      const inputTokens = qwenResponse.usage?.input_tokens || 0;
      const outputTokens = qwenResponse.usage?.output_tokens || 0;
      const totalTokens = qwenResponse.usage?.total_tokens || (inputTokens + outputTokens);
      
      const costInfo: CostInfo = {
        input_cost_usd: (inputTokens / 1000) * 0.05, // $0.05 per 1K input tokens
        output_cost_usd: (outputTokens / 1000) * 0.10, // $0.10 per 1K output tokens
        total_cost_usd: ((inputTokens / 1000) * 0.05) + ((outputTokens / 1000) * 0.10)
      };

      const performanceInfo: PerformanceInfo = {
        latency_ms: latency,
        processing_time_ms: latency,
        fallback_used: false,
        tier_escalation: false
      };

      // 統計更新
      this.stats.successful_requests++;
      this.stats.total_tokens_used += totalTokens;
      this.stats.total_cost_usd += costInfo.total_cost_usd;
      this.updateAverageLatency(latency);

      const llmResponse: LLMResponse = {
        success: true,
        model_used: 'qwen3_coder',
        tier_used: 0,
        response_text: responseText,
        metadata: {
          model_id: 'qwen3_coder',
          provider: 'alibaba_cloud',
          tokens_used: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens
          },
          confidence_score: 0.9, // Qwen3 Coderはコーディングタスクで高い信頼度
          quality_score: 0.85,
          generated_at: new Date().toISOString(),
          tier_used: 0,
          processing_time_ms: endTime - startTime,
          estimated_complexity: prompt.length / 100
        },
        cost_info: costInfo,
        performance_info: performanceInfo
      };

      console.log(`[Qwen3 Coder] Success - Tokens: ${totalTokens}, Cost: $${costInfo.total_cost_usd.toFixed(4)}, Latency: ${latency}ms`);
      
      return llmResponse;

    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      this.stats.failed_requests++;
      this.updateAverageLatency(latency);

      console.error(`[Qwen3 Coder] Error:`, error);

      const apiError: APIError = {
        code: 'QWEN_API_ERROR',
        message: 'Qwen3 Coder API request failed',
        provider_error: error,
        retry_count: 0
      };

      if (axios.isAxiosError(error)) {
        if (error.response) {
          apiError.code = `HTTP_${error.response.status}`;
          apiError.message = `Qwen API error: ${error.response.status} ${error.response.statusText}`;
        } else if (error.request) {
          apiError.code = 'NETWORK_ERROR';
          apiError.message = 'Network error when calling Qwen3 Coder API';
        }
      }

      return {
        success: false,
        model_used: 'qwen3_coder',
        tier_used: 0,
        error: apiError,
        metadata: {
          model_id: 'qwen3_coder',
          provider: 'alibaba_cloud',
          tokens_used: { input: 0, output: 0, total: 0 },
          generated_at: new Date().toISOString(),
          tier_used: 0,
          processing_time_ms: 0,
          estimated_complexity: 0
        },
        cost_info: {
          total_cost_usd: 0,
          input_cost_usd: 0,
          output_cost_usd: 0
        },
        performance_info: {
          latency_ms: latency,
          processing_time_ms: latency,
          fallback_used: false
        }
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const healthCheck = await this.generate('console.log("health check");', {
        max_tokens: 50,
        temperature: 0
      });
      return healthCheck.success;
    } catch (error) {
      console.error('[Qwen3 Coder] Health check failed:', error);
      return false;
    }
  }

  async getUsageStats(): Promise<UsageStats> {
    return { ...this.stats };
  }

  private updateAverageLatency(newLatency: number): void {
    const totalRequests = this.stats.successful_requests + this.stats.failed_requests;
    this.stats.average_latency_ms = (
      (this.stats.average_latency_ms * (totalRequests - 1)) + newLatency
    ) / totalRequests;
  }

  // Qwen3 Coder特有のメソッド
  async generateCode(
    task: string, 
    language: string = 'python',
    includeTests: boolean = false
  ): Promise<LLMResponse> {
    const codePrompt = `
Please generate ${language} code for the following task:
${task}

Requirements:
- Write clean, efficient, and well-documented code
- Follow ${language} best practices and conventions
- Include type hints where applicable
${includeTests ? '- Include unit tests for the code' : ''}

Please provide the complete solution with explanations.
`;

    return this.generate(codePrompt, {
      temperature: 0.1,
      max_tokens: 2048
    });
  }

  async reviewCode(code: string, language: string = 'python'): Promise<LLMResponse> {
    const reviewPrompt = `
Please review the following ${language} code and provide detailed feedback:

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

Provide specific, actionable recommendations.
`;

    return this.generate(reviewPrompt, {
      temperature: 0.2,
      max_tokens: 1500
    });
  }

  async debugCode(code: string, error: string, language: string = 'python'): Promise<LLMResponse> {
    const debugPrompt = `
Help debug this ${language} code that's producing an error:

Error:
${error}

Code:
\`\`\`${language}
${code}
\`\`\`

Please:
1. Identify the root cause of the error
2. Explain why the error occurs
3. Provide the corrected code
4. Suggest how to prevent similar issues in the future
`;

    return this.generate(debugPrompt, {
      temperature: 0.1,
      max_tokens: 1500
    });
  }

  // 統計リセット（テスト用）
  resetStats(): void {
    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      average_latency_ms: 0,
      total_tokens_used: 0,
      total_cost_usd: 0
    };
  }
}