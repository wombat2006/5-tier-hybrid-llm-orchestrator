const { LLMOrchestrator } = require('./dist/orchestrator/LLMOrchestrator');
const { MockQwenClient } = require('./dist/clients/MockQwenClient');

class PerformanceMetricsTestSuite {
  constructor() {
    this.testResults = [];
    this.performanceMetrics = {
      totalCost: 0,
      totalRequests: 0,
      totalTokens: 0,
      averageLatency: 0,
      modelUsageBreakdown: {},
      costEfficiencyRatio: 0
    };
  }

  async runPerformanceTests() {
    console.log('⚡ === パフォーマンス・コストメトリクス検証テスト ===\n');

    const orchestrator = new LLMOrchestrator();
    
    // パフォーマンステスト用のタスクセット
    const performanceTestTasks = [
      {
        name: 'Quick Script Generation',
        request: {
          originalPrompt: 'Create a simple file reading utility function in Python',
          targetLanguage: 'python',
          complexityPreference: 'balanced',
          maxSubtasks: 2,
          context: 'Performance test: quick task'
        },
        expectedCostRange: { min: 0.005, max: 0.050 },
        expectedLatencyMax: 5000
      },
      {
        name: 'Medium Complexity Task',
        request: {
          originalPrompt: 'Implement a REST API endpoint with authentication middleware and error handling',
          targetLanguage: 'typescript',
          complexityPreference: 'balanced',
          maxSubtasks: 4,
          context: 'Performance test: medium complexity'
        },
        expectedCostRange: { min: 0.015, max: 0.100 },
        expectedLatencyMax: 8000
      },
      {
        name: 'High Complexity Task',
        request: {
          originalPrompt: 'Build a full-featured user management system with role-based access control, JWT authentication, and audit logging',
          targetLanguage: 'typescript',
          complexityPreference: 'thorough',
          maxSubtasks: 6,
          context: 'Performance test: high complexity'
        },
        expectedCostRange: { min: 0.030, max: 0.150 },
        expectedLatencyMax: 12000
      }
    ];

    console.log('📊 テスト設定:');
    console.log(`   テストタスク数: ${performanceTestTasks.length}`);
    console.log(`   月間予算: $70.00`);
    console.log(`   目標コスト効率: <0.5% of budget per task`);

    const startTime = Date.now();

    for (let i = 0; i < performanceTestTasks.length; i++) {
      const testTask = performanceTestTasks[i];
      console.log(`\n🎯 パフォーマンステスト ${i + 1}/${performanceTestTasks.length}: ${testTask.name}`);
      
      await this.runSinglePerformanceTest(testTask, orchestrator);
      
      // テスト間の間隔
      if (i < performanceTestTasks.length - 1) {
        console.log('\n⏱️  次のテストまで1秒待機...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const totalTime = Date.now() - startTime;

    // メトリクス集計
    await this.collectSystemMetrics(orchestrator);
    
    // パフォーマンス分析
    this.analyzePerformanceMetrics(totalTime);
    
    // コスト効率分析
    this.analyzeCostEfficiency();
    
    // システム健全性チェック
    await this.checkSystemHealth(orchestrator);
    
    this.generatePerformanceReport();
  }

  async runSinglePerformanceTest(testTask, orchestrator) {
    const taskStartTime = Date.now();
    let taskCost = 0;
    let taskTokens = 0;
    
    try {
      console.log(`📝 タスク: ${testTask.request.originalPrompt.substring(0, 80)}...`);
      
      const session = await orchestrator.processCollaborativeCoding(testTask.request);
      
      const taskLatency = Date.now() - taskStartTime;
      taskCost = session.metrics.totalCost;
      taskTokens = session.metrics.totalTokens;
      
      const result = {
        testName: testTask.name,
        success: session.status === 'completed',
        latency: taskLatency,
        cost: taskCost,
        tokens: taskTokens,
        subtasks: {
          total: session.progress.total,
          completed: session.progress.completed,
          failed: session.progress.failed
        },
        qualityScore: session.metrics.qualityScore,
        modelBreakdown: session.metrics.modelBreakdown || {},
        expectedCostRange: testTask.expectedCostRange,
        expectedLatencyMax: testTask.expectedLatencyMax,
        costEfficient: taskCost <= testTask.expectedCostRange.max,
        performant: taskLatency <= testTask.expectedLatencyMax
      };

      this.testResults.push(result);
      
      // メトリクス蓄積
      this.performanceMetrics.totalCost += taskCost;
      this.performanceMetrics.totalRequests++;
      this.performanceMetrics.totalTokens += taskTokens;
      
      console.log(`✅ テスト完了: ${result.success ? '成功' : '失敗'}`);
      console.log(`⚡ レイテンシ: ${taskLatency}ms ${result.performant ? '✅' : '⚠️'} (上限: ${testTask.expectedLatencyMax}ms)`);
      console.log(`💰 コスト: $${taskCost.toFixed(4)} ${result.costEfficient ? '✅' : '⚠️'} (範囲: $${testTask.expectedCostRange.min.toFixed(3)}-$${testTask.expectedCostRange.max.toFixed(3)})`);
      console.log(`📊 サブタスク: ${result.subtasks.completed}/${result.subtasks.total} 完了`);
      console.log(`🏆 品質スコア: ${result.qualityScore.toFixed(1)}/100`);
      console.log(`🔢 トークン数: ${taskTokens.toLocaleString()}`);

    } catch (error) {
      console.error(`❌ パフォーマンステスト \"${testTask.name}\" でエラー:`, error.message);
      
      const taskLatency = Date.now() - taskStartTime;
      
      this.testResults.push({
        testName: testTask.name,
        success: false,
        error: error.message,
        latency: taskLatency,
        cost: 0,
        tokens: 0
      });
    }
  }

  async collectSystemMetrics(orchestrator) {
    console.log('\n🔍 システムメトリクス収集中...');
    
    try {
      // クライアント統計の収集
      const clients = orchestrator.clients;
      
      for (const [clientName, client] of clients.entries()) {
        if (typeof client.getUsageStats === 'function') {
          const stats = await client.getUsageStats();
          this.performanceMetrics.modelUsageBreakdown[clientName] = {
            totalRequests: stats.total_requests,
            successfulRequests: stats.successful_requests,
            failedRequests: stats.failed_requests,
            averageLatency: stats.average_latency_ms,
            totalTokens: stats.total_tokens_used,
            totalCost: stats.total_cost_usd
          };
          
          console.log(`📊 ${clientName}:`);
          console.log(`   リクエスト: ${stats.total_requests} (成功: ${stats.successful_requests}, 失敗: ${stats.failed_requests})`);
          console.log(`   平均レイテンシ: ${stats.average_latency_ms.toFixed(1)}ms`);
          console.log(`   トークン数: ${stats.total_tokens_used.toLocaleString()}`);
          console.log(`   コスト: $${stats.total_cost_usd.toFixed(4)}`);
        }
      }
      
      // 平均レイテンシ計算
      const totalLatency = this.testResults.reduce((sum, result) => sum + result.latency, 0);
      this.performanceMetrics.averageLatency = totalLatency / this.testResults.length;
      
    } catch (error) {
      console.error('⚠️ システムメトリクス収集中にエラー:', error.message);
    }
  }

  analyzePerformanceMetrics(totalTime) {
    console.log('\n📈 === パフォーマンス分析 ===');
    
    const successfulTests = this.testResults.filter(r => r.success);
    const performantTests = this.testResults.filter(r => r.performant);
    
    console.log(`\n🎯 パフォーマンス統計:`);
    console.log(`   総処理時間: ${(totalTime / 1000).toFixed(1)}秒`);
    console.log(`   平均レイテンシ: ${this.performanceMetrics.averageLatency.toFixed(1)}ms`);
    console.log(`   成功率: ${(successfulTests.length / this.testResults.length * 100).toFixed(1)}%`);
    console.log(`   パフォーマンス達成率: ${(performantTests.length / this.testResults.length * 100).toFixed(1)}%`);
    
    if (successfulTests.length > 0) {
      const avgQuality = successfulTests.reduce((sum, r) => sum + r.qualityScore, 0) / successfulTests.length;
      console.log(`   平均品質スコア: ${avgQuality.toFixed(1)}/100`);
      
      const avgSubtaskCompletion = successfulTests.reduce((sum, r) => 
        sum + (r.subtasks.completed / r.subtasks.total), 0) / successfulTests.length;
      console.log(`   平均サブタスク完了率: ${(avgSubtaskCompletion * 100).toFixed(1)}%`);
    }
    
    // レイテンシ分析
    console.log(`\n⚡ レイテンシ分析:`);
    const latencies = successfulTests.map(r => r.latency);
    if (latencies.length > 0) {
      const minLatency = Math.min(...latencies);
      const maxLatency = Math.max(...latencies);
      const medianLatency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)];
      
      console.log(`   最速: ${minLatency}ms`);
      console.log(`   最遅: ${maxLatency}ms`);
      console.log(`   中央値: ${medianLatency}ms`);
    }
  }

  analyzeCostEfficiency() {
    console.log('\n💰 === コスト効率分析 ===');
    
    const monthlyBudget = 70.00;
    const budgetUsedPercent = (this.performanceMetrics.totalCost / monthlyBudget) * 100;
    
    console.log(`\n📊 コスト統計:`);
    console.log(`   総コスト: $${this.performanceMetrics.totalCost.toFixed(4)}`);
    console.log(`   月間予算使用率: ${budgetUsedPercent.toFixed(3)}%`);
    console.log(`   総トークン数: ${this.performanceMetrics.totalTokens.toLocaleString()}`);
    
    if (this.performanceMetrics.totalTokens > 0) {
      const costPerToken = this.performanceMetrics.totalCost / this.performanceMetrics.totalTokens;
      console.log(`   トークン単価: $${costPerToken.toFixed(6)}/token`);
    }
    
    const costEfficientTests = this.testResults.filter(r => r.costEfficient);
    console.log(`   コスト効率達成率: ${(costEfficientTests.length / this.testResults.length * 100).toFixed(1)}%`);
    
    // モデル別コスト分析
    console.log(`\n🔍 モデル別コスト内訳:`);
    Object.entries(this.performanceMetrics.modelUsageBreakdown).forEach(([model, stats]) => {
      const modelCostPercent = (stats.totalCost / this.performanceMetrics.totalCost) * 100;
      console.log(`   ${model}: $${stats.totalCost.toFixed(4)} (${modelCostPercent.toFixed(1)}%)`);
    });
    
    // コスト効率スコア計算
    this.performanceMetrics.costEfficiencyRatio = this.performanceMetrics.totalCost / this.testResults.length;
    console.log(`\n🏆 タスク単価: $${this.performanceMetrics.costEfficiencyRatio.toFixed(4)}/task`);
  }

  async checkSystemHealth(orchestrator) {
    console.log('\n🔧 === システム健全性チェック ===');
    
    try {
      const clients = orchestrator.clients;
      let healthyClients = 0;
      let totalClients = 0;
      
      for (const [clientName, client] of clients.entries()) {
        totalClients++;
        
        if (typeof client.isHealthy === 'function') {
          const isHealthy = await client.isHealthy();
          console.log(`${isHealthy ? '✅' : '❌'} ${clientName}: ${isHealthy ? '正常' : '異常'}`);
          
          if (isHealthy) healthyClients++;
        } else {
          console.log(`⚠️  ${clientName}: 健全性チェック未対応`);
        }
      }
      
      const systemHealthPercent = (healthyClients / totalClients) * 100;
      console.log(`\n🏥 システム健全性: ${systemHealthPercent.toFixed(1)}% (${healthyClients}/${totalClients})`);
      
      // メモリ使用量チェック（概算）
      const usedMemory = process.memoryUsage();
      console.log(`\n💾 メモリ使用量:`);
      console.log(`   RSS: ${(usedMemory.rss / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   Heap使用量: ${(usedMemory.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   Heap合計: ${(usedMemory.heapTotal / 1024 / 1024).toFixed(1)}MB`);
      
    } catch (error) {
      console.error('❌ システム健全性チェック中にエラー:', error.message);
    }
  }

  generatePerformanceReport() {
    console.log('\n\n📋 === パフォーマンス・コストメトリクス検証レポート ===');
    
    const successCount = this.testResults.filter(r => r.success).length;
    const performantCount = this.testResults.filter(r => r.performant).length;
    const costEfficientCount = this.testResults.filter(r => r.costEfficient).length;
    
    console.log(`\n🎯 総合結果:`);
    console.log(`   成功率: ${successCount}/${this.testResults.length} (${(successCount/this.testResults.length*100).toFixed(1)}%)`);
    console.log(`   パフォーマンス達成: ${performantCount}/${this.testResults.length} (${(performantCount/this.testResults.length*100).toFixed(1)}%)`);
    console.log(`   コスト効率達成: ${costEfficientCount}/${this.testResults.length} (${(costEfficientCount/this.testResults.length*100).toFixed(1)}%)`);
    
    console.log(`\n📊 主要メトリクス:`);
    console.log(`   総コスト: $${this.performanceMetrics.totalCost.toFixed(4)}`);
    console.log(`   平均レイテンシ: ${this.performanceMetrics.averageLatency.toFixed(1)}ms`);
    console.log(`   総トークン数: ${this.performanceMetrics.totalTokens.toLocaleString()}`);
    console.log(`   タスク単価: $${this.performanceMetrics.costEfficiencyRatio.toFixed(4)}`);
    
    console.log(`\n📋 詳細結果:`);
    this.testResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.testName}:`);
      console.log(`   結果: ${result.success ? '✅ 成功' : '❌ 失敗'}`);
      if (result.success) {
        console.log(`   レイテンシ: ${result.latency}ms ${result.performant ? '✅' : '⚠️'}`);
        console.log(`   コスト: $${result.cost.toFixed(4)} ${result.costEfficient ? '✅' : '⚠️'}`);
        console.log(`   品質スコア: ${result.qualityScore.toFixed(1)}/100`);
        console.log(`   完了率: ${((result.subtasks.completed / result.subtasks.total) * 100).toFixed(1)}%`);
      } else {
        console.log(`   エラー: ${result.error}`);
      }
      console.log('');
    });

    console.log('🔍 システム評価:');
    
    // 全体的なシステム評価
    const overallScore = (
      (successCount / this.testResults.length * 0.4) +
      (performantCount / this.testResults.length * 0.3) +
      (costEfficientCount / this.testResults.length * 0.3)
    ) * 100;
    
    console.log(`✅ 総合システムスコア: ${overallScore.toFixed(1)}/100`);
    
    if (overallScore >= 90) {
      console.log('🏆 優秀: システムは非常に高いパフォーマンスとコスト効率を達成しています');
    } else if (overallScore >= 75) {
      console.log('✅ 良好: システムは良好なパフォーマンスを発揮しています');
    } else if (overallScore >= 60) {
      console.log('⚠️ 要改善: 一部のメトリクスで改善が必要です');
    } else {
      console.log('❌ 問題あり: システムの大幅な改善が必要です');
    }
    
    console.log('\n=================================\n');
  }
}

async function runPerformanceMetricsTests() {
  const testSuite = new PerformanceMetricsTestSuite();
  
  try {
    await testSuite.runPerformanceTests();
    console.log('🎉 パフォーマンス・コストメトリクス検証テストが完了しました！');
    
  } catch (error) {
    console.error('❌ パフォーマンステスト中にエラーが発生:', error);
  }
}

runPerformanceMetricsTests();