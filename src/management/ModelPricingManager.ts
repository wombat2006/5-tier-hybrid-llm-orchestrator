import { 
  ModelPricingManager, 
  ModelPricing, 
  TokenUsage, 
  CostBreakdown 
} from '../types/cost-management';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PrecisionModelPricingManager implements ModelPricingManager {
  private pricing: Record<string, ModelPricing> = {};
  private dataDir: string;
  private pricingFilePath: string;

  constructor(dataDir: string = './data/pricing') {
    this.dataDir = dataDir;
    this.pricingFilePath = path.join(dataDir, 'model-pricing.json');
    this.initializePricingManager();
  }

  private async initializePricingManager(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.loadPricingData();
    } catch (error) {
      console.error('[PricingManager] Failed to initialize:', error);
      await this.initializeDefaultPricing();
    }
  }

  async updatePricing(model_id: string, pricing: ModelPricing): Promise<void> {
    console.log(`[PricingManager] 💰 Updating pricing for ${model_id}: Input=$${pricing.input_price_per_1k}/1k, Output=$${pricing.output_price_per_1k}/1k`);
    
    pricing.last_updated = new Date().toISOString();
    this.pricing[model_id] = pricing;
    
    await this.savePricingData();
  }

  async getPricing(model_id: string): Promise<ModelPricing | null> {
    return this.pricing[model_id] || null;
  }

  async getAllPricing(): Promise<Record<string, ModelPricing>> {
    return { ...this.pricing };
  }

  async calculateCost(model_id: string, tokens: TokenUsage): Promise<CostBreakdown> {
    const pricing = await this.getPricing(model_id);
    if (!pricing) {
      throw new Error(`Pricing not found for model: ${model_id}`);
    }

    console.log(`[PricingManager] 🧮 Calculating cost for ${model_id}: ${tokens.total} tokens`);

    // 基本料金計算
    const input_cost = (tokens.input / 1000) * pricing.input_price_per_1k;
    const output_cost = (tokens.output / 1000) * pricing.output_price_per_1k;
    
    // オプション料金計算
    const cached_cost = tokens.cached && pricing.cached_price_per_1k 
      ? (tokens.cached / 1000) * pricing.cached_price_per_1k 
      : 0;
    
    const reasoning_cost = tokens.reasoning && pricing.reasoning_price_per_1k
      ? (tokens.reasoning / 1000) * pricing.reasoning_price_per_1k
      : 0;

    // 総コスト計算
    let total_cost = input_cost + output_cost + cached_cost + reasoning_cost;
    
    // 最小料金の適用
    if (pricing.minimum_charge && total_cost < pricing.minimum_charge) {
      total_cost = pricing.minimum_charge;
    }

    // 無料枠の適用チェック
    if (pricing.free_tier) {
      const currentMonthUsage = await this.getCurrentMonthUsage(model_id);
      
      // 無料リクエスト数チェック
      if (pricing.free_tier.requests_per_month && currentMonthUsage.requests >= pricing.free_tier.requests_per_month) {
        // 無料枠を超過している場合は通常料金
      } else if (pricing.free_tier.tokens_per_month && currentMonthUsage.tokens >= pricing.free_tier.tokens_per_month) {
        // 無料トークン数を超過している場合は通常料金
      } else {
        // 無料枠内の場合はコストを0に
        total_cost = 0;
        console.log(`[PricingManager] 🆓 Free tier applied for ${model_id}`);
      }
    }

    const breakdown: CostBreakdown = {
      input_cost_usd: parseFloat(input_cost.toFixed(6)),
      output_cost_usd: parseFloat(output_cost.toFixed(6)),
      cached_cost_usd: cached_cost > 0 ? parseFloat(cached_cost.toFixed(6)) : undefined,
      reasoning_cost_usd: reasoning_cost > 0 ? parseFloat(reasoning_cost.toFixed(6)) : undefined,
      total_cost_usd: parseFloat(total_cost.toFixed(6)),
      currency: 'USD',
      calculated_at: new Date().toISOString()
    };

    console.log(`[PricingManager] ✅ Cost calculated: $${breakdown.total_cost_usd.toFixed(6)} (Input: $${breakdown.input_cost_usd.toFixed(6)}, Output: $${breakdown.output_cost_usd.toFixed(6)})`);
    
    return breakdown;
  }

  async compareCosts(models: string[], tokens: TokenUsage): Promise<Record<string, CostBreakdown>> {
    console.log(`[PricingManager] 📊 Comparing costs for ${models.length} models with ${tokens.total} tokens`);
    
    const comparisons: Record<string, CostBreakdown> = {};
    
    for (const model_id of models) {
      try {
        comparisons[model_id] = await this.calculateCost(model_id, tokens);
      } catch (error) {
        console.warn(`[PricingManager] Failed to calculate cost for ${model_id}:`, error);
        comparisons[model_id] = {
          input_cost_usd: 0,
          output_cost_usd: 0,
          total_cost_usd: 0,
          currency: 'USD',
          calculated_at: new Date().toISOString()
        };
      }
    }

    // コスト順にソート
    const sortedModels = Object.entries(comparisons)
      .sort(([, a], [, b]) => a.total_cost_usd - b.total_cost_usd);

    console.log(`[PricingManager] 💡 Cost comparison (cheapest first):`);
    sortedModels.forEach(([model, cost], index) => {
      const savings = index > 0 ? sortedModels[0][1].total_cost_usd - cost.total_cost_usd : 0;
      console.log(`   ${index + 1}. ${model}: $${cost.total_cost_usd.toFixed(6)} ${savings > 0 ? `(+$${savings.toFixed(6)})` : '(cheapest)'}`);
    });
    
    return comparisons;
  }

  async refreshPricing(): Promise<void> {
    console.log('[PricingManager] 🔄 Refreshing pricing data from external sources...');
    
    // 実際の実装では各プロバイダーのAPI価格情報を取得
    // ここでは最新の価格データで更新
    const updatedPricing: Record<string, Partial<ModelPricing>> = {
      'qwen3_coder': {
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        last_updated: new Date().toISOString()
      },
      'gemini_flash': {
        input_price_per_1k: 0.0,
        output_price_per_1k: 0.0,
        free_tier: {
          requests_per_month: 15000,
          tokens_per_month: 1000000,
          reset_day: 1
        },
        last_updated: new Date().toISOString()
      },
      'claude_sonnet': {
        input_price_per_1k: 3.00,
        output_price_per_1k: 15.00,
        last_updated: new Date().toISOString()
      },
      'gpt4o': {
        input_price_per_1k: 2.50,
        output_price_per_1k: 10.00,
        reasoning_price_per_1k: 60.00,
        last_updated: new Date().toISOString()
      },
      'gemini_pro': {
        input_price_per_1k: 1.25,
        output_price_per_1k: 5.00,
        last_updated: new Date().toISOString()
      }
    };

    // 既存価格設定を更新
    for (const [model_id, updates] of Object.entries(updatedPricing)) {
      if (this.pricing[model_id]) {
        this.pricing[model_id] = { ...this.pricing[model_id], ...updates };
        console.log(`[PricingManager] ✅ Updated pricing for ${model_id}`);
      }
    }

    await this.savePricingData();
    console.log('[PricingManager] 🔄 Pricing refresh completed');
  }

  // 価格効率分析メソッド
  async analyzePriceEfficiency(tokens: TokenUsage): Promise<{
    most_economical: { model: string; cost: number; efficiency_score: number };
    recommendations: Array<{
      model: string;
      cost: number;
      suitable_for: string[];
      cost_per_output_token: number;
    }>;
  }> {
    const allModels = Object.keys(this.pricing);
    const costs = await this.compareCosts(allModels, tokens);
    
    const analysis = Object.entries(costs).map(([model, cost]) => {
      const pricing = this.pricing[model];
      const efficiency_score = tokens.output > 0 ? cost.total_cost_usd / (tokens.output / 1000) : 0;
      const cost_per_output_token = tokens.output > 0 ? cost.total_cost_usd / tokens.output : 0;
      
      return {
        model,
        cost: cost.total_cost_usd,
        efficiency_score,
        cost_per_output_token,
        suitable_for: this.getSuitableUseCases(model, pricing)
      };
    }).sort((a, b) => a.cost - b.cost);

    return {
      most_economical: analysis[0] || { model: '', cost: 0, efficiency_score: 0 },
      recommendations: analysis
    };
  }

  // 動的価格調整機能
  async suggestOptimalModel(
    task_type: 'coding' | 'analysis' | 'translation' | 'general',
    estimated_tokens: Partial<TokenUsage>,
    quality_requirement: 'basic' | 'standard' | 'premium' = 'standard',
    max_budget?: number
  ): Promise<{
    recommended_model: string;
    estimated_cost: CostBreakdown;
    confidence_score: number;
    alternatives: Array<{
      model: string;
      cost: CostBreakdown;
      pros: string[];
      cons: string[];
    }>;
  }> {
    console.log(`[PricingManager] 🎯 Finding optimal model for ${task_type} task (${quality_requirement} quality)`);
    
    const suitable_models = this.filterModelsByTaskType(task_type, quality_requirement);
    const full_tokens: TokenUsage = {
      input: estimated_tokens.input || 1000,
      output: estimated_tokens.output || 500,
      total: (estimated_tokens.input || 1000) + (estimated_tokens.output || 500),
      cached: estimated_tokens.cached,
      reasoning: estimated_tokens.reasoning
    };
    
    const costs = await this.compareCosts(suitable_models, full_tokens);
    
    // 予算フィルタリング
    let filtered_costs = costs;
    if (max_budget) {
      filtered_costs = Object.fromEntries(
        Object.entries(costs).filter(([, cost]) => cost.total_cost_usd <= max_budget)
      );
    }
    
    // 最適モデル選択
    const ranked_models = Object.entries(filtered_costs)
      .map(([model, cost]) => ({
        model,
        cost,
        score: this.calculateModelScore(model, cost, task_type, quality_requirement)
      }))
      .sort((a, b) => b.score - a.score);
    
    const recommended = ranked_models[0];
    const alternatives = ranked_models.slice(1, 4).map(({ model, cost }) => ({
      model,
      cost,
      pros: this.getModelPros(model),
      cons: this.getModelCons(model)
    }));
    
    return {
      recommended_model: recommended.model,
      estimated_cost: recommended.cost,
      confidence_score: Math.min(recommended.score / 100, 1.0),
      alternatives
    };
  }

  // プライベートメソッド

  private async loadPricingData(): Promise<void> {
    try {
      const data = await fs.readFile(this.pricingFilePath, 'utf-8');
      this.pricing = JSON.parse(data);
      console.log(`[PricingManager] ✅ Loaded pricing for ${Object.keys(this.pricing).length} models`);
    } catch (error) {
      console.log('[PricingManager] No existing pricing data found, initializing defaults...');
      await this.initializeDefaultPricing();
    }
  }

  private async savePricingData(): Promise<void> {
    try {
      await fs.writeFile(this.pricingFilePath, JSON.stringify(this.pricing, null, 2));
      console.log('[PricingManager] 💾 Pricing data saved');
    } catch (error) {
      console.error('[PricingManager] Failed to save pricing data:', error);
    }
  }

  private async initializeDefaultPricing(): Promise<void> {
    const defaultPricing: Record<string, ModelPricing> = {
      'qwen3_coder': {
        model_id: 'qwen3_coder',
        provider: 'alibaba_cloud',
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        minimum_charge: 0.001,
        last_updated: new Date().toISOString()
      },
      'gemini_flash': {
        model_id: 'gemini_flash',
        provider: 'google',
        input_price_per_1k: 0.0,
        output_price_per_1k: 0.0,
        free_tier: {
          requests_per_month: 15000,
          tokens_per_month: 1000000,
          reset_day: 1
        },
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
      },
      'gemini_pro': {
        model_id: 'gemini_pro',
        provider: 'google',
        input_price_per_1k: 1.25,
        output_price_per_1k: 5.00,
        minimum_charge: 0.005,
        last_updated: new Date().toISOString()
      }
    };

    for (const [model_id, pricing] of Object.entries(defaultPricing)) {
      await this.updatePricing(model_id, pricing);
    }

    console.log('[PricingManager] 🔧 Default pricing initialized');
  }

  private async getCurrentMonthUsage(model_id: string): Promise<{ requests: number; tokens: number }> {
    // 実際の実装では使用統計データベースから取得
    // ここでは簡単なモック実装
    return { requests: 0, tokens: 0 };
  }

  private getSuitableUseCases(model: string, pricing: ModelPricing): string[] {
    const useCases: string[] = [];
    
    if (pricing.input_price_per_1k === 0 && pricing.output_price_per_1k === 0) {
      useCases.push('開発・テスト', 'プロトタイピング', '大量処理');
    } else if (pricing.input_price_per_1k < 1.0) {
      useCases.push('コスト重視', '大量処理', 'バッチ処理');
    } else if (pricing.input_price_per_1k >= 3.0) {
      useCases.push('高品質要求', 'クリティカル処理', '複雑推論');
    } else {
      useCases.push('標準処理', 'バランス重視');
    }
    
    if (pricing.reasoning_price_per_1k) {
      useCases.push('推論タスク', '複雑問題解決');
    }
    
    return useCases;
  }

  private filterModelsByTaskType(
    task_type: string, 
    quality_requirement: string
  ): string[] {
    const models = Object.keys(this.pricing);
    
    // タスクタイプと品質要求に基づくフィルタリング
    if (task_type === 'coding') {
      if (quality_requirement === 'basic') {
        return models.filter(m => m.includes('qwen') || m.includes('flash'));
      } else if (quality_requirement === 'premium') {
        return models.filter(m => m.includes('gpt4o') || m.includes('claude'));
      }
    }
    
    return models; // デフォルトは全モデル
  }

  private calculateModelScore(
    model: string, 
    cost: CostBreakdown, 
    task_type: string, 
    quality_requirement: string
  ): number {
    let score = 50; // ベーススコア
    
    // コスト効率スコア (0-40点)
    if (cost.total_cost_usd < 0.01) score += 40;
    else if (cost.total_cost_usd < 0.05) score += 30;
    else if (cost.total_cost_usd < 0.10) score += 20;
    else if (cost.total_cost_usd < 0.50) score += 10;
    
    // タスク適合性スコア (0-30点)
    if (task_type === 'coding' && model.includes('qwen')) score += 25;
    else if (task_type === 'analysis' && model.includes('claude')) score += 25;
    else if (task_type === 'general' && model.includes('gpt4o')) score += 20;
    
    // 品質要求適合性スコア (0-30点)
    const pricing = this.pricing[model];
    if (quality_requirement === 'premium' && pricing.input_price_per_1k >= 2.0) score += 25;
    else if (quality_requirement === 'standard' && pricing.input_price_per_1k >= 0.5) score += 20;
    else if (quality_requirement === 'basic') score += 15;
    
    return Math.min(score, 100);
  }

  private getModelPros(model: string): string[] {
    const pros: Record<string, string[]> = {
      'qwen3_coder': ['高速', 'コーディング特化', '低コスト'],
      'gemini_flash': ['無料', '高速', '大容量'],
      'claude_sonnet': ['高品質', '複雑推論', '詳細回答'],
      'gpt4o': ['最高品質', '推論能力', 'マルチモーダル'],
      'gemini_pro': ['高品質', 'マルチモーダル', 'コスト効率']
    };
    
    return pros[model] || ['汎用性'];
  }

  private getModelCons(model: string): string[] {
    const cons: Record<string, string[]> = {
      'qwen3_coder': ['専門性限定', '回答品質制約'],
      'gemini_flash': ['品質制約', '無料枠制限'],
      'claude_sonnet': ['高コスト', 'レイテンシ'],
      'gpt4o': ['最高コスト', '推論料金追加'],
      'gemini_pro': ['中程度コスト', 'API制限']
    };
    
    return cons[model] || ['特になし'];
  }
}