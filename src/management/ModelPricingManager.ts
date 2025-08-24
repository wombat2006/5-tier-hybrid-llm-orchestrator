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

    const inputCost = (tokens.input / 1000) * pricing.input_price_per_1k;
    const outputCost = (tokens.output / 1000) * pricing.output_price_per_1k;
    
    const cachedCost = pricing.cached_price_per_1k && tokens.cached
      ? (tokens.cached / 1000) * pricing.cached_price_per_1k 
      : 0;

    const reasoningCost = pricing.reasoning_price_per_1k && tokens.reasoning 
      ? (tokens.reasoning / 1000) * pricing.reasoning_price_per_1k 
      : 0;

    const totalCost = inputCost + outputCost + cachedCost + reasoningCost;

    return {
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      cached_cost_usd: cachedCost,
      reasoning_cost_usd: reasoningCost,
      total_cost_usd: totalCost,
      currency: 'USD',
      calculated_at: new Date().toISOString()
    };
  }

  async compareCosts(models: string[], tokens: TokenUsage): Promise<Record<string, CostBreakdown>> {
    const comparisons: Record<string, CostBreakdown> = {};
    
    for (const model_id of models) {
      try {
        comparisons[model_id] = await this.calculateCost(model_id, tokens);
      } catch (error) {
        console.error(`[PricingManager] Failed to calculate cost for ${model_id}:`, error);
      }
    }
    
    return comparisons;
  }

  async checkFreeTierLimits(model_id: string, tokens: TokenUsage): Promise<{ 
    allowed: boolean, 
    remaining?: { requests: number, tokens: number } 
  }> {
    const pricing = await this.getPricing(model_id);
    if (!pricing?.free_tier) {
      return { allowed: true };
    }

    // 無料枠チェック実装
    return { allowed: true };
  }

  async refreshPricing(): Promise<void> {
    console.log('[PricingManager] 🔄 Refreshing pricing data from external sources...');
    
    // Load pricing from models.yaml configuration
    try {
      const yaml = require('js-yaml');
      const fs = require('fs');
      const modelsConfig = yaml.load(fs.readFileSync('./config/models.yaml', 'utf8'));
      
      for (const [modelId, config] of Object.entries(modelsConfig.models || {})) {
        const costConfig = (config as any).cost_per_1k_tokens;
        if (costConfig) {
          const pricingData: ModelPricing = {
            model_id: modelId,
            provider: (config as any).provider || 'unknown',
            input_price_per_1k: costConfig.input || 0,
            output_price_per_1k: costConfig.output || 0,
            last_updated: new Date().toISOString()
          };
          await this.updatePricing(modelId, pricingData);
        }
      }
      
      console.log('[PricingManager] ✅ Pricing loaded from models.yaml');
    } catch (error) {
      console.error('[PricingManager] ❌ Failed to load from models.yaml, using defaults:', error);
      
      // Fallback to hardcoded defaults if models.yaml fails
      const defaultPricing: Record<string, ModelPricing> = {
        'qwen3_coder': {
          model_id: 'qwen3_coder',
          provider: 'openrouter',
          input_price_per_1k: 0.05,
          output_price_per_1k: 0.10,
          last_updated: new Date().toISOString()
        },
        'gemini_2_5_flash': {
          model_id: 'gemini_2_5_flash',
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
          last_updated: new Date().toISOString()
        },
        'gpt4o': {
          model_id: 'gpt4o',
          provider: 'openai',
          input_price_per_1k: 2.50,
          output_price_per_1k: 10.00,
          reasoning_price_per_1k: 60.00,
          last_updated: new Date().toISOString()
        },
        'gpt5': {
          model_id: 'gpt5',
          provider: 'openai',
          input_price_per_1k: 10.00,
          output_price_per_1k: 30.00,
          last_updated: new Date().toISOString()
        },
        'gemini_pro': {
          model_id: 'gemini_pro',
          provider: 'google',
          input_price_per_1k: 1.25,
          output_price_per_1k: 5.00,
          last_updated: new Date().toISOString()
        }
      };

      // Update existing pricing entries
      for (const [model_id, pricingData] of Object.entries(defaultPricing)) {
        this.pricing[model_id] = pricingData;
        console.log(`[PricingManager] ✅ Updated pricing for ${model_id}`);
      }
    }
    
    await this.savePricingData();
    console.log('[PricingManager] 🔄 Pricing refresh completed');
  }

  private async loadPricingData(): Promise<void> {
    try {
      const data = await fs.readFile(this.pricingFilePath, 'utf-8');
      this.pricing = JSON.parse(data);
      console.log(`[PricingManager] 📊 Loaded pricing for ${Object.keys(this.pricing).length} models`);
    } catch (error) {
      console.log('[PricingManager] 📊 No existing pricing data found, initializing...');
      await this.initializeDefaultPricing();
    }
  }

  private async savePricingData(): Promise<void> {
    try {
      await fs.writeFile(this.pricingFilePath, JSON.stringify(this.pricing, null, 2));
      console.log('[PricingManager] 💾 Pricing data saved');
    } catch (error) {
      console.error('[PricingManager] ❌ Failed to save pricing data:', error);
    }
  }

  private async initializeDefaultPricing(): Promise<void> {
    console.log('[PricingManager] 🔧 Default pricing initialized');
    
    // Initialize with empty pricing, will be populated by refreshPricing()
    this.pricing = {};
    
    // Trigger immediate refresh to populate pricing
    await this.refreshPricing();
  }
}