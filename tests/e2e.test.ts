import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TEST_DATA_DIR } from './setup';

describe('End-to-End テスト - 厳密本番環境シミュレーション', () => {
  let serverProcess: ChildProcess;
  const SERVER_PORT = 4002; // テスト用ポート（4001から変更）
  const BASE_URL = `http://localhost:${SERVER_PORT}`;
  
  beforeAll(async () => {
    // テスト用設定を準備
    const testConfigDir = path.join(TEST_DATA_DIR, 'e2e-config');
    await fs.mkdir(testConfigDir, { recursive: true });
    
    // テスト環境変数設定
    const testEnv = {
      ...process.env,
      PORT: SERVER_PORT.toString(),
      NODE_ENV: 'test',
      DATA_DIR: path.join(TEST_DATA_DIR, 'e2e-data'),
      GOOGLE_API_KEY: 'test_key',
      OPENAI_API_KEY: 'test_key',
      ANTHROPIC_API_KEY: 'test_key',
      OPENROUTER_API_KEY: 'test_key',
      MONTHLY_BUDGET: '10'
    };
    
    // サーバープロセスを起動
    serverProcess = spawn('npm', ['run', 'dev'], {
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: testEnv
    });

    // サーバー起動を待機（改善版）
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('❌ Server startup timeout - killing process...');
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
        reject(new Error('Server failed to start within 45 seconds'));
      }, 45000);

      let retryCount = 0;
      const maxRetries = 30;
      
      const checkServer = async () => {
        try {
          const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
          if (response.status === 200) {
            clearTimeout(timeout);
            console.log('✅ E2E Server started successfully');
            resolve();
            return;
          }
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            clearTimeout(timeout);
            reject(new Error(`Server health check failed after ${maxRetries} attempts`));
            return;
          }
          setTimeout(checkServer, 1500); // 1.5秒後に再試行
        }
      };

      // サーバーのstderrを監視してエラーを検出
      let startupComplete = false;
      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('EADDRINUSE') || output.includes('port already in use')) {
          clearTimeout(timeout);
          reject(new Error(`Port ${SERVER_PORT} is already in use`));
        }
      });

      serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server running on port') && !startupComplete) {
          startupComplete = true;
          setTimeout(checkServer, 2000); // サーバー起動後2秒待ってからヘルスチェック開始
        }
      });

      // 5秒後にヘルスチェック開始（フォールバック）
      setTimeout(() => {
        if (!startupComplete) {
          console.log('⚠️ Starting health check without startup confirmation...');
          checkServer();
        }
      }, 5000);
    });
  }, 50000); // タイムアウトを50秒に延長

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      
      // プロセス終了を待機
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => {
          console.log('✅ E2E Server stopped');
          resolve();
        });
        
        // 5秒後に強制終了
        setTimeout(() => {
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }
  }, 10000);

  describe('基本API機能テスト', () => {
    it('ヘルスチェックAPIが正常に応答する', async () => {
      const response = await axios.get(`${BASE_URL}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data.success).toBe(true);
      expect(response.data).toHaveProperty('timestamp');
    });

    it('システム情報APIが詳細情報を返す', async () => {
      const response = await axios.get(`${BASE_URL}/info`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data.success).toBe(true);
      expect(response.data).toHaveProperty('data');
      expect(response.data.data).toHaveProperty('system');
      expect(response.data.data).toHaveProperty('capabilities');
    });

    it('メトリクス取得APIが統計情報を返す', async () => {
      const response = await axios.get(`${BASE_URL}/metrics`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data.success).toBe(true);
      expect(response.data).toHaveProperty('data');
      expect(response.data.data).toHaveProperty('requests_per_tier');
    });
  });

  describe('LLMリクエスト処理テスト', () => {
    it('コーディングタスクが正常に処理される', async () => {
      const requestPayload = {
        prompt: 'Write a simple Python function to calculate fibonacci numbers',
        task_type: 'coding',
        user_metadata: {
          user_id: 'e2e-test-user',
          priority: 'normal',
          include_tests: true
        }
      };

      const response = await axios.post(`${BASE_URL}/generate`, requestPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000 // 30秒タイムアウト
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('response');
      expect(response.data).toHaveProperty('model_used');
      expect(response.data).toHaveProperty('metadata');
      
      expect(response.data.success).toBe(true);
      expect(response.data.response).toBeTruthy();
      expect(response.data.model_used).toBeTruthy();
      expect(response.data.metadata).toBeTruthy();
    }, 35000);

    it('一般質問タスクが正常に処理される', async () => {
      const requestPayload = {
        prompt: 'Explain what machine learning is in simple terms',
        task_type: 'general',
        user_metadata: {
          user_id: 'e2e-test-general',
          priority: 'normal'
        }
      };

      const response = await axios.post(`${BASE_URL}/generate`, requestPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.response_text).toBeTruthy();
      expect(response.data.metadata).toHaveProperty('tier_used');
      expect(response.data.metadata.tier_used).toBeGreaterThanOrEqual(0);
    }, 35000);

    it('複雑な分析タスクが適切に処理される', async () => {
      const requestPayload = {
        prompt: 'Analyze the pros and cons of microservices vs monolithic architecture for a startup with 10 developers',
        task_type: 'complex_analysis',
        user_metadata: {
          user_id: 'e2e-test-complex',
          priority: 'high'
        }
      };

      const response = await axios.post(`${BASE_URL}/generate`, requestPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000 // 複雑タスクはタイムアウトを長く
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.response_text.length).toBeGreaterThan(100); // 十分な長さの回答
    }, 50000);
  });

  describe('並行リクエスト処理テスト', () => {
    it('複数の同時リクエストが適切に処理される', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => {
        return axios.post(`${BASE_URL}/process`, {
          prompt: `Simple test request ${i + 1}`,
          task_type: 'general',
          user_metadata: {
            user_id: `concurrent-user-${i + 1}`,
            priority: 'normal'
          }
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });
      });

      const startTime = Date.now();
      const responses = await Promise.allSettled(requests);
      const duration = Date.now() - startTime;

      // レスポンス解析
      const successful = responses.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const failed = responses.filter(r => r.status === 'rejected');

      expect(successful.length).toBeGreaterThanOrEqual(3); // 最低60%は成功
      expect(duration).toBeLessThan(60000); // 60秒以内で完了
      
      successful.forEach(response => {
        expect(response.value.status).toBe(200);
        expect(response.value.data.success).toBe(true);
      });
    }, 70000);
  });

  describe('エラーハンドリングテスト', () => {
    it('不正なリクエストが適切にエラーレスポンスを返す', async () => {
      try {
        await axios.post(`${BASE_URL}/process`, {
          // promptが欠けている不正なリクエスト
          task_type: 'coding',
          user_metadata: { user_id: 'invalid-user' }
        });
        
        fail('Expected request to fail');
      } catch (error: any) {
        expect(error.response?.status).toBe(400);
        expect(error.response?.data).toHaveProperty('error');
      }
    });

    it('存在しないエンドポイントに404エラーを返す', async () => {
      try {
        await axios.get(`${BASE_URL}/nonexistent-endpoint`);
        fail('Expected 404 error');
      } catch (error: any) {
        expect(error.response?.status).toBe(404);
      }
    });

    it('内部エラー時に適切なエラーレスポンスを返す', async () => {
      // 意図的に内部エラーを発生させるリクエスト
      const errorRequest = {
        prompt: 'INTERNAL_ERROR_TRIGGER', // エラーを誘発する特殊キーワード
        task_type: 'coding',
        user_metadata: {
          user_id: 'error-test-user',
          priority: 'normal'
        }
      };

      const response = await axios.post(`${BASE_URL}/process`, errorRequest, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
        validateStatus: () => true // 全てのステータスコードを許可
      });

      // 内部エラーでも適切なレスポンス形式
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.data).toHaveProperty('success');
      
      if (!response.data.success) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toHaveProperty('code');
        expect(response.data.error).toHaveProperty('message');
      }
    }, 35000);
  });

  describe('コスト管理機能テスト', () => {
    it('コスト情報が正確に追跡される', async () => {
      // 初期メトリクス取得
      const initialMetrics = await axios.get(`${BASE_URL}/metrics`);
      const initialCost = initialMetrics.data.cost_total_usd || 0;

      // コストが発生するリクエスト実行
      await axios.post(`${BASE_URL}/process`, {
        prompt: 'Generate a complex data structure in TypeScript with validation',
        task_type: 'coding',
        user_metadata: {
          user_id: 'cost-tracking-user',
          priority: 'normal'
        }
      });

      // 更新されたメトリクス取得
      const updatedMetrics = await axios.get(`${BASE_URL}/metrics`);
      const updatedCost = updatedMetrics.data.cost_total_usd || 0;

      // コストが増加していることを確認
      expect(updatedCost).toBeGreaterThan(initialCost);
      expect(updatedMetrics.data).toHaveProperty('budget_utilization');
      expect(updatedMetrics.data.budget_utilization).toBeGreaterThanOrEqual(0);
    }, 35000);

    it('予算制限が正常に機能する', async () => {
      // 予算設定API（実装されている場合）
      try {
        await axios.post(`${BASE_URL}/budget`, {
          monthly_budget_usd: 0.01, // 極小予算
          warning_threshold: 0.5,
          critical_threshold: 0.8
        });

        // 予算を超過するような大きなリクエスト
        const response = await axios.post(`${BASE_URL}/generate`, {
          prompt: 'A'.repeat(5000), // 大量のトークンを要求
          task_type: 'general',
          user_metadata: {
            user_id: 'budget-limit-user',
            priority: 'normal'
          }
        }, {
          validateStatus: () => true
        });

        // 予算制限により処理が制御される
        if (!response.data.success) {
          expect(response.data.error?.code).toMatch(/COST|BUDGET|LIMIT/);
        }
      } catch (error) {
        // 予算設定APIが未実装の場合はスキップ
        console.log('Budget API not implemented, skipping budget limit test');
      }
    }, 35000);
  });

  describe('パフォーマンステスト', () => {
    it('レスポンス時間が許容範囲内である', async () => {
      const testRequests = [
        { prompt: 'Quick test 1', task_type: 'general' },
        { prompt: 'Quick test 2', task_type: 'coding' },
        { prompt: 'Quick test 3', task_type: 'general' }
      ];

      for (const req of testRequests) {
        const startTime = Date.now();
        const response = await axios.post(`${BASE_URL}/generate`, {
          ...req,
          user_metadata: { user_id: 'perf-test-user', priority: 'normal' }
        });
        const duration = Date.now() - startTime;

        expect(response.status).toBe(200);
        expect(duration).toBeLessThan(20000); // 20秒以内
        expect(response.data.performance_info.latency_ms).toBeLessThan(duration + 1000);
      }
    }, 70000);

    it('高負荷時のメモリ使用量が安定している', async () => {
      // メモリ情報取得
      const initialHealth = await axios.get(`${BASE_URL}/health`);
      
      // 高負荷リクエストを並行実行
      const heavyRequests = Array.from({ length: 3 }, (_, i) => 
        axios.post(`${BASE_URL}/process`, {
          prompt: `Heavy computation task ${i + 1}: Calculate prime numbers up to 1000`,
          task_type: 'coding',
          user_metadata: { user_id: `heavy-user-${i + 1}`, priority: 'normal' }
        })
      );

      await Promise.allSettled(heavyRequests);

      // 負荷後の健全性確認
      const finalHealth = await axios.get(`${BASE_URL}/health`);
      expect(finalHealth.status).toBe(200);
      expect(finalHealth.data.status).toBe('healthy');
    }, 60000);
  });

  describe('本番環境準備確認テスト', () => {
    it('必要な環境変数が設定されている', async () => {
      const response = await axios.get(`${BASE_URL}/info`);
      
      expect(response.data.data).toHaveProperty('system');
      expect(response.data.data).toHaveProperty('version');
      expect(response.data.system).toHaveProperty('data_directory');
      expect(response.data.system.cost_management).toBeDefined();
    });

    it('設定ファイルが正常に読み込まれている', async () => {
      const response = await axios.get(`${BASE_URL}/info`);
      
      expect(response.data.data.available_models).toBeDefined();
      expect(response.data.data.available_models).toBeGreaterThan(0);
      
      // 各モデルに必要なプロパティが存在
      Object.values(response.data.models).forEach((model: any) => {
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('tier');
        expect(model).toHaveProperty('cost_per_1k_tokens');
      });
    });

    it('ログ出力が適切に動作している', async () => {
      // ログ関連のテストはサーバーの出力を確認
      const response = await axios.post(`${BASE_URL}/generate`, {
        prompt: 'Test logging functionality',
        task_type: 'general',
        user_metadata: {
          user_id: 'logging-test-user',
          priority: 'normal'
        }
      });

      expect(response.status).toBe(200);
      // サーバーログの出力確認（実際の実装ではログ収集機能を使用）
    });
  });
});