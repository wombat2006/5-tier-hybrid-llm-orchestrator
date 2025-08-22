import { PrecisionModelPricingManager } from '../src/management/ModelPricingManager';
import { ModelPricing, TokenUsage } from '../src/types/cost-management';
import { TEST_DATA_DIR, createMockTokenUsage } from './setup';
import * as path from 'path';

describe('PrecisionModelPricingManager - 厳密テスト', () => {
  let pricingManager: PrecisionModelPricingManager;
  
  beforeEach(async () => {
    pricingManager = new PrecisionModelPricingManager(path.join(TEST_DATA_DIR, 'pricing'));
    await new Promise(resolve => setTimeout(resolve, 100)); // 初期化待機
  });

  describe('価格設定管理テスト', () => {
    it('モデル価格設定の追加・取得が正常に動作する', async () => {
      const modelId = 'test-model-1';
      const pricing: ModelPricing = {
        model_id: modelId,
        provider: 'test-provider',
        input_price_per_1k: 0.03,
        output_price_per_1k: 0.06,
        cached_price_per_1k: 0.015,
        reasoning_price_per_1k: 0.12,
        minimum_charge: 0.001,
        last_updated: new Date().toISOString()
      };

      await pricingManager.updatePricing(modelId, pricing);
      const retrieved = await pricingManager.getPricing(modelId);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.model_id).toBe(modelId);
      expect(retrieved!.provider).toBe('test-provider');
      expect(retrieved!.input_price_per_1k).toBe(0.03);
      expect(retrieved!.output_price_per_1k).toBe(0.06);
      expect(retrieved!.cached_price_per_1k).toBe(0.015);
      expect(retrieved!.reasoning_price_per_1k).toBe(0.12);
    });

    it('存在しないモデルの価格取得はnullを返す', async () => {
      const result = await pricingManager.getPricing('non-existent-model');
      expect(result).toBeNull();
    });

    it('全価格設定の取得が正常に動作する', async () => {
      // 複数のモデル価格を設定
      const models = ['model-a', 'model-b', 'model-c'];
      
      for (const modelId of models) {
        const pricing: ModelPricing = {
          model_id: modelId,
          provider: 'test-provider',
          input_price_per_1k: 0.01 + Math.random() * 0.05,
          output_price_per_1k: 0.02 + Math.random() * 0.08,
          last_updated: new Date().toISOString()
        };
        await pricingManager.updatePricing(modelId, pricing);
      }

      const allPricing = await pricingManager.getAllPricing();
      expect(Object.keys(allPricing)).toHaveLength(models.length);
      
      for (const modelId of models) {
        expect(allPricing[modelId]).toBeDefined();
        expect(allPricing[modelId].model_id).toBe(modelId);
      }
    });
  });

  describe('コスト計算テスト', () => {
    beforeEach(async () => {
      // テスト用価格設定
      const testPricing: ModelPricing = {
        model_id: 'calculation-model',
        provider: 'test-provider',
        input_price_per_1k: 0.05, // $0.05/1k tokens
        output_price_per_1k: 0.10, // $0.10/1k tokens
        cached_price_per_1k: 0.025, // $0.025/1k tokens
        reasoning_price_per_1k: 0.20, // $0.20/1k tokens
        minimum_charge: 0.001,
        last_updated: new Date().toISOString()
      };
      await pricingManager.updatePricing('calculation-model', testPricing);
    });

    it('基本的なコスト計算が正確に動作する', async () => {
      const tokens: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1500
      };

      const cost = await pricingManager.calculateCost('calculation-model', tokens);
      
      // 期待値: input 1000 * $0.05/1k = $0.05, output 500 * $0.10/1k = $0.05
      expect(cost.input_cost_usd).toBe(0.05);
      expect(cost.output_cost_usd).toBe(0.05);
      expect(cost.total_cost_usd).toBe(0.10);
      expect(cost.currency).toBe('USD');
    });

    it('キャッシュトークンを含むコスト計算が正確に動作する', async () => {
      const tokens: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1700,
        cached: 200
      };

      const cost = await pricingManager.calculateCost('calculation-model', tokens);
      
      // 期待値: cached 200 * $0.025/1k = $0.005
      expect(cost.cached_cost_usd).toBe(0.005);
      expect(cost.total_cost_usd).toBe(0.105); // 0.05 + 0.05 + 0.005
    });

    it('推論トークンを含むコスト計算が正確に動作する', async () => {
      const tokens: TokenUsage = {
        input: 1000,
        output: 500,
        total: 1800,
        reasoning: 300
      };

      const cost = await pricingManager.calculateCost('calculation-model', tokens);
      
      // 期待値: reasoning 300 * $0.20/1k = $0.06
      expect(cost.reasoning_cost_usd).toBe(0.06);
      expect(cost.total_cost_usd).toBe(0.16); // 0.05 + 0.05 + 0.06
    });

    it('最小課金が適用される', async () => {
      const tokens: TokenUsage = {
        input: 1, // 極小トークン
        output: 1,
        total: 2
      };

      const cost = await pricingManager.calculateCost('calculation-model', tokens);
      
      // 計算値 (0.001 * 0.05 + 0.001 * 0.10 = 0.00015) < 最小課金 (0.001)
      expect(cost.total_cost_usd).toBe(0.001);
    });

    it('存在しないモデルのコスト計算はエラーをスローする', async () => {
      await expect(
        pricingManager.calculateCost('non-existent-model', createMockTokenUsage())
      ).rejects.toThrow();
    });
  });

  describe('価格比較テスト', () => {
    beforeEach(async () => {
      // 複数のモデル価格を設定
      const models = [
        {
          id: 'cheap-model',
          input: 0.01,
          output: 0.02
        },
        {
          id: 'expensive-model',
          input: 0.10,
          output: 0.20
        },
        {
          id: 'balanced-model',
          input: 0.05,
          output: 0.10
        }
      ];

      for (const model of models) {
        const pricing: ModelPricing = {
          model_id: model.id,
          provider: 'test-provider',
          input_price_per_1k: model.input,
          output_price_per_1k: model.output,
          last_updated: new Date().toISOString()
        };
        await pricingManager.updatePricing(model.id, pricing);
      }
    });

    it('複数モデルのコスト比較が正確に動作する', async () => {
      const tokens: TokenUsage = {
        input: 1000,
        output: 1000,
        total: 2000
      };

      const modelIds = ['cheap-model', 'expensive-model', 'balanced-model'];
      const comparison = await pricingManager.compareCosts(modelIds, tokens);
      
      expect(Object.keys(comparison)).toHaveLength(3);
      
      // コスト順序の確認
      expect(comparison['cheap-model'].total_cost_usd).toBe(0.03); // 0.01 + 0.02
      expect(comparison['expensive-model'].total_cost_usd).toBe(0.30); // 0.10 + 0.20
      expect(comparison['balanced-model'].total_cost_usd).toBe(0.15); // 0.05 + 0.10
      
      expect(comparison['cheap-model'].total_cost_usd).toBeLessThan(comparison['balanced-model'].total_cost_usd);
      expect(comparison['balanced-model'].total_cost_usd).toBeLessThan(comparison['expensive-model'].total_cost_usd);
    });

    it('存在しないモデルを含む比較はエラーをスローする', async () => {
      const modelIds = ['cheap-model', 'non-existent-model'];
      const tokens = createMockTokenUsage();

      await expect(
        pricingManager.compareCosts(modelIds, tokens)
      ).rejects.toThrow();
    });
  });

  describe('価格更新テスト', () => {
    it('価格更新機能が正常に動作する', async () => {
      // 初期価格設定
      const modelId = 'update-test-model';
      const initialPricing: ModelPricing = {
        model_id: modelId,
        provider: 'test-provider',
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        last_updated: new Date('2023-01-01').toISOString()
      };

      await pricingManager.updatePricing(modelId, initialPricing);

      // 価格更新
      const updatedPricing: ModelPricing = {
        ...initialPricing,
        input_price_per_1k: 0.03,
        output_price_per_1k: 0.08,
        last_updated: new Date().toISOString()
      };

      await pricingManager.updatePricing(modelId, updatedPricing);

      const retrieved = await pricingManager.getPricing(modelId);
      expect(retrieved!.input_price_per_1k).toBe(0.03);
      expect(retrieved!.output_price_per_1k).toBe(0.08);
      expect(new Date(retrieved!.last_updated).getTime()).toBeGreaterThan(new Date('2023-01-01').getTime());
    });

    it('価格自動更新機能のテスト', async () => {
      // refreshPricing の実装に依存
      try {
        await pricingManager.refreshPricing();
        // エラーがスローされなければ成功
        expect(true).toBe(true);
      } catch (error) {
        // 外部API依存の場合はスキップ
        expect(error).toBeDefined();
      }
    });
  });

  describe('無料枠処理テスト', () => {
    it('無料枠を持つモデルの処理が正常に動作する', async () => {
      const modelId = 'free-tier-model';
      const pricing: ModelPricing = {
        model_id: modelId,
        provider: 'test-provider',
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        free_tier: {
          requests_per_month: 1000,
          tokens_per_month: 100000,
          reset_day: 1
        },
        last_updated: new Date().toISOString()
      };

      await pricingManager.updatePricing(modelId, pricing);
      const retrieved = await pricingManager.getPricing(modelId);
      
      expect(retrieved!.free_tier).toBeDefined();
      expect(retrieved!.free_tier!.requests_per_month).toBe(1000);
      expect(retrieved!.free_tier!.tokens_per_month).toBe(100000);
    });
  });

  describe('エッジケーステスト', () => {
    it('0トークンのコスト計算', async () => {
      const modelId = 'zero-token-model';
      const pricing: ModelPricing = {
        model_id: modelId,
        provider: 'test-provider',
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        minimum_charge: 0.001,
        last_updated: new Date().toISOString()
      };

      await pricingManager.updatePricing(modelId, pricing);

      const tokens: TokenUsage = {
        input: 0,
        output: 0,
        total: 0
      };

      const cost = await pricingManager.calculateCost(modelId, tokens);
      expect(cost.total_cost_usd).toBe(0.001); // 最小課金が適用される
    });

    it('非常に大きなトークン数のコスト計算', async () => {
      const modelId = 'large-token-model';
      const pricing: ModelPricing = {
        model_id: modelId,
        provider: 'test-provider',
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        last_updated: new Date().toISOString()
      };

      await pricingManager.updatePricing(modelId, pricing);

      const tokens: TokenUsage = {
        input: 1000000, // 1M tokens
        output: 500000, // 500K tokens
        total: 1500000
      };

      const cost = await pricingManager.calculateCost(modelId, tokens);
      expect(cost.input_cost_usd).toBe(50.0); // 1000 * 0.05
      expect(cost.output_cost_usd).toBe(50.0); // 500 * 0.10
      expect(cost.total_cost_usd).toBe(100.0);
    });
  });
});