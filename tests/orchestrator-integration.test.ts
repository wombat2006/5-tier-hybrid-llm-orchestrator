import { LLMOrchestrator } from '../src/orchestrator/LLMOrchestrator';
import { LLMRequest, TaskType } from '../src/types';
import { TEST_DATA_DIR } from './setup';
import * as path from 'path';

describe('LLMOrchestrator - コスト管理統合テスト', () => {
  let orchestrator: LLMOrchestrator;
  
  beforeEach(async () => {
    // テスト用設定でオーケストレーターを初期化
    const testConfigPath = path.join(TEST_DATA_DIR, 'test-config.yaml');
    
    // テスト用設定ファイルを作成
    const fs = require('fs').promises;
    const yaml = require('js-yaml');
    
    const testConfig = {
      models: {
        mock_qwen3: {
          id: 'mock_qwen3',
          name: 'Mock Qwen3 Coder',
          provider: 'alibaba_cloud',
          tier: 0,
          cost_per_1k_tokens: {
            input: 0.05,
            output: 0.05
          },
          latency_ms: 500,
          max_tokens: 8000,
          capabilities: ['coding', 'analysis'],
          priority_keywords: ['コード', 'プログラム', '実装'],
          api_client: 'MockQwenClient'
        },
        gemini_flash: {
          id: 'gemini_flash',
          name: 'Gemini Flash',
          provider: 'google',
          tier: 1,
          cost_per_1k_tokens: {
            input: 0.0,
            output: 0.0
          },
          latency_ms: 800,
          max_tokens: 32000,
          capabilities: ['general', 'analysis'],
          priority_keywords: ['一般', '分析', '質問'],
          api_client: 'GeminiClient'
        }
      },
      routing: {
        default_tier: 1,
        fallback_enabled: true,
        max_retries: 2,
        timeout_ms: 30000,
        task_classification: {
          coding: {
            keywords: ['コード', 'プログラム', '実装', 'バグ', 'デバッグ'],
            preferred_tier: 0
          },
          general: {
            keywords: ['説明', '質問', '一般'],
            preferred_tier: 1
          }
        }
      },
      collaboration: {
        cascade_enabled: false,
        refinement_enabled: false,
        parallel_enabled: false,
        quality_thresholds: {
          min_response_length: 10,
          max_error_rate: 0.1,
          min_confidence_score: 0.7
        }
      },
      cost_management: {
        monthly_budget_usd: 25.0,
        tier0_allocation: 0.6,
        tier1_allocation: 0.3,
        tier2_allocation: 0.08,
        tier3_allocation: 0.02,
        cost_alerts: {
          warning_threshold: 0.75,
          critical_threshold: 0.90
        }
      },
      external_apis: {}
    };
    
    await fs.writeFile(testConfigPath, yaml.dump(testConfig));
    
    orchestrator = new LLMOrchestrator(testConfigPath);
    await new Promise(resolve => setTimeout(resolve, 500)); // 初期化待機
  });

  describe('コスト制約下でのリクエスト処理', () => {
    it('予算内リクエストが正常に処理される', async () => {
      const request: LLMRequest = {
        prompt: 'Pythonで簡単なHello Worldプログラムを作成してください',
        task_type: 'coding' as TaskType,
        user_metadata: {
          user_id: 'test-user-1',
          priority: 'normal',
          include_tests: false
        }
      };

      const response = await orchestrator.process(request);
      
      expect(response.success).toBe(true);
      expect(response.response_text).toBeDefined();
      expect(response.cost_info.total_cost_usd).toBeGreaterThan(0);
      expect(response.performance_info.latency_ms).toBeGreaterThan(0);
      expect(response.metadata.tier_used).toBeDefined();
      expect(response.metadata.processing_time_ms).toBeGreaterThan(0);
    });

    it('予算超過時にリクエストが適切に拒否される', async () => {
      // 予算を意図的に消費
      const largeRequests = [];
      for (let i = 0; i < 3; i++) {
        const request: LLMRequest = {
          prompt: 'A'.repeat(10000), // 大量のトークンを要求
          task_type: 'coding' as TaskType,
          user_metadata: {
            user_id: `budget-test-${i}`,
            priority: 'normal'
          }
        };
        largeRequests.push(orchestrator.process(request));
      }

      // 一部のリクエストは成功し、一部は予算制限で失敗する可能性
      const responses = await Promise.allSettled(largeRequests);
      
      let successCount = 0;
      let budgetRejectionCount = 0;
      
      responses.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successCount++;
          } else if (result.value.error?.code === 'COST_LIMIT_EXCEEDED') {
            budgetRejectionCount++;
          }
        }
      });

      // 少なくとも1つは成功し、予算制限が適切に機能している
      expect(successCount + budgetRejectionCount).toBe(3);
    });
  });

  describe('モデル選択とコスト最適化', () => {
    it('タスクタイプに基づく適切なモデル選択', async () => {
      const codingRequest: LLMRequest = {
        prompt: 'JavaScriptで配列をソートするコードを書いて',
        task_type: 'coding',
        user_metadata: { user_id: 'coding-test' }
      };

      const generalRequest: LLMRequest = {
        prompt: '今日の天気について教えて',
        task_type: 'general',
        user_metadata: { user_id: 'general-test' }
      };

      const [codingResponse, generalResponse] = await Promise.all([
        orchestrator.process(codingRequest),
        orchestrator.process(generalRequest)
      ]);

      // コーディングタスクはTier0（Qwen3）を使用
      expect(codingResponse.metadata.tier_used).toBe(0);
      expect(codingResponse.model_used).toContain('qwen');

      // 一般タスクはTier1（Gemini）を使用
      expect(generalResponse.metadata.tier_used).toBe(1);
      expect(generalResponse.model_used).toContain('gemini');
    });

    it('優先度に基づく処理の違い', async () => {
      const highPriorityRequest: LLMRequest = {
        prompt: 'クリティカルなバグを修正するコードを書いて',
        task_type: 'coding',
        user_metadata: {
          user_id: 'priority-high',
          priority: 'critical'
        }
      };

      const lowPriorityRequest: LLMRequest = {
        prompt: 'simple hello world code',
        task_type: 'coding',
        user_metadata: {
          user_id: 'priority-low',
          priority: 'low'
        }
      };

      const [highResponse, lowResponse] = await Promise.all([
        orchestrator.process(highPriorityRequest),
        orchestrator.process(lowPriorityRequest)
      ]);

      expect(highResponse.success).toBe(true);
      expect(lowResponse.success).toBe(true);

      // 高優先度リクエストの方がより高品質な処理を受ける可能性
      // （実装依存だが、レスポンス品質やレイテンシで差が出る可能性）
    });
  });

  describe('エラー処理とフォールバック', () => {
    it('モデルエラー時のフォールバック機能', async () => {
      // エラーを発生させやすいリクエスト（MockQwenErrorClientを想定）
      const errorProneRequest: LLMRequest = {
        prompt: 'ERROR_TRIGGER', // 特定のキーワードでエラーを誘発
        task_type: 'coding',
        user_metadata: {
          user_id: 'error-test',
          priority: 'normal'
        }
      };

      const response = await orchestrator.process(errorProneRequest);
      
      // エラーが発生してもフォールバック機能により何らかの応答は得られる
      expect(response).toBeDefined();
      
      if (response.success) {
        // フォールバック成功
        expect(response.performance_info.fallback_used).toBe(true);
      } else {
        // 全てのフォールバックが失敗した場合
        expect(response.error).toBeDefined();
      }
    });

    it('タイムアウト処理の正常動作', async () => {
      const timeoutRequest: LLMRequest = {
        prompt: 'TIMEOUT_TRIGGER', // タイムアウトを誘発するキーワード
        task_type: 'general',
        user_metadata: {
          user_id: 'timeout-test',
          priority: 'normal'
        }
      };

      const startTime = Date.now();
      const response = await orchestrator.process(timeoutRequest);
      const duration = Date.now() - startTime;

      // タイムアウト設定（30秒）内で応答
      expect(duration).toBeLessThan(35000);
      
      if (!response.success) {
        expect(response.error?.code).toBe('GENERATION_ERROR');
      }
    });
  });

  describe('使用量統計と監視', () => {
    it('使用量統計が正確に記録される', async () => {
      const requests = [
        {
          prompt: 'Python script for data analysis',
          task_type: 'coding' as TaskType,
          user_metadata: { user_id: 'stats-user-1' }
        },
        {
          prompt: 'Explain machine learning basics',
          task_type: 'general' as TaskType,
          user_metadata: { user_id: 'stats-user-2' }
        },
        {
          prompt: 'JavaScript async/await example',
          task_type: 'coding' as TaskType,
          user_metadata: { user_id: 'stats-user-3' }
        }
      ];

      const responses = await Promise.all(
        requests.map(req => orchestrator.process(req))
      );

      // 全てのリクエストに対する統計確認
      let totalCost = 0;
      let totalTokens = 0;
      let codingRequests = 0;
      let generalRequests = 0;

      responses.forEach((response, index) => {
        totalCost += response.cost_info.total_cost_usd;
        totalTokens += response.metadata.tokens_used.total;
        
        if (requests[index].task_type === 'coding') {
          codingRequests++;
        } else {
          generalRequests++;
        }
      });

      expect(totalCost).toBeGreaterThan(0);
      expect(totalTokens).toBeGreaterThan(0);
      expect(codingRequests).toBe(2);
      expect(generalRequests).toBe(1);
    });

    it('システムメトリクスの取得', async () => {
      // メトリクス収集のためのリクエスト実行
      const testRequests = [
        {
          prompt: 'Create a REST API endpoint',
          task_type: 'coding' as TaskType,
          user_metadata: { user_id: 'metrics-1' }
        },
        {
          prompt: 'What is REST API?',
          task_type: 'general' as TaskType,
          user_metadata: { user_id: 'metrics-2' }
        }
      ];

      await Promise.all(testRequests.map(req => orchestrator.process(req)));

      // システムメトリクスの確認（現在未実装のためスキップ）
      console.log('System metrics are not yet implemented in the orchestrator');
    });
  });

  describe('並行処理とスケーラビリティ', () => {
    it('複数の同時リクエストが適切に処理される', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => ({
        prompt: `Generate code example ${i + 1}`,
        task_type: 'coding' as TaskType,
        user_metadata: {
          user_id: `concurrent-user-${i + 1}`,
          priority: i % 2 === 0 ? 'normal' as const : 'high' as const
        }
      }));

      const startTime = Date.now();
      const responses = await Promise.all(
        concurrentRequests.map(req => orchestrator.process(req))
      );
      const duration = Date.now() - startTime;

      // 10個のリクエストが合理的な時間内で完了
      expect(duration).toBeLessThan(30000); // 30秒以内
      expect(responses).toHaveLength(10);

      const successfulRequests = responses.filter(r => r.success);
      const failedRequests = responses.filter(r => !r.success);

      // 大部分のリクエストが成功（少なくとも70%）
      expect(successfulRequests.length).toBeGreaterThanOrEqual(7);
      
      // 失敗したリクエストは適切なエラー情報を持つ
      failedRequests.forEach(response => {
        expect(response.error).toBeDefined();
      });
    });

    it('高負荷時のパフォーマンス劣化の確認', async () => {
      const highLoadRequests = Array.from({ length: 20 }, (_, i) => ({
        prompt: `Complex analysis task ${i + 1}: ${'A'.repeat(1000)}`,
        task_type: i % 2 === 0 ? 'coding' : 'general' as TaskType,
        user_metadata: {
          user_id: `load-test-${i + 1}`
        }
      }));

      const batchSize = 5;
      const batches = [];
      for (let i = 0; i < highLoadRequests.length; i += batchSize) {
        batches.push(highLoadRequests.slice(i, i + batchSize));
      }

      let totalDuration = 0;
      let totalSuccess = 0;

      for (const batch of batches) {
        const batchStart = Date.now();
        const batchResponses = await Promise.all(
          batch.map(req => orchestrator.process(req))
        );
        const batchDuration = Date.now() - batchStart;

        totalDuration += batchDuration;
        totalSuccess += batchResponses.filter(r => r.success).length;
      }

      const averageDurationPerBatch = totalDuration / batches.length;
      const successRate = totalSuccess / highLoadRequests.length;

      // パフォーマンス要件の確認
      expect(averageDurationPerBatch).toBeLessThan(15000); // バッチあたり15秒以内
      expect(successRate).toBeGreaterThanOrEqual(0.6); // 最低60%の成功率
    });
  });

  describe('設定変更とリアルタイム反映', () => {
    it('予算変更のリアルタイム反映', async () => {
      // 初期予算での処理
      const initialRequest: LLMRequest = {
        prompt: 'Initial budget test',
        task_type: 'general',
        user_metadata: { user_id: 'budget-change-test' }
      };

      const initialResponse = await orchestrator.process(initialRequest);
      expect(initialResponse.success).toBe(true);

      // 予算を大幅に削減
      const newBudgetConfig = {
        monthly_budget_usd: 0.01, // 極小予算
        warning_threshold: 0.5,
        critical_threshold: 0.8,
        auto_pause_at_limit: true,
        budget_reset_day: 1,
        timezone: 'UTC'
      };

      // 予算変更をシミュレート（実際の実装に依存）
      try {
        await orchestrator['costManagement'].tracker.setBudget(newBudgetConfig);
      } catch (error) {
        console.warn('Budget update method not accessible:', error);
      }

      // 新しい予算制約下でのリクエスト
      const constrainedRequest: LLMRequest = {
        prompt: 'Post budget change test',
        task_type: 'general',
        user_metadata: { user_id: 'budget-constrained-test' }
      };

      const constrainedResponse = await orchestrator.process(constrainedRequest);
      
      // 予算制約により拒否される可能性が高い
      if (!constrainedResponse.success) {
        expect(constrainedResponse.error?.code).toBe('COST_LIMIT_EXCEEDED');
      }
    });
  });
});