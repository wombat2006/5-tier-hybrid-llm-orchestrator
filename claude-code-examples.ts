/**
 * Claude Code環境での5層ハイブリッドLLMオーケストレーター利用例
 * 
 * この例は、Claude Code環境で直接実行できるサンプルコードです。
 * WebアプリケーションのHTTPサーバーは不要で、TypeScriptとして直接実行可能。
 */

// メインインターフェースのインポート
import { HybridLLM, defaultLLM, ask, code, createLLM, ClaudeCodeConfig } from './src/claude-code-interface';

/**
 * 基本的な使用例
 */
async function basicUsageExamples() {
  console.log('\n🌟 === 基本的な使用例 ===\n');

  // 1. 最もシンプルな使い方
  console.log('1️⃣ 最もシンプルな使い方:');
  try {
    const simpleAnswer = await ask('量子コンピューターとは何ですか？');
    console.log(`回答: ${simpleAnswer.substring(0, 200)}...`);
  } catch (error) {
    console.error('エラー:', error);
  }

  // 2. コード生成専用ヘルパー
  console.log('\n2️⃣ コード生成専用ヘルパー:');
  try {
    const pythonCode = await code('バイナリサーチを実装', 'python');
    console.log('生成されたPythonコード:');
    console.log(pythonCode);
  } catch (error) {
    console.error('エラー:', error);
  }
}

/**
 * 詳細な制御が必要な場合の使用例
 */
async function advancedUsageExamples() {
  console.log('\n🚀 === 詳細制御の使用例 ===\n');

  // カスタム設定でインスタンス作成
  const customConfig: ClaudeCodeConfig = {
    monthlyBudget: 50,  // 予算を50ドルに制限
    enableDebugLogs: true,  // デバッグログ有効
    modelPreset: 'cost_optimized'  // コスト重視
  };

  const customLLM = createLLM(customConfig);

  // 1. 明示的なタスクタイプ指定
  console.log('1️⃣ 明示的なタスクタイプ指定:');
  try {
    const codeResponse = await customLLM.generate({
      prompt: 'FastAPIでREST APIを作成して',
      taskType: 'coding',
      context: {
        framework: 'FastAPI',
        purpose: 'RESTful API development'
      }
    });

    console.log(`使用モデル: ${codeResponse.model} (Tier ${codeResponse.tier})`);
    console.log(`コスト: $${codeResponse.cost.total.toFixed(4)}`);
    console.log(`処理時間: ${codeResponse.processingTime}ms`);
    console.log(`生成コード:\n${codeResponse.text.substring(0, 500)}...`);
  } catch (error) {
    console.error('エラー:', error);
  }

  // 2. 特定Tier強制指定
  console.log('\n2️⃣ 特定Tier強制指定（高品質分析）:');
  try {
    const analysisResponse = await customLLM.generate({
      prompt: 'マイクロサービスアーキテクチャの利点と欠点を詳細に分析してください',
      taskType: 'complex_analysis',
      preferredTier: 2,  // Claude Sonnet強制
      context: {
        domain: 'software_architecture',
        detail_level: 'comprehensive'
      }
    });

    console.log(`使用モデル: ${analysisResponse.model} (Tier ${analysisResponse.tier})`);
    console.log(`分析結果:\n${analysisResponse.text.substring(0, 300)}...`);
  } catch (error) {
    console.error('エラー:', error);
  }
}

/**
 * バッチ処理の使用例
 */
async function batchProcessingExample() {
  console.log('\n⚡ === バッチ処理の使用例 ===\n');

  const batchRequests = [
    {
      prompt: 'Pythonでソートアルゴリズムを実装',
      taskType: 'coding' as const,
      context: { language: 'python', topic: 'algorithms' }
    },
    {
      prompt: 'JavaScriptで非同期処理の例を作成',
      taskType: 'coding' as const,
      context: { language: 'javascript', topic: 'async' }
    },
    {
      prompt: 'データベース正規化について説明',
      taskType: 'general' as const,
      context: { topic: 'database_theory' }
    }
  ];

  console.log('📦 3つのリクエストを並列処理中...');

  try {
    const batchResults = await defaultLLM.generateBatch(batchRequests, 2);

    batchResults.forEach((result, index) => {
      console.log(`\n--- バッチ結果 ${index + 1} ---`);
      console.log(`モデル: ${result.model} (Tier ${result.tier})`);
      console.log(`コスト: $${result.cost.total.toFixed(4)}`);
      console.log(`応答: ${result.text.substring(0, 200)}...`);
    });

    // 合計コスト計算
    const totalCost = batchResults.reduce((sum, result) => sum + result.cost.total, 0);
    console.log(`\n💰 バッチ処理合計コスト: $${totalCost.toFixed(4)}`);

  } catch (error) {
    console.error('バッチ処理エラー:', error);
  }
}

/**
 * システム監視とメトリクス取得例
 */
