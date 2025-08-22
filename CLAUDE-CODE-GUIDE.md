# 🚀 Claude Code環境での5層ハイブリッドLLMオーケストレーター利用ガイド

## 📋 概要

この5層ハイブリッドLLMオーケストレーターは、Claude Code環境で直接利用可能なTypeScriptモジュールです。WebアプリケーションのHTTPサーバーは不要で、`import`文でモジュールとして読み込んで使用できます。

## 🎯 主な特徴

- ✅ **Claude Code環境ネイティブ**: HTTPサーバー不要の軽量モジュール
- 🤖 **13+モデル対応**: OpenRouter統合により豊富なモデル選択
- 💰 **コスト最適化**: 5層システムによる自動コスト制御
- ⚡ **高速実行**: タスクに応じた最適なモデル自動選択
- 📊 **リアルタイム監視**: コスト・パフォーマンスの可視化

## 🛠️ セットアップ

### 1. 依存関係インストール

```bash
npm install
```

### 2. 環境変数設定

```bash
# Claude Code用環境変数をコピー
cp .env.claude-code .env

# APIキーを設定（最低限OpenRouterキーがあれば動作）
nano .env
```

**必須APIキー:**
- `OPENROUTER_API_KEY`: 13+モデル対応（最優先）
- `OPENAI_API_KEY`: GPT-4o、Assistant API用
- `ANTHROPIC_API_KEY`: Claude Sonnet用
- `GOOGLE_API_KEY`: Gemini Flash、Gemini Pro用

### 3. TypeScript環境確認

```bash
# TypeScriptコンパイル確認
npx tsc --noEmit

# 実行可能確認
npx ts-node claude-code-examples.ts
```

## 📚 基本的な使い方

### 最もシンプルな使い方

```typescript
import { ask, code } from './src/claude-code-interface';

// 1. 簡単な質問
const answer = await ask('量子コンピューターとは？');
console.log(answer);

// 2. コード生成
const pythonCode = await code('バイナリサーチを実装', 'python');
console.log(pythonCode);
```

### 詳細制御が必要な場合

```typescript
import { HybridLLM, createLLM } from './src/claude-code-interface';

// カスタム設定でインスタンス作成
const llm = createLLM({
  monthlyBudget: 30,        // Claude Code用予算
  enableDebugLogs: true,    // デバッグ出力
  modelPreset: 'cost_optimized'  // コスト重視
});

// 詳細なリクエスト
const response = await llm.generate({
  prompt: 'マイクロサービス設計を分析して',
  taskType: 'complex_analysis',
  preferredTier: 2,  // Claude Sonnet強制
  context: { domain: 'software_architecture' }
});

console.log(`モデル: ${response.model}`);
console.log(`コスト: $${response.cost.total.toFixed(4)}`);
console.log(response.text);
```

## 🎯 5層システムの活用

### Tier 0: コーディング特化（最安・高速）
```typescript
// Qwen3 Coder - コーディングタスク専用
const code = await llm.generate({
  prompt: 'React hooks でカウンターコンポーネント作成',
  taskType: 'coding',
  preferredTier: 0
});
```

### Tier 1: 一般クエリ（無料・最高速）
```typescript
// Gemini Flash - 一般的な質問・調査
const explanation = await llm.generate({
  prompt: 'RESTful APIの原則を説明',
  taskType: 'general'  // 自動でTier 1選択
});
```

### Tier 2: 複雑分析（高品質・中コスト）
```typescript
// Claude Sonnet - 設計・分析・推論
const analysis = await llm.generate({
  prompt: 'システムアーキテクチャの改善案',
  taskType: 'complex_analysis'  // 自動でTier 2選択
});
```

### Tier 3: 最高品質（最高コスト）
```typescript
// GPT-4o/Gemini Pro - 重要な戦略判断
const strategy = await llm.generate({
  prompt: '技術選定の最終判断',
  taskType: 'premium',  // 自動でTier 3選択
  preferredTier: 3      // 強制指定も可能
});
```

## ⚡ バッチ処理

複数タスクの並列実行：

```typescript
const requests = [
  { prompt: 'Python ソートアルゴリズム', taskType: 'coding' },
  { prompt: 'JavaScript 非同期処理例', taskType: 'coding' },
  { prompt: 'データベース正規化解説', taskType: 'general' }
];

// 最大2つまで並列実行
const results = await llm.generateBatch(requests, 2);

results.forEach((result, index) => {
  console.log(`結果${index + 1}: ${result.model} - $${result.cost.total.toFixed(4)}`);
});
```

