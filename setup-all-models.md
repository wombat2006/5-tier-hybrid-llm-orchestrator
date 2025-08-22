# 🚀 全モデル対応セットアップガイド

## 📋 概要

このガイドは、5層ハイブリッドLLMオーケストレーターですべてのモデル（13+モデル）を使用可能にするためのセットアップ手順です。

## 🎯 利用可能になるモデル

### Tier 0 - コーディング特化
- ✅ **Qwen3 Coder 32B** (OpenRouter経由)
- ✅ **Qwen3 Coder Free** (OpenRouter無料版)

### Tier 1 - 高速・一般用途
- ✅ **Gemini 1.5 Flash** (Google API / OpenRouter)
- ✅ **Claude 3 Haiku** (Anthropic / OpenRouter)
- ✅ **Llama 3 8B** (OpenRouter)
- ✅ **Llama 3 Free** (OpenRouter無料)

### Tier 2 - 高品質推論
- ✅ **Claude 3.5 Sonnet** (Anthropic / OpenRouter)
- ✅ **Gemini 1.5 Pro** (Google API / OpenRouter)
- ✅ **Qwen 2.5 Math** (数学特化)

### Tier 3 - 最高品質
- ✅ **GPT-4o** (OpenAI / OpenRouter)
- ✅ **GPT-o1 Preview** (高度推論)
- ❌ ~~Claude Opus~~ (高コストのため無効化済み)

### 特殊用途
- ✅ **MythoMax L2** (創作・ストーリー)
- ✅ **Vector Search Engine** (RAG検索)
- ✅ **OpenAI Assistant API** (ファイル検索・コード実行)

## 🔑 APIキー取得手順

### 1. OpenRouter（最重要・13+モデル対応）

**無料で始める場合:**
1. https://openrouter.ai にアクセス
2. アカウント作成（無料）
3. https://openrouter.ai/keys でAPIキー作成
4. **無料枠**: 50リクエスト/日（:free付きモデル）

**本格利用の場合:**
1. $10以上チャージで1000リクエスト/日に拡大
2. コスト効率の良いプレミアムモデルにアクセス

```bash
# 取得したOpenRouterキーを設定
OPENROUTER_API_KEY=sk-or-v1-実際のキーをここに入力
```

### 2. Google AI Studio（Gemini用）

1. https://aistudio.google.com にアクセス
2. Googleアカウントでログイン
3. "Get API Key" でキー生成（無料枠あり）

```bash
# 取得したGoogleキーを設定
GOOGLE_API_KEY=AI実際のキーをここに入力
```

### 3. Anthropic Console（Claude用）

1. https://console.anthropic.com にアクセス
2. アカウント作成
3. "API Keys" でキー生成

```bash
# 取得したAnthropicキーを設定
ANTHROPIC_API_KEY=sk-ant-実際のキーをここに入力
```

### 4. OpenAI Platform（GPT用）

1. https://platform.openai.com にアクセス
2. アカウント作成
3. "API Keys" でキー生成

```bash
# 取得したOpenAIキーを設定
OPENAI_API_KEY=sk-実際のキーをここに入力
```

## ⚙️ 設定手順

### Step 1: 環境変数ファイル編集

```bash
# .envファイルを編集
nano .env
```

### Step 2: APIキー設定

```bash
# 最小構成（OpenRouterのみでも13+モデル利用可能）
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here

# 完全構成（すべてのプロバイダー直接アクセス）
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key  
GOOGLE_API_KEY=your-google-ai-key
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key
```

### Step 3: 動作確認

```bash
# 統合テスト実行
npx ts-node test-claude-code-integration.ts

# 利用例実行
npx ts-node claude-code-examples.ts
```

## 💰 コスト効率の設定

### プリセット選択

```bash
# コスト重視（無料・低コストモデル優先）
MODEL_PRESET=cost_optimized

# バランス型（品質とコストのバランス）  
MODEL_PRESET=balanced

# 性能重視（最高品質モデル優先）
MODEL_PRESET=performance_optimized
```

### 予算制限

```bash
# Claude Code環境用推奨予算
MONTHLY_BUDGET=30

# 1回のリクエスト最大コスト
MAX_REQUEST_COST=2.0
```

## 🎯 モデル選択戦略

### 無料で始める場合
```bash
# 完全無料構成
OPENROUTER_API_KEY=your-free-key  # 50req/日
GOOGLE_API_KEY=your-google-key    # 無料枠
MODEL_PRESET=cost_optimized
```

**利用可能:**
- Qwen3 Coder Free（コーディング）
- Llama 3 Free（一般）
- Gemini Flash（高速・無料枠）

### バランス構成
```bash
# OpenRouter + Google
OPENROUTER_API_KEY=your-paid-key  # $10チャージ
GOOGLE_API_KEY=your-google-key
MODEL_PRESET=balanced
```

**利用可能:**
- 全Tier 0-2モデル
- 月額$30で約500-1000リクエスト

### 完全構成
```bash
# 全プロバイダー設定
OPENROUTER_API_KEY=your-key
GOOGLE_API_KEY=your-key  
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key
MODEL_PRESET=performance_optimized
```

**利用可能:**
- 全13+モデル
- 最適価格での直接アクセス
- 完全なフォールバック対応

## 🔍 トラブルシューティング

### 1. OpenRouterキーエラー
```
Error: OpenRouter API key not provided
```
→ OpenRouterキーが正しく設定されているか確認

### 2. モデル初期化失敗
```
Failed to initialize client for model_name
```
→ 該当プロバイダーのAPIキーを確認

### 3. 予算超過エラー
```
Budget exceeded and no fallback available
```
→ `llm.resetMetrics()` でリセットまたは予算増額

## 📊 利用統計確認

```typescript
import { defaultLLM } from './src/claude-code-interface';

// 利用可能モデル確認
const models = defaultLLM.getAvailableModels();
console.log(`利用可能モデル: ${models.length}個`);

// 使用統計
const metrics = defaultLLM.getMetrics();
console.log('Tier別コスト:', metrics.cost_per_tier);
console.log('予算利用率:', `${metrics.budget_utilization_percentage}%`);
```

## 🎉 完了確認

すべてのセットアップが完了すると：

```
🚀 === 5-Tier Hybrid LLM System Summary ===

Tier 0: 2 models
  ✅ qwen3_coder - コーディング特化
  ✅ qwen3_coder_free - 無料版

Tier 1: 3 models  
  ✅ gemini_flash - 高速汎用
  ✅ claude_haiku - 高速Claude
  ✅ llama3_free - 無料汎用

Tier 2: 3 models
  ✅ claude_sonnet - 高品質推論
  ✅ gemini_pro - マルチモーダル
  ✅ qwen_math - 数学特化

Tier 3: 2 models
  ✅ gpt4o - OpenAI最高品質
  ✅ o1_preview - 高度推論

💰 Monthly Budget: $30
🔄 13+モデル対応完了！
```

**これで13+モデルすべてが利用可能になります！** 🎉