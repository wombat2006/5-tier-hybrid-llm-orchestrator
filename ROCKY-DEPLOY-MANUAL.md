# 🐧 Rocky Linux 手動デプロイガイド
## 5層ハイブリッドLLMシステム - EC2 Rocky Linux対応

## 🚀 手動デプロイ手順

### 1. ファイル転送
```bash
# プロジェクト全体をEC2に転送
scp -i /path/to/your/keyfile.pem -r . rocky@YOUR_EC2_IP:/home/rocky/llm-orchestrator

# または圧縮して転送（推奨）
tar -czf llm-orchestrator.tar.gz --exclude=node_modules --exclude=.git .
scp -i /path/to/your/keyfile.pem llm-orchestrator.tar.gz rocky@YOUR_EC2_IP:/home/rocky/
```

### 2. SSH接続
```bash
ssh -i /path/to/your/keyfile.pem rocky@YOUR_EC2_IP
```

### 3. システム準備
```bash
# システム更新
sudo dnf update -y

# 必要なパッケージインストール
sudo dnf install -y git curl wget tar unzip

# Node.js 20.x インストール
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Node.js バージョン確認
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 4. プロジェクトセットアップ
```bash
# 作業ディレクトリ移動
cd /home/rocky

# アーカイブ展開（圧縮転送した場合）
tar -xzf llm-orchestrator.tar.gz
cd llm-orchestrator

# または直接ディレクトリに移動
cd llm-orchestrator

# 依存関係インストール
npm ci --production

# TypeScriptビルド
npm run build

# ビルド確認
ls -la dist/
```

### 5. 本番ディレクトリ作成
```bash
# 本番ディレクトリ作成
sudo mkdir -p /opt/llm-orchestrator
sudo chown rocky:rocky /opt/llm-orchestrator

# ファイル移動
cp -r * /opt/llm-orchestrator/
cd /opt/llm-orchestrator
```

### 6. 環境変数設定
```bash
# 本番環境設定ファイル作成
cp .env.production .env

# 環境変数編集（実際のAPIキーに変更）
vim .env

# 必須: 以下の値を実際のAPIキーに変更
# GOOGLE_API_KEY=your_actual_google_api_key
# OPENROUTER_API_KEY=your_actual_openrouter_key
# ANTHROPIC_API_KEY=your_actual_anthropic_key
# OPENAI_API_KEY=your_actual_openai_key
# JWT_SECRET=your_strong_jwt_secret_32_chars_or_more
```

### 7. PM2インストールとサービス起動
```bash
# PM2 グローバルインストール
sudo npm install -g pm2

# サービス起動
pm2 start dist/index.js --name llm-orchestrator

# PM2状態確認
pm2 status

# システム起動時の自動起動設定
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u rocky --hp /home/rocky

# 現在の設定保存
pm2 save
```

### 8. ファイアウォール設定
```bash
# ポート4000開放
sudo firewall-cmd --permanent --add-port=4000/tcp
sudo firewall-cmd --reload

# 設定確認
sudo firewall-cmd --list-ports
```

### 9. サービス確認
```bash
# ローカルヘルスチェック
curl http://localhost:4000/health

# 外部からのアクセステスト
curl http://YOUR_EC2_IP:4000/health
```

## 🔧 トラブルシューティング

### Node.js インストール問題
```bash
# Node.js リポジトリ手動追加
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# または nvm使用
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### PM2 権限問題
```bash
# PM2ディレクトリ権限修正
sudo chown -R rocky:rocky ~/.pm2/
```

### ファイアウォール問題
```bash
# ファイアウォール状態確認
sudo firewall-cmd --state
sudo firewall-cmd --list-all

# 一時的無効化（テスト用）
sudo systemctl stop firewalld
```

### サービス起動問題
```bash
# PM2ログ確認
pm2 logs llm-orchestrator

# 手動起動テスト
cd /opt/llm-orchestrator
node dist/index.js
```

## ✅ デプロイ完了確認

成功した場合の確認項目:
- [ ] `pm2 status` でサービス稼働中
- [ ] `curl http://localhost:4000/health` が成功
- [ ] `curl http://YOUR_EC2_IP:4000/health` が成功
- [ ] ログにエラーが無い
- [ ] システム再起動後も自動起動

**Rocky Linux デプロイ完了！** 🎉