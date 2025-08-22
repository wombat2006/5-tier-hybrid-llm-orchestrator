# 🚀 AWS VM デプロイガイド

5層ハイブリッドLLMシステムのAWS VM デプロイ完全ガイド

## 📋 前提条件

### システム要件
- **AWS EC2インスタンス**: t3.medium 以上推奨
- **OS**: Ubuntu 20.04 LTS または Amazon Linux 2
- **Node.js**: 18.x以上 (20.x推奨)
- **メモリ**: 最低4GB、推奨8GB以上
- **ストレージ**: 最低20GB

### 必要な権限
- EC2インスタンスへのSSH接続権限
- セキュリティグループ編集権限
- IAMロール作成権限（推奨）

## 🔧 事前準備

### 1. AWS EC2インスタンス起動

```bash
# EC2インスタンス推奨設定
インスタンスタイプ: t3.medium以上
AMI: Ubuntu Server 20.04 LTS
ストレージ: gp3, 20GB以上
セキュリティグループ: SSH(22), HTTP(80), HTTPS(443), Custom(4000)
```

### 2. SSH鍵ペアの設定

```bash
# SSH鍵の権限設定
chmod 600 ~/.ssh/aws-llm-system.pem

# 接続テスト
ssh -i ~/.ssh/aws-llm-system.pem ubuntu@your-ec2-public-ip
```

### 3. セキュリティグループ設定

必要なポート開放:
- **SSH (22)**: 管理者IPアドレスのみ
- **HTTP (80)**: 0.0.0.0/0 (リバースプロキシ経由)
- **HTTPS (443)**: 0.0.0.0/0 (SSL終端)
- **アプリケーション (4000)**: 0.0.0.0/0 または Load Balancer

## 🚀 自動デプロイ実行

### 基本デプロイコマンド

```bash
# 環境変数設定
export AWS_VM_HOST="your-ec2-public-ip"
export AWS_VM_USER="ubuntu"
export AWS_VM_KEY="~/.ssh/aws-llm-system.pem"

# デプロイ実行
./deploy/aws-deploy.sh
```

### オプション付きデプロイ

```bash
# 全オプション指定
./deploy/aws-deploy.sh \
  --host ec2-xxx.compute-1.amazonaws.com \
  --user ubuntu \
  --key ~/.ssh/aws-key.pem \
  --path /opt/llm-orchestrator
```

## ⚙️ 手動デプロイ手順

自動デプロイが失敗した場合の手動手順:

### 1. 前提条件チェック

```bash
# ローカル環境でチェック実行
node deploy/pre-deploy-check.js
```

### 2. VM環境準備

```bash
# EC2インスタンスにSSH接続
ssh -i ~/.ssh/aws-key.pem ubuntu@your-ec2-ip

# システム更新
sudo apt update && sudo apt upgrade -y

# Node.js 20.x インストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 インストール
sudo npm install -g pm2

# デプロイディレクトリ作成
sudo mkdir -p /opt/llm-orchestrator
sudo chown -R ubuntu:ubuntu /opt/llm-orchestrator
```

### 3. アプリケーション転送

```bash
# ローカル環境から実行
scp -r -i ~/.ssh/aws-key.pem \
  package.json package-lock.json dist src/config README.md .env.example \
  ubuntu@your-ec2-ip:/opt/llm-orchestrator/
```

### 4. 依存関係インストール

```bash
# EC2インスタンス上で実行
cd /opt/llm-orchestrator
npm ci --production
```

### 5. 環境変数設定

```bash
# .envファイル作成
cp .env.example .env
nano .env

# 必須項目設定
NODE_ENV=production
PORT=4000
OPENAI_API_KEY=your_openai_api_key
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 6. サービス起動

```bash
# PM2でサービス開始
pm2 start dist/index.js --name llm-orchestrator

# 自動起動設定
pm2 startup
pm2 save

