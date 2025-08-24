# 🚀 本番環境セットアップガイド
## 5層ハイブリッドLLMシステム - AWS EC2デプロイ

### 🎯 概要
このガイドでは、**Gemini 2.5 Pro Exp統合済み**の5層ハイブリッドLLMシステムをAWS EC2本番環境にデプロイする手順を説明します。

---

## 📋 前提条件

### AWS環境
- ✅ AWS アカウント
- ✅ EC2インスタンス（t3.medium以上推奨）
- ✅ SSH キーペア
- ✅ セキュリティグループ（HTTP/HTTPS/SSH）

### APIキー準備
1. **Google API Key** - Gemini 2.5 Pro Exp（無料実験版）+ Flash（無料）
2. **OpenRouter API Key** - 13+モデル対応（推奨）
3. **Anthropic API Key** - Claude Sonnet 4（高品質）
4. **OpenAI API Key** - GPT-4.1（最高品質）

---

## 🔧 ステップ1: 環境変数設定

### 1.1 APIキー設定
`.env.production`ファイルを編集:

```bash
# 実際のAPIキーに変更してください
GOOGLE_API_KEY=your_actual_google_api_key
OPENROUTER_API_KEY=your_actual_openrouter_key
ANTHROPIC_API_KEY=your_actual_anthropic_key
OPENAI_API_KEY=your_actual_openai_key
```

### 1.2 JWT秘密鍵生成
```bash
# 強力なJWT秘密鍵を生成
openssl rand -base64 64
# 生成された文字列をJWT_SECRETに設定
```

---

## 🚀 ステップ2: AWS EC2デプロイ

### 2.1 自動デプロイ実行
```bash
# デプロイスクリプトに実行権限付与
chmod +x deploy/aws-deploy.sh

# 自動デプロイ実行
./deploy/aws-deploy.sh \
  --host your-ec2-ip \
  --user ubuntu \
  --key ~/.ssh/your-key.pem
```

### 2.2 手動デプロイ（推奨）
```bash
# 1. ファイル転送
scp -r . ubuntu@your-ec2-ip:/opt/llm-orchestrator/

# 2. EC2にSSH接続
ssh ubuntu@your-ec2-ip

# 3. 依存関係インストール
cd /opt/llm-orchestrator
npm ci --production
npm run build

# 4. 環境変数設定
cp .env.production .env

# 5. PM2でサービス起動
npm install -g pm2
pm2 start dist/index.js --name llm-orchestrator
pm2 startup
pm2 save
```

---

## 🔍 ステップ3: 本番検証

### 3.1 ヘルスチェック
```bash
# サービス状態確認
curl http://your-ec2-ip:4000/health

# 期待される応答
{
  "status": "healthy",
  "timestamp": "2025-01-24T12:00:00.000Z",
  "services": {
    "gemini_2.5_pro_exp": "healthy",
    "openrouter": "healthy",
    "cost_management": "healthy"
  }
}
```

### 3.2 Gemini 2.5 Pro Exp統合テスト
```bash
# 複雑推論タスクテスト
curl -X POST http://your-ec2-ip:4000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "複雑なマイクロサービスアーキテクチャを設計してください",
    "task_type": "complex_analysis",
    "options": {"max_tokens": 500}
  }'

# 期待される応答
{
  "success": true,
  "model_used": "gemini_2.5_pro_exp",
  "tier_used": 0,
  "cost_info": {"total_cost_usd": 0.00}
}
```

### 3.3 フォールバック機能テスト
```bash
# フォールバック動作確認
curl -X POST http://your-ec2-ip:4000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一般的な質問です",
    "task_type": "general"
  }'

# Flash無料枠が使用されることを確認
```

---

## 📊 ステップ4: 監視・運用開始

### 4.1 システム監視
```bash
# PM2プロセス監視
pm2 monit

# システムメトリクス確認
curl http://your-ec2-ip:4000/metrics

# ログ確認
pm2 logs llm-orchestrator
```

### 4.2 コスト監視設定
```bash
# コスト情報確認
curl http://your-ec2-ip:4000/cost-info

# 期待される応答
{
  "monthly_budget": 70.00,
  "current_spend": 0.00,
  "budget_utilization": "0.0%",
  "tier_allocation": {
    "tier0": "70%",
    "tier1": "20%",
    "tier2": "8%",
    "tier3": "2%"
  }
}
```

---

## 🎯 運用上の重要ポイント

### コスト最適化
- **Tier 0優先**: Gemini 2.5 Pro Exp（無料）が最優先使用
- **フォールバック無料**: Gemini Flash（無料）への自動切り替え
- **予算管理**: 月間$70予算での自動制御

### 高可用性
- **15クライアント**: 14/15クライアント健全状態維持
- **自動フォールバック**: エンドポイント障害時も無停止運用
- **PM2管理**: プロセス自動再起動とクラスター化

### セキュリティ
- **JWT認証**: API アクセス制御
- **SSL/TLS**: HTTPS通信（Let's Encrypt推奨）
- **レート制限**: DDoS防御（100req/15min）

---

## 🚨 トラブルシューティング

### よくある問題

#### 1. Gemini 2.5 Pro Exp アクセス不可
```bash
# フォールバック動作確認
grep "falling back to Gemini 2.5 Flash" /var/log/llm-orchestrator/*.log
```

#### 2. API キーエラー
```bash
# 環境変数確認
pm2 show llm-orchestrator | grep env
```

#### 3. ポート接続問題
```bash
# セキュリティグループ確認
curl -v http://your-ec2-ip:4000/health
```

### 緊急時対応
```bash
# サービス再起動
pm2 restart llm-orchestrator

# 全面再デプロイ
pm2 delete llm-orchestrator
git pull origin master
npm run build
pm2 start dist/index.js --name llm-orchestrator
```

---

## 📞 サポート情報

### ログ場所
- **PM2ログ**: `~/.pm2/logs/`
- **アプリケーションログ**: `/var/log/llm-orchestrator/`
- **システムログ**: `/var/log/syslog`

### 監視ポイント
- **CPU使用率**: <70%
- **メモリ使用率**: <80%  
- **ディスク容量**: <85%
- **応答時間**: <2秒

**本番運用準備完了！** 🎉