async function monitoringExample() {
  console.log('\n📊 === システム監視の使用例 ===\n');

  try {
    // ヘルスチェック
    console.log('1️⃣ ヘルスチェック:');
    const health = await defaultLLM.healthCheck();
    console.log(`システム状態: ${health.healthy ? '✅ 正常' : '❌ 異常'}`);
    console.log('詳細:', health.details);

    // 利用可能モデル確認
    console.log('\n2️⃣ 利用可能モデル:');
    const models = defaultLLM.getAvailableModels();
    models.forEach(model => {
      console.log(`- ${model.name} (Tier ${model.tier}) - ${model.provider}`);
    });

    // 使用統計取得
    console.log('\n3️⃣ 使用統計:');
    const metrics = defaultLLM.getMetrics();
    console.log('リクエスト数（Tier別）:', metrics.requests_per_tier);
    console.log('コスト（Tier別）:', metrics.cost_per_tier);
    console.log('月間利用率:', `${metrics.budget_utilization_percentage?.toFixed(1)}%`);

  } catch (error) {
    console.error('監視エラー:', error);
  }
}

/**
 * 実用的なワークフロー例
 */
async function practicalWorkflowExample() {
  console.log('\n🔧 === 実用的なワークフロー例 ===\n');

  // シナリオ: Webアプリケーション開発のタスク分解と実装
  console.log('シナリオ: Webアプリケーション開発支援');

  try {
    // Step 1: 要件分析（Tier 2使用）
    console.log('\n📋 Step 1: 要件分析');
    const requirements = await defaultLLM.generate({
      prompt: 'ブログシステムの要件を整理し、必要な機能とデータベース設計を提案してください',
      taskType: 'complex_analysis',
      preferredTier: 2
    });
    console.log(`要件分析結果（${requirements.model}）:\n${requirements.text.substring(0, 400)}...`);

    // Step 2: データベーススキーマ作成（Tier 0使用）
    console.log('\n🗄️ Step 2: データベーススキーマ作成');
    const schema = await defaultLLM.generateCode(
      'ブログシステム用のSQLスキーマ（users, posts, comments テーブル）を作成',
      'sql'
    );
    console.log(`スキーマ生成（${schema.model}）:\n${schema.text.substring(0, 300)}...`);

    // Step 3: APIエンドポイント実装（Tier 0使用）
    console.log('\n🌐 Step 3: APIエンドポイント実装');
    const api = await defaultLLM.generateCode(
      'Express.jsでブログAPIのCRUDエンドポイント（投稿の作成・読取・更新・削除）を実装',
      'javascript'
    );
    console.log(`API実装（${api.model}）:\n${api.text.substring(0, 300)}...`);

    // Step 4: フロントエンド基本構造（Tier 0使用）
    console.log('\n💻 Step 4: フロントエンド基本構造');
    const frontend = await defaultLLM.generateCode(
      'React.jsでブログの投稿一覧と詳細画面のコンポーネントを作成',
      'typescript'
    );
    console.log(`フロントエンド（${frontend.model}）:\n${frontend.text.substring(0, 300)}...`);

    // 合計コスト表示
    const totalWorkflowCost = requirements.cost.total + schema.cost.total + api.cost.total + frontend.cost.total;
    console.log(`\n💰 ワークフロー合計コスト: $${totalWorkflowCost.toFixed(4)}`);
    console.log('   - 要件分析 (Tier 2):', `$${requirements.cost.total.toFixed(4)}`);
    console.log('   - DB設計 (Tier 0):', `$${schema.cost.total.toFixed(4)}`);
    console.log('   - API実装 (Tier 0):', `$${api.cost.total.toFixed(4)}`);
    console.log('   - UI実装 (Tier 0):', `$${frontend.cost.total.toFixed(4)}`);

  } catch (error) {
    console.error('ワークフローエラー:', error);
  }
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🌟 Claude Code環境での5層ハイブリッドLLMオーケストレーター実行例\n');
  console.log('=====================================================');
  
  try {
    // 各種使用例を順次実行
    await basicUsageExamples();
    await advancedUsageExamples();
    await batchProcessingExample();
    await monitoringExample();
    await practicalWorkflowExample();

    console.log('\n✅ 全ての例の実行が完了しました！');

  } catch (error) {
    console.error('\n❌ 実行中にエラーが発生しました:', error);
  } finally {
    // 最終統計表示
    console.log('\n📊 === 最終実行統計 ===');
    try {
      const finalMetrics = defaultLLM.getMetrics();
      console.log('総リクエスト数:', Object.values(finalMetrics.requests_per_tier || {}).reduce((a, b) => a + b, 0));
      console.log('総コスト:', `$${Object.values(finalMetrics.cost_per_tier || {}).reduce((a, b) => a + b, 0).toFixed(4)}`);
      console.log('予算利用率:', `${finalMetrics.budget_utilization_percentage?.toFixed(2)}%`);
    } catch (error) {
      console.log('統計取得に失敗しました');
    }
  }
}

// Claude Code環境で直接実行する場合
if (require.main === module) {
  main().catch(console.error);
}

// モジュールとしてエクスポート
export { main };

/**
 * 個別実行用のヘルパー関数
 */
export const examples = {
  basic: basicUsageExamples,
  advanced: advancedUsageExamples,
  batch: batchProcessingExample,
  monitoring: monitoringExample,
  workflow: practicalWorkflowExample
};