# サービス状態確認
pm2 status
pm2 logs llm-orchestrator
```

## 🔍 デプロイ後確認

### 1. ヘルスチェック

```bash
# ローカルから実行
curl http://your-ec2-ip:4000/health

# 期待するレスポンス
{
  "success": true,
  "timestamp": "2024-XX-XXTXX:XX:XX.XXXZ",
  "details": {
    "models_available": 5,
    "services_healthy": true
  }
}
```

### 2. 機能テスト

```bash
# 基本生成テスト
curl -X POST http://your-ec2-ip:4000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello, test the hybrid system",
    "task_type": "general"
  }'

# コーディングテスト
curl -X POST http://your-ec2-ip:4000/code \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a simple Python function",
    "language": "python",
    "include_tests": true
  }'
```

### 3. システム情報確認

```bash
curl http://your-ec2-ip:4000/info
curl http://your-ec2-ip:4000/metrics
```

## 📊 監視とメンテナンス

### PM2 管理コマンド

```bash
# サービス状態確認
pm2 status

# ログ確認
pm2 logs llm-orchestrator

# サービス再起動
pm2 restart llm-orchestrator

# サービス停止
pm2 stop llm-orchestrator

# 監視ダッシュボード
pm2 monit
```

### システム監視

```bash
# システムリソース確認
htop
df -h
free -h

# ネットワーク接続確認
ss -tulnp | grep 4000
```

## 🛡️ セキュリティ設定

### 1. ファイアウォール設定

```bash
# UFW設定
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 4000/tcp
sudo ufw status
```

### 2. SSL/TLS設定（推奨）

```bash
# Let's Encryptでの証明書取得例
sudo snap install certbot
sudo certbot certonly --standalone -d your-domain.com
```

### 3. Nginx リバースプロキシ（推奨）

```nginx
# /etc/nginx/sites-available/llm-orchestrator
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔧 トラブルシューティング

### よくある問題

#### 1. 「PORT already in use」エラー
```bash
# ポート使用プロセス確認
sudo lsof -i :4000
# プロセス終了
sudo kill -9 <PID>
```

#### 2. 「Permission denied」エラー
```bash
# ディレクトリ権限確認
ls -la /opt/llm-orchestrator
# 権限修正
sudo chown -R ubuntu:ubuntu /opt/llm-orchestrator
```

#### 3. API接続エラー
```bash
# .envファイル確認
cat .env | grep API_KEY
# ネットワーク接続確認
curl -I https://api.openai.com
```

#### 4. メモリ不足
```bash
# スワップファイル作成
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### ログ確認

```bash
# PM2ログ
pm2 logs llm-orchestrator --lines 100

# システムログ
sudo journalctl -u pm2-ubuntu -f

# アプリケーションログ
tail -f /opt/llm-orchestrator/logs/*.log
```

## 📈 スケーリング

### 水平スケーリング

```bash
# PM2クラスタモード
pm2 start dist/index.js --name llm-orchestrator --instances max

# ロードバランサー設定
# AWS Application Load Balancer推奨
```

### 垂直スケーリング

```bash
# インスタンスタイプ変更
# t3.medium → t3.large → t3.xlarge
```

## 🎯 本番環境チェックリスト

- [ ] セキュリティグループ設定完了
- [ ] SSL証明書設定（HTTPS化）
- [ ] 環境変数（APIキー）設定
- [ ] ファイアウォール設定
- [ ] 監視設定（CloudWatch等）
- [ ] バックアップ設定
- [ ] ログローテーション設定
- [ ] 自動復旧設定
- [ ] 負荷テスト実行
- [ ] セキュリティテスト実行

## 📞 サポート

デプロイに関する問題や疑問がある場合:

1. このガイドのトラブルシューティングセクションを確認
2. システムログとアプリケーションログを確認
3. AWS EC2のセキュリティグループとネットワーク設定を確認
4. API接続とキーの有効性を確認

---

🎉 **デプロイ完了後、本格的な5層ハイブリッドLLMシステムをお楽しみください！**