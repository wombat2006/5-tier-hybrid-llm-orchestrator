const { QualityGate } = require('./dist/pipeline/QualityGate');
const { MockQwenClient } = require('./dist/clients/MockQwenClient');
const { MockQwenErrorClient } = require('./dist/clients/MockQwenErrorClient');

class QualityGateTestSuite {
  constructor() {
    this.testResults = [];
  }

  async runQualityGateTests() {
    console.log('🔍 === 品質チェック機能詳細テスト ===\n');

    const config = {
      qualityThresholds: {
        minScore: 70,
        requiresReview: 85
      },
      enableDetailedAnalysis: true,
      maxRetries: 2
    };

    const qualityGate = new QualityGate(config);
    
    // 品質テスト用のコードサンプル
    const testCodeSamples = [
      {
        name: '高品質コード',
        code: `
/**
 * ユーザー認証を行うクラス
 * JWTトークンベースの認証システム
 */
class AuthService {
  constructor(secretKey) {
    this.secretKey = secretKey;
    this.tokenExpiry = 3600; // 1時間
  }

  /**
   * ユーザーログインを処理
   * @param {string} email - ユーザーメールアドレス
   * @param {string} password - パスワード
   * @returns {Promise<Object>} - 認証結果とトークン
   */
  async authenticate(email, password) {
    try {
      // 入力バリデーション
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // パスワードハッシュ検証（実装省略）
      const user = await this.validateCredentials(email, password);
      
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // JWTトークン生成
      const token = this.generateToken(user);
      
      return {
        success: true,
        user: user,
        token: token,
        expiresAt: Date.now() + (this.tokenExpiry * 1000)
      };

    } catch (error) {
      console.error('Authentication failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateToken(user) {
    // JWT生成実装（省略）
    return 'jwt_token_placeholder';
  }
}

module.exports = AuthService;
`,
        expectedQuality: 90,
        expectedIssues: 0
      },

      {
        name: '中品質コード（改善の余地あり）',
        code: `
function userLogin(email, pwd) {
  var users = [
    {email: "admin@test.com", password: "admin123"},
    {email: "user@test.com", password: "user123"}
  ];
  
  for (var i = 0; i < users.length; i++) {
    if (users[i].email == email && users[i].password == pwd) {
      return {status: "success", user: users[i]};
    }
  }
  return {status: "failed"};
}

function checkAuth(token) {
  if (token == "valid_token") {
    return true;
  }
  return false;
}
`,
        expectedQuality: 60,
        expectedIssues: 5
      },

      {
        name: '低品質コード（多数の問題）',
        code: `
// Bad code with multiple issues
function badLogin(e, p) {
    users = [{e:"admin", p:"123"}, {e:"user", p:"456"}];
    for (i=0; i<users.length; i++) {
        if (users[i].e == e && users[i].p == p) {
            eval("console.log('login success')");
            return "ok";
        }
    }
    return null;
}

var global_token = "";
function setToken(t) { global_token = t; }
function getToken() { return global_token; }
`,
        expectedQuality: 30,
        expectedIssues: 8
      }
    ];

    console.log('📊 初期設定:');
    console.log(`   最低品質スコア: ${config.qualityThresholds.minScore}`);
    console.log(`   レビュー必須スコア: ${config.qualityThresholds.requiresReview}`);
    console.log(`   テストコードサンプル数: ${testCodeSamples.length}`);

    for (let i = 0; i < testCodeSamples.length; i++) {
      const testSample = testCodeSamples[i];
      console.log(`\n🎯 品質テスト ${i + 1}/${testCodeSamples.length}: ${testSample.name}`);
      
      await this.runSingleQualityTest(testSample, qualityGate);
      
      if (i < testCodeSamples.length - 1) {
        console.log('\n⏱️  次のテストまで500ms待機...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 品質閾値テスト
    await this.runQualityThresholdTests(qualityGate);

    // 改善提案機能テスト
    await this.runImprovementSuggestionTests(qualityGate);

    this.generateQualityTestReport();
  }

  async runSingleQualityTest(testSample, qualityGate) {
    const startTime = Date.now();
    
    try {
      console.log(`📝 コード: ${testSample.code.substring(0, 100).replace(/\n/g, ' ')}...`);
      
      const qualityReview = await qualityGate.reviewCode(testSample.code, 'typescript');
      const duration = Date.now() - startTime;
      
      const result = {
        testName: testSample.name,
        success: true,
        duration,
        qualityScore: qualityReview.overallScore,
        issueCount: qualityReview.issues.length,
        expectedQuality: testSample.expectedQuality,
        expectedIssues: testSample.expectedIssues,
        issues: qualityReview.issues.map(issue => ({
          type: issue.type,
          severity: issue.severity,
          message: issue.message
        })),
        suggestions: qualityReview.suggestions.length,
        approved: qualityReview.approved
      };

      this.testResults.push(result);

      console.log(`✅ テスト完了`);
      console.log(`🏆 品質スコア: ${result.qualityScore.toFixed(1)}/100 (期待値: ${testSample.expectedQuality})`);
      console.log(`⚠️  問題数: ${result.issueCount}件 (期待値: ${testSample.expectedIssues}件)`);
      console.log(`🔧 改善提案: ${result.suggestions}件`);
      console.log(`✅ 承認状況: ${result.approved ? '承認' : '要改善'}`);
      
      if (result.issueCount > 0) {
        console.log(`📋 検出された問題:`);
        result.issues.slice(0, 3).forEach((issue, index) => {
          console.log(`   ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`);
        });
        if (result.issueCount > 3) {
          console.log(`   ... 他 ${result.issueCount - 3} 件`);
        }
      }

    } catch (error) {
      console.error(`❌ 品質テスト \"${testSample.name}\" でエラー:`, error.message);
      
      this.testResults.push({
        testName: testSample.name,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  }

  async runQualityThresholdTests(qualityGate) {
    console.log('\n🎛️ === 品質閾値テスト ===');
    
    const thresholdTestCode = `
function simpleFunction(x, y) {
    return x + y;
}
`;

    // 異なる閾値設定でテスト
    const thresholdConfigs = [
      { minScore: 50, requiresReview: 70, description: '緩い設定' },
      { minScore: 70, requiresReview: 85, description: '標準設定' },
      { minScore: 90, requiresReview: 95, description: '厳しい設定' }
    ];

    for (const config of thresholdConfigs) {
      console.log(`\n📏 ${config.description} (最低: ${config.minScore}, レビュー: ${config.requiresReview})`);
      
      const testGate = new QualityGate({ qualityThresholds: config });
      const review = await testGate.reviewCode(thresholdTestCode, 'javascript');
      
      console.log(`   スコア: ${review.overallScore.toFixed(1)}`);
      console.log(`   承認: ${review.approved ? 'Yes' : 'No'}`);
      console.log(`   レビュー必要: ${review.requiresReview ? 'Yes' : 'No'}`);
    }
  }

  async runImprovementSuggestionTests(qualityGate) {
    console.log('\n🔧 === 改善提案機能テスト ===');
    
    const improvementTestCode = `
function calculate(a, b, operation) {
    if (operation == "add") {
        return a + b;
    } else if (operation == "sub") {
        return a - b;
    } else if (operation == "mul") {
        return a * b;
    } else if (operation == "div") {
        if (b != 0) {
            return a / b;
        } else {
            return "Error: Division by zero";
        }
    }
}
`;

    const review = await qualityGate.reviewCode(improvementTestCode, 'javascript');
    
    console.log(`📋 改善提案 (${review.suggestions.length}件):`);
    review.suggestions.slice(0, 5).forEach((suggestion, index) => {
      console.log(`   ${index + 1}. ${suggestion}`);
    });
  }

  generateQualityTestReport() {
    console.log('\n\n📋 === 品質チェック機能テスト結果レポート ===');
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalTests = this.testResults.length;
    
    console.log(`\n🎯 総合結果: ${successCount}/${totalTests} テストが成功`);
    
    if (successCount > 0) {
      const avgQualityScore = this.testResults
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.qualityScore, 0) / successCount;
      
      const totalIssues = this.testResults
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.issueCount, 0);
      
      console.log(`\n📊 品質メトリクス:`);
      console.log(`   平均品質スコア: ${avgQualityScore.toFixed(1)}/100`);
      console.log(`   検出問題総数: ${totalIssues}件`);
      console.log(`   承認率: ${(this.testResults.filter(r => r.success && r.approved).length / successCount * 100).toFixed(1)}%`);
    }

    console.log(`\n📊 詳細結果:`);
    this.testResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.testName}:`);
      console.log(`   結果: ${result.success ? '✅ 成功' : '❌ 失敗'}`);
      if (result.success) {
        const qualityMatch = Math.abs(result.qualityScore - result.expectedQuality) <= 15;
        const issueMatch = Math.abs(result.issueCount - result.expectedIssues) <= 2;
        
        console.log(`   品質スコア: ${result.qualityScore.toFixed(1)}/100 ${qualityMatch ? '✅' : '⚠️'} (期待: ${result.expectedQuality})`);
        console.log(`   問題数: ${result.issueCount}件 ${issueMatch ? '✅' : '⚠️'} (期待: ${result.expectedIssues}件)`);
        console.log(`   承認状況: ${result.approved ? '✅ 承認' : '⚠️ 要改善'}`);
      } else {
        console.log(`   エラー: ${result.error}`);
      }
      console.log('');
    });

    console.log('🔍 機能検証:');
    
    // 品質スコア精度の評価
    const qualityTests = this.testResults.filter(r => r.success);
    if (qualityTests.length > 0) {
      const accurateQuality = qualityTests.filter(r => 
        Math.abs(r.qualityScore - r.expectedQuality) <= 15
      ).length;
      console.log(`✅ 品質スコア精度: ${accurateQuality}/${qualityTests.length}件 (${(accurateQuality/qualityTests.length*100).toFixed(1)}%)`);
    }

    // 問題検出精度の評価
    if (qualityTests.length > 0) {
      const accurateIssues = qualityTests.filter(r => 
        Math.abs(r.issueCount - r.expectedIssues) <= 2
      ).length;
      console.log(`🔍 問題検出精度: ${accurateIssues}/${qualityTests.length}件 (${(accurateIssues/qualityTests.length*100).toFixed(1)}%)`);
    }

    console.log('\n=================================\n');
  }
}

async function runQualityGateTests() {
  const testSuite = new QualityGateTestSuite();
  
  try {
    await testSuite.runQualityGateTests();
    console.log('🎉 品質チェック機能テストが完了しました！');
    
  } catch (error) {
    console.error('❌ 品質チェック機能テスト中にエラーが発生:', error);
  }
}

runQualityGateTests();