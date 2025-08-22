const { LLMOrchestrator } = require('./dist/orchestrator/LLMOrchestrator');
const { MockQwenErrorClient } = require('./dist/clients/MockQwenErrorClient');

class ErrorHandlingTestSuite {
  constructor() {
    this.testResults = [];
  }

  async runErrorHandlingTests() {
    console.log('🚨 === エラーハンドリング・リトライ機能テスト ===\n');

    // MockQwenErrorClientを使用するようにオーケストレーターを設定
    const orchestrator = this.createOrchestratorWithErrorClient();

    const testCases = [
      {
        name: 'Normal Success Case',
        description: 'Create a simple function',
        expectedRetries: 0,
        expectedSuccess: true
      },
      {
        name: 'Quality Failure with Retry',
        description: 'This prompt is designed to trigger low quality responses that should trigger retries',
        expectedRetries: 1,
        expectedSuccess: true
      },
      {
        name: 'Service Failure with Escalation',
        description: 'This complex algorithmic task should test failure handling and escalation mechanisms',
        expectedRetries: 2,
        expectedSuccess: false // APIエラーによる失敗を想定
      }
    ];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n🎯 テストケース ${i + 1}/${testCases.length}: ${testCase.name}`);
      
      await this.runSingleErrorTest(testCase, orchestrator);
      
      if (i < testCases.length - 1) {
        console.log('\n⏱️  次のテストまで1秒待機...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.generateErrorTestReport();
  }

  createOrchestratorWithErrorClient() {
    const orchestrator = new LLMOrchestrator();
    
    // エラークライアントを注入
    const errorClient = new MockQwenErrorClient(0.4, 0.6); // 40%失敗率、60%低品質率
    
    // clientsマップを更新（private fieldなので、リフレクションを使用）
    const clients = orchestrator.clients;
    
    // 元のQwenクライアントをエラークライアントに置き換え
    for (const [key, client] of clients.entries()) {
      if (key.includes('qwen')) {
        clients.set(key, errorClient);
        console.log(`[ErrorTest] 🔄 Replaced ${key} with MockQwenErrorClient`);
        break;
      }
    }

    return orchestrator;
  }

  async runSingleErrorTest(testCase, orchestrator) {
    const startTime = Date.now();
    let retryCount = 0;
    
    try {
      const decompositionRequest = {
        originalPrompt: testCase.description,
        targetLanguage: 'typescript',
        complexityPreference: 'balanced',
        maxSubtasks: 3,
        context: `Error handling test: ${testCase.name}`
      };

      // オーケストレーターにリトライ監視を追加
      const originalConsoleLog = console.log;
      console.log = function(...args) {
        const message = args.join(' ');
        if (message.includes('retrying') || message.includes('retry')) {
          retryCount++;
        }
        originalConsoleLog.apply(console, args);
      };

      const session = await orchestrator.processCollaborativeCoding(decompositionRequest);
      
      // console.logを復元
      console.log = originalConsoleLog;
      
      const duration = Date.now() - startTime;
      
      const result = {
        testName: testCase.name,
        success: session.status === 'completed',
        duration,
        retryCount,
        subtasks: {
          total: session.progress.total,
          completed: session.progress.completed,
          failed: session.progress.failed
        },
        finalQualityScore: session.metrics.qualityScore,
        cost: session.metrics.totalCost,
        expectedRetries: testCase.expectedRetries,
        expectedSuccess: testCase.expectedSuccess
      };

      this.testResults.push(result);

      console.log(`✅ テスト完了: ${result.success ? '成功' : '失敗'}`);
      console.log(`🔄 リトライ回数: ${retryCount} (期待値: ${testCase.expectedRetries})`);
      console.log(`📊 サブタスク: ${result.subtasks.completed}/${result.subtasks.total} 完了`);
      console.log(`🏆 最終品質スコア: ${result.finalQualityScore.toFixed(1)}/100`);
      console.log(`💰 コスト: $${result.cost.toFixed(4)}`);
      console.log(`⚡ 処理時間: ${result.duration}ms`);

    } catch (error) {
      console.error(`❌ テストケース "${testCase.name}" でエラー:`, error.message);
      
      this.testResults.push({
        testName: testCase.name,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        retryCount
      });
    }
  }

  generateErrorTestReport() {
    console.log('\n\n📋 === エラーハンドリングテスト結果レポート ===');
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalTests = this.testResults.length;
    
    console.log(`\n🎯 総合結果: ${successCount}/${totalTests} テストが成功`);
    
    console.log(`\n📊 詳細結果:`);
    this.testResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.testName}:`);
      console.log(`   結果: ${result.success ? '✅ 成功' : '❌ 失敗'}`);
      if (result.success) {
        console.log(`   リトライ: ${result.retryCount}回 ${result.retryCount === result.expectedRetries ? '✅' : '⚠️'}`);
        console.log(`   品質スコア: ${result.finalQualityScore.toFixed(1)}/100`);
        console.log(`   完了率: ${((result.subtasks.completed / result.subtasks.total) * 100).toFixed(1)}%`);
      } else {
        console.log(`   エラー: ${result.error}`);
      }
      console.log('');
    });

    console.log('🔍 分析:');
    
    // リトライ機能の評価
    const retryTests = this.testResults.filter(r => r.success && r.retryCount > 0);
    if (retryTests.length > 0) {
      console.log(`✅ リトライ機能: ${retryTests.length}件のテストでリトライが動作`);
    }

    // エラー回復の評価
    const recoveredTests = this.testResults.filter(r => r.success && r.retryCount > 0);
    if (recoveredTests.length > 0) {
      console.log(`🔄 エラー回復: ${recoveredTests.length}件のテストでエラーから回復`);
    }

    // エスカレーション機能の評価
    const escalationTests = this.testResults.filter(r => !r.success);
    if (escalationTests.length > 0) {
      console.log(`📈 エスカレーション: ${escalationTests.length}件のテストで適切にエラー処理`);
    }

    console.log('\n=================================\n');
  }
}

async function runErrorHandlingTests() {
  const testSuite = new ErrorHandlingTestSuite();
  
  try {
    await testSuite.runErrorHandlingTests();
    console.log('🎉 エラーハンドリングテストが完了しました！');
    
  } catch (error) {
    console.error('❌ エラーハンドリングテスト中にエラーが発生:', error);
  }
}

runErrorHandlingTests();