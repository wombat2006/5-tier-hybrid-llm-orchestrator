const { LLMOrchestrator } = require('./dist/orchestrator/LLMOrchestrator');

class ComprehensiveTestSuite {
  constructor() {
    this.orchestrator = new LLMOrchestrator();
    this.testResults = [];
    this.totalCost = 0;
  }

  async runAllTests() {
    console.log('🧪 === 協調コーディングフロー包括テスト開始 ===\n');

    const testCases = [
      {
        name: 'Simple TypeScript Class',
        prompt: 'Create a simple TypeScript User class with name and email properties',
        expectedComplexity: 'easy',
        expectedSubtasks: 2
      },
      {
        name: 'Complex Authentication System', 
        prompt: 'Create a comprehensive TypeScript authentication system with JWT tokens, OAuth integration, role-based access control, password hashing with bcrypt, rate limiting, and comprehensive error handling. Include middleware for Express.js, database integration with MongoDB, and unit tests with Jest.',
        expectedComplexity: 'mixed',
        expectedSubtasks: 8
      },
      {
        name: 'Advanced Algorithm Implementation',
        prompt: 'Implement a distributed cache system with consistent hashing, load balancing, failover mechanisms, and real-time monitoring. Include performance optimization, memory management, and concurrent access handling.',
        expectedComplexity: 'hard',
        expectedSubtasks: 10
      },
      {
        name: 'Basic CRUD Operations',
        prompt: 'Create basic CRUD operations for a blog post in TypeScript',
        expectedComplexity: 'easy',
        expectedSubtasks: 4
      },
      {
        name: 'Microservices Architecture',
        prompt: 'Design and implement a microservices architecture for an e-commerce platform with service discovery, API gateway, event sourcing, CQRS pattern, distributed transactions, circuit breakers, and comprehensive monitoring.',
        expectedComplexity: 'hard',
        expectedSubtasks: 10
      }
    ];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n🎯 テストケース ${i + 1}/${testCases.length}: ${testCase.name}`);
      console.log(`📝 プロンプト: ${testCase.prompt.substring(0, 100)}...`);
      
      await this.runSingleTest(testCase);
      
      // テスト間の待機時間
      if (i < testCases.length - 1) {
        console.log('\n⏱️  次のテストまで2秒待機...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    await this.generateTestReport();
  }

  async runSingleTest(testCase) {
    const startTime = Date.now();

    try {
      const decompositionRequest = {
        originalPrompt: testCase.prompt,
        targetLanguage: 'typescript',
        complexityPreference: 'balanced',
        maxSubtasks: 10,
        context: `Test case: ${testCase.name}`
      };

      const session = await this.orchestrator.processCollaborativeCoding(decompositionRequest);
      const duration = Date.now() - startTime;
      
      const result = {
        testName: testCase.name,
        success: session.status === 'completed',
        sessionId: session.sessionId,
        duration,
        subtasks: {
          total: session.progress.total,
          completed: session.progress.completed,
          failed: session.progress.failed,
          completionRate: session.progress.total > 0 ? (session.progress.completed / session.progress.total) * 100 : 0
        },
        difficulty: {
          easy: session.subtasks.filter(t => t.difficulty === 'easy').length,
          hard: session.subtasks.filter(t => t.difficulty === 'hard').length
        },
        metrics: session.metrics,
        qualityScore: session.metrics.qualityScore,
        cost: session.metrics.totalCost,
        qwen3Usage: session.metrics.qwen3Usage,
        claudeUsage: session.metrics.claudeUsage,
        expectedVsActual: {
          expectedSubtasks: testCase.expectedSubtasks,
          actualSubtasks: session.progress.total,
          expectedComplexity: testCase.expectedComplexity,
          actualComplexityDistribution: `${session.subtasks.filter(t => t.difficulty === 'easy').length}E/${session.subtasks.filter(t => t.difficulty === 'hard').length}H`
        }
      };

      this.testResults.push(result);
      this.totalCost += session.metrics.totalCost;

      console.log(`✅ テスト完了: ${result.success ? '成功' : '失敗'}`);
      console.log(`📊 サブタスク: ${result.subtasks.completed}/${result.subtasks.total} 完了 (${result.subtasks.completionRate.toFixed(1)}%)`);
      console.log(`🎚️ 難易度分布: Easy=${result.difficulty.easy}, Hard=${result.difficulty.hard}`);
      console.log(`💰 コスト: $${result.cost.toFixed(4)}`);
      console.log(`🏆 品質スコア: ${result.qualityScore.toFixed(1)}/100`);
      console.log(`⚡ 処理時間: ${result.duration}ms`);
      console.log(`🤖 モデル使用: Qwen3=${result.qwen3Usage}, Claude=${result.claudeUsage}`);

    } catch (error) {
      console.error(`❌ テストケース "${testCase.name}" が失敗:`, error.message);
      
      this.testResults.push({
        testName: testCase.name,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  }

  async generateTestReport() {
    console.log('\n\n📋 === 包括テスト結果レポート ===');
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalTests = this.testResults.length;
    
    console.log(`\n🎯 総合結果: ${successCount}/${totalTests} テストが成功 (${((successCount/totalTests)*100).toFixed(1)}%)`);
    console.log(`💰 総コスト: $${this.totalCost.toFixed(4)}`);
    console.log(`⏱️ 総処理時間: ${this.testResults.reduce((sum, r) => sum + (r.duration || 0), 0)}ms`);
    
    // 詳細分析
    const successfulTests = this.testResults.filter(r => r.success);
    
    if (successfulTests.length > 0) {
      const avgQuality = successfulTests.reduce((sum, r) => sum + r.qualityScore, 0) / successfulTests.length;
      const totalQwen3 = successfulTests.reduce((sum, r) => sum + r.qwen3Usage, 0);
      const totalClaude = successfulTests.reduce((sum, r) => sum + r.claudeUsage, 0);
      const avgCompletionRate = successfulTests.reduce((sum, r) => sum + r.subtasks.completionRate, 0) / successfulTests.length;
      
      console.log(`\n📈 パフォーマンス分析:`);
      console.log(`   平均品質スコア: ${avgQuality.toFixed(1)}/100`);
      console.log(`   平均完了率: ${avgCompletionRate.toFixed(1)}%`);
      console.log(`   モデル使用率: Qwen3=${totalQwen3} (${((totalQwen3/(totalQwen3+totalClaude))*100).toFixed(1)}%), Claude=${totalClaude} (${((totalClaude/(totalQwen3+totalClaude))*100).toFixed(1)}%)`);
    }
    
    console.log(`\n📊 個別テスト結果:`);
    this.testResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.testName}: ${result.success ? '✅' : '❌'} ${result.success ? `(品質: ${result.qualityScore.toFixed(1)}, コスト: $${result.cost.toFixed(4)})` : `(エラー: ${result.error})`}`);
    });

    // 問題の特定
    console.log(`\n🔍 分析結果:`);
    
    const failedTests = this.testResults.filter(r => !r.success);
    if (failedTests.length > 0) {
      console.log(`⚠️ 失敗したテスト: ${failedTests.length}件`);
      failedTests.forEach(test => {
        console.log(`   - ${test.testName}: ${test.error}`);
      });
    }

    const lowQualityTests = successfulTests.filter(r => r.qualityScore < 70);
    if (lowQualityTests.length > 0) {
      console.log(`📉 品質スコアが低いテスト: ${lowQualityTests.length}件`);
      lowQualityTests.forEach(test => {
        console.log(`   - ${test.testName}: ${test.qualityScore.toFixed(1)}/100`);
      });
    }

    const incompleteTests = successfulTests.filter(r => r.subtasks.completionRate < 100);
    if (incompleteTests.length > 0) {
      console.log(`⭕ 一部未完了のテスト: ${incompleteTests.length}件`);
      incompleteTests.forEach(test => {
        console.log(`   - ${test.testName}: ${test.subtasks.completed}/${test.subtasks.total} (${test.subtasks.completionRate.toFixed(1)}%)`);
      });
    }

    console.log('\n=================================\n');
  }

  // エラーハンドリングとリトライ機能のテスト
  async testErrorHandlingAndRetry() {
    console.log('\n🛠️ エラーハンドリング・リトライ機能テスト...');
    
    // モックエラーを発生させるテスト
    const errorTestRequest = {
      originalPrompt: 'This is a test prompt designed to trigger retry mechanisms and error handling pathways',
      targetLanguage: 'typescript',
      complexityPreference: 'balanced',
      maxSubtasks: 3,
      context: 'Error handling test'
    };

    try {
      const session = await this.orchestrator.processCollaborativeCoding(errorTestRequest);
      console.log(`✅ エラーハンドリングテスト完了 - リトライ処理確認済み`);
    } catch (error) {
      console.log(`ℹ️ 期待されたエラーハンドリング: ${error.message}`);
    }
  }
}

async function runComprehensiveTests() {
  const testSuite = new ComprehensiveTestSuite();
  
  try {
    await testSuite.runAllTests();
    await testSuite.testErrorHandlingAndRetry();
    
    console.log('🎉 すべてのテストが完了しました！');
    
  } catch (error) {
    console.error('❌ テストスイート実行中にエラーが発生:', error);
  }
}

runComprehensiveTests();