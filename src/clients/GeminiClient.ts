import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  BaseLLMClient, 
  LLMResponse, 
  GenerationOptions, 
  UsageStats,
  APIError,
  CostInfo,
  PerformanceInfo
} from '../types';

export class GeminiAPIClient implements BaseLLMClient {
  private client: GoogleGenerativeAI;
  private model: any;
  private modelName: string;
  private stats: UsageStats;

  constructor(modelName: string = 'gemini-1.5-flash') {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Google API key not provided');
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.model = this.client.getGenerativeModel({ model: modelName });
    
    this.stats = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      average_latency_ms: 0,
      total_tokens_used: 0,
      total_cost_usd: 0
    };
  }

  async generate(prompt: string, options: GenerationOptions = {}): Promise<LLMResponse> {
    const startTime = Date.now();
    this.stats.total_requests++;

    try {
      console.log(`[Gemini ${this.modelName}] Generating response...`);
      
      const generationConfig = {
        temperature: options.temperature || 0.7,
        topP: options.top_p || 0.9,
        maxOutputTokens: options.max_tokens || 2048,
      };

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      const response = await result.response;
      const responseText = response.text();

      // トークン数の推定（Geminiは正確なトークン数を返さない場合があります）
      const estimatedInputTokens = Math.ceil(prompt.length / 4);
      const estimatedOutputTokens = Math.ceil(responseText.length / 4);
      const totalTokens = estimatedInputTokens + estimatedOutputTokens;

      // コスト計算（Gemini Flashは無料枠、Proは有料）
      let inputCostPerK = 0;
      let outputCostPerK = 0;
      
      if (this.modelName.includes('pro')) {
        inputCostPerK = 1.25; // $1.25 per 1K input tokens
        outputCostPerK = 5.00; // $5.00 per 1K output tokens
      }
      // Flash は無料枠のため0

      const costInfo: CostInfo = {
        input_cost_usd: (estimatedInputTokens / 1000) * inputCostPerK,
        output_cost_usd: (estimatedOutputTokens / 1000) * outputCostPerK,
        total_cost_usd: ((estimatedInputTokens / 1000) * inputCostPerK) + ((estimatedOutputTokens / 1000) * outputCostPerK)
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
        model_used: this.modelName.includes('pro') ? 'gemini_pro' : 'gemini_flash',
        tier_used: this.modelName.includes('pro') ? 3 : 1,
        response_text: responseText,
        metadata: {
          model_id: this.modelName.includes('pro') ? 'gemini_pro' : 'gemini_flash',
          provider: 'google',
          tokens_used: {
            input: estimatedInputTokens,
            output: estimatedOutputTokens,
            total: totalTokens
          },
          confidence_score: 0.8,
          quality_score: this.modelName.includes('pro') ? 0.9 : 0.75,
          generated_at: new Date().toISOString(),
          tier_used: this.modelName.includes('pro') ? 3 : 1,
          processing_time_ms: endTime - startTime,
          estimated_complexity: prompt.length / 100
        },
        cost_info: costInfo,
        performance_info: performanceInfo
      };

      console.log(`[Gemini ${this.modelName}] Success - Est. Tokens: ${totalTokens}, Cost: $${costInfo.total_cost_usd.toFixed(4)}, Latency: ${latency}ms`);
      
      return llmResponse;

    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      this.stats.failed_requests++;
      this.updateAverageLatency(latency);

      console.error(`[Gemini ${this.modelName}] Error:`, error);

      const apiError: APIError = {
        code: 'GEMINI_API_ERROR',
        message: `Gemini ${this.modelName} API request failed`,
        provider_error: error,
        retry_count: 0
      };

      return {
        success: false,
        model_used: this.modelName.includes('pro') ? 'gemini_pro' : 'gemini_flash',
        tier_used: this.modelName.includes('pro') ? 3 : 1,
        error: apiError,
        metadata: {
          model_id: this.modelName.includes('pro') ? 'gemini_pro' : 'gemini_flash',
          provider: 'google',
          tokens_used: { input: 0, output: 0, total: 0 },
          generated_at: new Date().toISOString(),
          tier_used: this.modelName.includes('pro') ? 3 : 1,
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
      const healthCheck = await this.generate('Hello', {
        max_tokens: 10,
        temperature: 0
      });
      return healthCheck.success;
    } catch (error) {
      console.error(`[Gemini ${this.modelName}] Health check failed:`, error);
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