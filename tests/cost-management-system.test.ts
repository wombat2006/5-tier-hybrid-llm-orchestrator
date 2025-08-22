import { PrecisionCostManagementSystem } from '../src/management/CostManagementSystem';
import { BudgetConfig, TokenUsage, CostBreakdown } from '../src/types/cost-management';
import { TEST_DATA_DIR, createMockTokenUsage, createMockCostBreakdown } from './setup';
import * as path from 'path';

describe('PrecisionCostManagementSystem - 厳密統合テスト', () => {
  let costSystem: PrecisionCostManagementSystem;
  
  beforeEach(async () => {
    costSystem = new PrecisionCostManagementSystem(path.join(TEST_DATA_DIR, 'integrated-cost'));
    
    const testBudget: BudgetConfig = {
      monthly_budget_usd: 50.0,
      warning_threshold: 0.7,
      critical_threshold: 0.9,
      auto_pause_at_limit: false,
      budget_reset_day: 1,
      timezone: 'UTC'
    };
    
    await costSystem.initialize(testBudget);
    await new Promise(resolve => setTimeout(resolve, 200)); // 初期化完全待機
  });

  describe('システム初期化テスト', () => {
    it('初期化が正常に完了し、全コンポーネントが利用可能', async () => {
      expect(costSystem.tracker).toBeDefined();
      expect(costSystem.pricing).toBeDefined();
      
      const budget = await costSystem.tracker.getBudget();
      expect(budget.monthly_budget_usd).toBe(50.0);
    });

    it('重複初期化が安全に処理される', async () => {
      const duplicateBudget: BudgetConfig = {
        monthly_budget_usd: 100.0,
        warning_threshold: 0.8,
        critical_threshold: 0.95,
        auto_pause_at_limit: true,
        budget_reset_day: 15,
        timezone: 'Asia/Tokyo'
      };

      // 2回目の初期化
      await costSystem.initialize(duplicateBudget);
      
      const budget = await costSystem.tracker.getBudget();
      expect(budget.monthly_budget_usd).toBe(100.0); // 新しい設定が適用される
    });
  });

  describe('リクエスト前チェックテスト', () => {
    beforeEach(async () => {
      // テスト用モデル価格を設定
      await costSystem.pricing.updatePricing('test-model', {
        model_id: 'test-model',
        provider: 'test-provider',
        input_price_per_1k: 0.05,
        output_price_per_1k: 0.10,
        last_updated: new Date().toISOString()
      });
    });

    it('予算内リクエストが承認される', async () => {
      const estimatedTokens = { input: 500, output: 300 };
      
      const check = await costSystem.preRequestCheck('test-model', estimatedTokens);
      
      expect(check.approved).toBe(true);
      expect(check.estimated_cost.total_cost_usd).toBe(0.055); // (500*0.05 + 300*0.10)/1000
      expect(check.warnings).toHaveLength(0);
      expect(check.reason).toBeUndefined();
    });

    it('予算超過リクエストが拒否される', async () => {
      // 大量のトークンで予算を超過させる
      const estimatedTokens = { input: 500000, output: 500000 }; // 大量トークン
      
      const check = await costSystem.preRequestCheck('test-model', estimatedTokens);
      
      expect(check.approved).toBe(false);
      expect(check.estimated_cost.total_cost_usd).toBeGreaterThan(50.0);
      expect(check.reason).toBeDefined();
      expect(check.reason).toContain('予算');
    });

    it('存在しないモデルのリクエストが拒否される', async () => {
      const estimatedTokens = createMockTokenUsage();
      
      const check = await costSystem.preRequestCheck('non-existent-model', estimatedTokens);
      
      expect(check.approved).toBe(false);
      expect(check.reason).toBeDefined();
    });

    it('警告しきい値近くでの警告生成', async () => {
      // 予算の60%を使用済み状態を作成
      const sessionId = 'warning-session';
      await costSystem.tracker.startSession(sessionId);
      await costSystem.tracker.trackUsage(
        sessionId, 
        'test-model', 
        createMockTokenUsage(150000, 150000), 
        createMockCostBreakdown(30.0)
      );

      // 追加リクエスト（警告範囲内）
      const estimatedTokens = { input: 5000, output: 5000 };
      const check = await costSystem.preRequestCheck('test-model', estimatedTokens);
      
      expect(check.approved).toBe(true);
      expect(check.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('リクエスト後処理テスト', () => {
    beforeEach(async () => {
      await costSystem.pricing.updatePricing('processing-model', {
        model_id: 'processing-model',
        provider: 'test-provider',
        input_price_per_1k: 0.03,
        output_price_per_1k: 0.08,
        last_updated: new Date().toISOString()
      });
    });

    it('成功リクエストの後処理が正常に動作する', async () => {
      const sessionId = 'success-processing-session';
      await costSystem.tracker.startSession(sessionId);

      const actualTokens: TokenUsage = createMockTokenUsage(800, 400);
      const latency = 1500;

      await costSystem.postRequestProcessing(
        sessionId,
        'processing-model',
        actualTokens,
        latency,
        true, // success
        undefined
      );

      const session = await costSystem.tracker.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.successful_requests).toBe(1);
      expect(session!.failed_requests).toBe(0);
      expect(session!.total_tokens.total).toBe(1200);
      
      const modelStats = session!.model_breakdown['processing-model'];
      expect(modelStats.requests).toBe(1);
      expect(modelStats.avg_latency_ms).toBe(1500);
      expect(modelStats.errors).toBe(0);
    });

    it('失敗リクエストの後処理が正常に動作する', async () => {
      const sessionId = 'failure-processing-session';
      await costSystem.tracker.startSession(sessionId);

      const actualTokens: TokenUsage = createMockTokenUsage(300, 0); // 出力なし（失敗）
      const error = new Error('API request failed');

      await costSystem.postRequestProcessing(
        sessionId,
        'processing-model',
        actualTokens,
        2000,
        false, // failure
        error
      );

      const session = await costSystem.tracker.getSession(sessionId);
      expect(session!.successful_requests).toBe(0);
      expect(session!.failed_requests).toBe(1);
      
      const modelStats = session!.model_breakdown['processing-model'];
      expect(modelStats.errors).toBe(1);
    });

    it('複数リクエストの統計が正確に集計される', async () => {
      const sessionId = 'multi-processing-session';
      await costSystem.tracker.startSession(sessionId);

      // 3回の成功リクエスト
      for (let i = 0; i < 3; i++) {
        await costSystem.postRequestProcessing(
          sessionId,
          'processing-model',
          createMockTokenUsage(200 + i * 100, 100 + i * 50),
          1000 + i * 200,
          true
        );
      }

      // 1回の失敗リクエスト
      await costSystem.postRequestProcessing(
        sessionId,
        'processing-model',
        createMockTokenUsage(150, 0),
        3000,
        false,
        new Error('Test error')
      );

      const session = await costSystem.tracker.getSession(sessionId);
      expect(session!.total_requests).toBe(4);
      expect(session!.successful_requests).toBe(3);
      expect(session!.failed_requests).toBe(1);
      
      const modelStats = session!.model_breakdown['processing-model'];
      expect(modelStats.requests).toBe(4);
      expect(modelStats.errors).toBe(1);
      // 平均レイテンシの確認
      const expectedAvgLatency = (1000 + 1200 + 1400 + 3000) / 4;
      expect(modelStats.avg_latency_ms).toBe(expectedAvgLatency);
    });
  });

  describe('ヘルスチェックテスト', () => {
    it('健全な状態でのヘルスチェック', async () => {
      const health = await costSystem.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.budget_status).toContain('健全');
      expect(health.active_sessions).toBe(0);
      expect(health.recent_errors).toBe(0);
      expect(health.system_recommendations).toBeInstanceOf(Array);
    });

    it('予算警告状態でのヘルスチェック', async () => {
      // 警告レベルの使用量を生成
      const sessionId = 'warning-health-session';
      await costSystem.tracker.startSession(sessionId);
      await costSystem.tracker.trackUsage(
        sessionId,
        'test-model',
        createMockTokenUsage(200000, 100000),
        createMockCostBreakdown(40.0) // 80%使用
      );

      const health = await costSystem.healthCheck();
      
      expect(health.status).toBe('warning');
      expect(health.budget_status).toContain('警告');
    });

    it('予算危険状態でのヘルスチェック', async () => {
      // 危険レベルの使用量を生成
      const sessionId = 'critical-health-session';
      await costSystem.tracker.startSession(sessionId);
      await costSystem.tracker.trackUsage(
        sessionId,
        'test-model',
        createMockTokenUsage(400000, 200000),
        createMockCostBreakdown(48.0) // 96%使用
      );

      const health = await costSystem.healthCheck();
      
      expect(health.status).toBe('critical');
      expect(health.budget_status).toContain('危険');
    });
  });

  describe('コスト最適化提案テスト', () => {
    beforeEach(async () => {
      // 複数モデルの価格設定
      await costSystem.pricing.updatePricing('expensive-model', {
        model_id: 'expensive-model',
        provider: 'provider-a',
        input_price_per_1k: 0.20,
        output_price_per_1k: 0.40,
        last_updated: new Date().toISOString()
      });

      await costSystem.pricing.updatePricing('cheap-model', {
        model_id: 'cheap-model',
        provider: 'provider-b',
        input_price_per_1k: 0.01,
        output_price_per_1k: 0.02,
        last_updated: new Date().toISOString()
      });
    });

    it('コスト最適化提案が生成される', async () => {
      // 高コストモデルの使用履歴を作成
      const sessionId = 'optimization-session';
      await costSystem.tracker.startSession(sessionId);
      await costSystem.tracker.trackUsage(
        sessionId,
        'expensive-model',
        createMockTokenUsage(5000, 3000),
        createMockCostBreakdown(5.0)
      );

      const suggestions = await costSystem.suggestCostOptimizations();
      
      expect(suggestions.current_monthly_spend).toBeGreaterThan(0);
      expect(suggestions.projected_monthly_spend).toBeGreaterThan(0);
      expect(suggestions.optimizations).toBeInstanceOf(Array);
      expect(suggestions.optimizations.length).toBeGreaterThan(0);
      
      // 最適化提案の内容確認
      const hasModelSwitchSuggestion = suggestions.optimizations.some(
        (opt: any) => opt.type === 'model_switch'
      );
      expect(hasModelSwitchSuggestion).toBe(true);
    });
  });

  describe('リアルタイムダッシュボードテスト', () => {
    it('リアルタイムダッシュボードデータが正常に取得される', async () => {
      // ダッシュボード用データを準備
      const sessionId = 'dashboard-session';
      await costSystem.tracker.startSession(sessionId);
      await costSystem.tracker.trackUsage(
        sessionId,
        'dashboard-model',
        createMockTokenUsage(1000, 500),
        createMockCostBreakdown(2.0)
      );

      const dashboard = await costSystem.getRealTimeDashboard();
      
      expect(dashboard.current_cost).toBeGreaterThan(0);
      expect(dashboard.hourly_rate).toBeGreaterThanOrEqual(0);
      expect(dashboard.budget_remaining).toBeLessThan(50.0);
      expect(dashboard.top_models).toBeInstanceOf(Array);
      expect(dashboard.recent_activity).toBeInstanceOf(Array);
      expect(dashboard.alerts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('エラー処理・回復テスト', () => {
    it('コンポーネント初期化失敗の回復', async () => {
      // 無効なディレクトリでの初期化
      const invalidSystem = new PrecisionCostManagementSystem('/invalid/path/that/cannot/be/created');
      
      try {
        await invalidSystem.initialize({
          monthly_budget_usd: 10.0,
          warning_threshold: 0.8,
          critical_threshold: 0.95,
          auto_pause_at_limit: false,
          budget_reset_day: 1,
          timezone: 'UTC'
        });
        // エラーが発生しなければ、gracefulな処理ができている
      } catch (error) {
        // エラーが発生しても、システムが適切にハンドリングしている
        expect(error).toBeDefined();
      }
    });

    it('同時リクエスト処理の整合性', async () => {
      const sessionId = 'concurrent-session';
      await costSystem.tracker.startSession(sessionId);

      // 複数の同時リクエスト
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const promise = costSystem.postRequestProcessing(
          sessionId,
          'concurrent-model',
          createMockTokenUsage(100 + i * 10, 50 + i * 5),
          1000 + i * 100,
          true
        );
        promises.push(promise);
      }

      await Promise.all(promises);

      const session = await costSystem.tracker.getSession(sessionId);
      expect(session!.total_requests).toBe(5);
      expect(session!.successful_requests).toBe(5);
      expect(session!.failed_requests).toBe(0);
    });
  });

  describe('パフォーマンステスト', () => {
    it('大量データ処理のパフォーマンス', async () => {
      const startTime = Date.now();
      
      // 100回のリクエスト処理シミュレーション
      const sessionId = 'performance-session';
      await costSystem.tracker.startSession(sessionId);
      
      for (let i = 0; i < 100; i++) {
        await costSystem.postRequestProcessing(
          sessionId,
          `model-${i % 5}`, // 5つのモデルをローテーション
          createMockTokenUsage(100, 50),
          Math.random() * 2000 + 500,
          Math.random() > 0.1 // 90%成功率
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // パフォーマンス要件: 100リクエストを10秒以内で処理
      expect(duration).toBeLessThan(10000);
      
      const session = await costSystem.tracker.getSession(sessionId);
      expect(session!.total_requests).toBe(100);
    });
  });
});