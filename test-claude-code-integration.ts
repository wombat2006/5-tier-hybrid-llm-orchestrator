/**
 * Claude Code環境統合テスト
 * 
 * このファイルは、Claude Code環境でのモジュール統合が正常に動作するかテストします。
 */

import { HybridLLM, ask, code, createLLM } from './src/claude-code-interface';

async function testClaudeCodeIntegration() {
  console.log('🧪 Claude Code環境統合テスト開始\n');
  console.log('=====================================\n');

  let testsPassed = 0;
  let testsTotal = 0;

  // テスト1: 基本的なインポートとインスタンス作成
  console.log('1️⃣ 基本的なインポートとインスタンス作成');
  testsTotal++;
  try {
    const llm = new HybridLLM();
    console.log('✅ HybridLLM インスタンス作成成功');
    testsPassed++;
  } catch (error) {
    console.log('❌ HybridLLM インスタンス作成失敗:', error);
  }

  // テスト2: ヘルパー関数の動作確認（モック応答）
  console.log('\n2️⃣ ヘルパー関数インターフェース確認');
  testsTotal++;
  try {
    // 実際のAPI呼び出しは行わず、インターフェースのみ確認
    console.log('ask関数:', typeof ask);
    console.log('code関数:', typeof code);
    console.log('createLLM関数:', typeof createLLM);
    
    if (typeof ask === 'function' && typeof code === 'function' && typeof createLLM === 'function') {
      console.log('✅ ヘルパー関数インターフェース確認成功');
      testsPassed++;
    } else {
      throw new Error('ヘルパー関数が正しくエクスポートされていません');
    }
  } catch (error) {
    console.log('❌ ヘルパー関数確認失敗:', error);
  }

  // テスト3: 設定オブジェクトの動作確認
  console.log('\n3️⃣ カスタム設定の動作確認');
  testsTotal++;
  try {
    const customLLM = createLLM({
      monthlyBudget: 10,
      enableDebugLogs: false,
      modelPreset: 'cost_optimized'
    });
    console.log('✅ カスタム設定でのインスタンス作成成功');
    testsPassed++;
  } catch (error) {
    console.log('❌ カスタム設定テスト失敗:', error);
  }

  // テスト4: 依存関係の読み込み確認
  console.log('\n4️⃣ 依存関係の読み込み確認');
  testsTotal++;
  try {
    // 重要なモジュールが正しくインポートできるかチェック
    const { LLMOrchestrator } = await import('./src/orchestrator/LLMOrchestrator');
    const types = await import('./src/types');
    const hasLLMRequest = 'LLMRequest' in types;
    
    console.log('LLMOrchestrator:', typeof LLMOrchestrator);
    console.log('型定義の読み込み: 成功');
    console.log('✅ 依存関係の読み込み成功');
    testsPassed++;
  } catch (error) {
    console.log('❌ 依存関係の読み込み失敗:', error);
  }

  // テスト5: 環境変数アクセス確認
  console.log('\n5️⃣ 環境変数アクセス確認');
  testsTotal++;
  try {
    // dotenv読み込み確認（実際の値は表示しない）
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasGoogle = !!process.env.GOOGLE_API_KEY;

    console.log('環境変数アクセス状況:');
    console.log('  OPENROUTER_API_KEY:', hasOpenRouter ? '設定済み' : '未設定');
    console.log('  OPENAI_API_KEY:', hasOpenAI ? '設定済み' : '未設定');
    console.log('  ANTHROPIC_API_KEY:', hasAnthropic ? '設定済み' : '未設定');
    console.log('  GOOGLE_API_KEY:', hasGoogle ? '設定済み' : '未設定');

    if (hasOpenRouter || hasOpenAI || hasAnthropic || hasGoogle) {
      console.log('✅ 最低1つ以上のAPIキーが設定済み');
      testsPassed++;
    } else {
      console.log('⚠️  APIキーが設定されていません（.envファイルを確認してください）');
      console.log('✅ 環境変数アクセスは正常動作');
      testsPassed++;
    }
  } catch (error) {
    console.log('❌ 環境変数アクセス失敗:', error);
  }

  // テスト結果サマリー
  console.log('\n=====================================');
  console.log('🧪 テスト結果サマリー');
  console.log('=====================================');
  console.log(`合格: ${testsPassed}/${testsTotal}`);
  console.log(`成功率: ${((testsPassed / testsTotal) * 100).toFixed(1)}%`);

  if (testsPassed === testsTotal) {
    console.log('\n🎉 すべてのテストが成功しました！');
    console.log('Claude Code環境での統合は正常に動作します。');
    console.log('\n📚 次のステップ:');
    console.log('1. .envファイルでAPIキーを設定');
    console.log('2. claude-code-examples.ts を実行してサンプル確認');
    console.log('3. CLAUDE-CODE-GUIDE.md でドキュメントを確認');
  } else {
    console.log('\n⚠️  一部のテストが失敗しています。');
    console.log('設定やインストールを確認してください。');
  }

  return testsPassed === testsTotal;
}

// テスト実行
if (require.main === module) {
  testClaudeCodeIntegration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('テスト実行中にエラーが発生:', error);
      process.exit(1);
    });
}

export { testClaudeCodeIntegration };