## 📊 監視・コスト管理

```typescript
// システム健康状態
const health = await llm.healthCheck();
console.log('システム状態:', health.healthy ? '正常' : '異常');

// 利用統計
const metrics = llm.getMetrics();
console.log('Tier別リクエスト数:', metrics.requests_per_tier);
console.log('Tier別コスト:', metrics.cost_per_tier);
console.log('予算利用率:', `${metrics.budget_utilization_percentage}%`);

// 統計リセット（開発時）
llm.resetMetrics();
```

## 🔧 実用的なワークフロー例

### Webアプリ開発支援

```typescript
async function webAppDevelopment() {
  const llm = createLLM({ modelPreset: 'balanced' });

  // 1. 要件分析（Tier 2）
  const requirements = await llm.generate({
    prompt: 'ToDoアプリの要件整理とDB設計',
    taskType: 'complex_analysis'
  });

  // 2. バックエンド実装（Tier 0）
  const backend = await llm.generateCode(
    'Express.js でToDoのCRUD API実装', 
    'javascript'
  );

  // 3. フロントエンド実装（Tier 0）
  const frontend = await llm.generateCode(
    'React でToDoリスト UI実装',
    'typescript'
  );

  console.log('開発支援完了！');
  console.log(`総コスト: $${(requirements.cost.total + backend.cost.total + frontend.cost.total).toFixed(4)}`);
}
```

## 🎛️ 設定カスタマイズ

### 環境変数での制御

```bash
# コスト制御
MONTHLY_BUDGET=30              # 月間予算
MAX_REQUEST_COST=2.0           # 1回の最大コスト

# プリセット選択
MODEL_PRESET=cost_optimized    # コスト重視
# MODEL_PRESET=performance_optimized  # 性能重視
# MODEL_PRESET=balanced        # バランス型

# デバッグ設定
LOG_LEVEL=debug               # 詳細ログ
ENABLE_DEBUG_LOGS=true        # デバッグ出力
```

### プログラムでの設定

```typescript
const llm = createLLM({
  monthlyBudget: 20,           // さらに低予算
  enableDebugLogs: false,      // 本番用（ログ無し）
  modelPreset: 'cost_optimized'
});
```

## 📈 コスト効率の目安

| Tier | 主な用途 | 1Kトークンあたり | 目安 |
|------|----------|-----------------|------|
| 0 | コーディング | $0.05 | 1回 $0.01-0.20 |
| 1 | 一般クエリ | $0.00 | 完全無料 |
| 2 | 複雑分析 | $9.00 | 1回 $0.50-2.00 |
| 3 | 最高品質 | $6.25 | 1回 $1.00-5.00 |

**月額30ドルの場合:**
- コーディングタスク: 約150-600回
- 一般クエリ: 無制限（無料）
- 複雑分析: 15-60回
- 最高品質: 6-30回

## 🔍 トラブルシューティング

### よくある問題

1. **APIキー未設定**
   ```
   Error: OpenRouter API key not provided
   ```
   → `.env` ファイルで `OPENROUTER_API_KEY` を設定

2. **予算超過**
   ```
   Budget exceeded and no fallback available
   ```
   → `llm.resetMetrics()` でリセットまたは予算増額

3. **Timeout エラー**
   ```
   Request timeout
   ```
   → `.env` で `REQUEST_TIMEOUT` を増加（デフォルト: 60秒）

### デバッグ方法

```typescript
// デバッグ出力有効化
const debugLLM = createLLM({ 
  enableDebugLogs: true,
  modelPreset: 'cost_optimized'
});

// ヘルスチェックで状態確認
const health = await debugLLM.healthCheck();
console.log('詳細状態:', health);
```

## 🚀 次のステップ

1. **基本例の実行**: `npx ts-node claude-code-examples.ts`
2. **独自ワークフローの作成**: 自分のタスクに合わせてカスタマイズ
3. **バッチ処理の活用**: 大量タスクの効率的処理
4. **コスト監視**: 定期的な使用統計確認

---

## 📞 サポート

- **GitHub リポジトリ**: https://github.com/wombat2006/5-tier-hybrid-llm-orchestrator
- **実行例**: `claude-code-examples.ts` を参照
- **設定例**: `.env.claude-code` を参照

**Claude Code環境での5層ハイブリッドLLMオーケストレーター、準備完了！** 🎉