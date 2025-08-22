# 🚀 Rocky Linux 9 マルチユーザー環境 完全デプロイガイド

5層ハイブリッドLLMシステム + マルチユーザー Claude Code 環境の包括的デプロイ手順

## 📋 システム概要

### アーキテクチャ
- **OS**: Rocky Linux 9
- **インスタンス推奨**: t3.medium以上（本番: m5.large推奨）
- **LLMシステム**: 5層ハイブリッド構成
- **ユーザー管理**: 独立した ~/.claude 環境
- **API管理**: 共有キー + セキュリティ追跡システム

### 主要コンポーネント
1. **LLMオーケストレーター**: Node.js + Express + TypeScript
2. **マルチユーザー認証**: UserAuthMiddleware
3. **自動環境構築**: Ansible Playbook
4. **Claude Code自動設定**: ログイン時自動設定

## 🎯 デプロイ手順

### Phase 1: インフラ準備

#### 1.1 AWS EC2インスタンス起動
```bash
# 推奨設定
インスタンスタイプ: m5.large (本番) / t3.medium (テスト)
AMI: Rocky Linux 9
ストレージ: gp3, 30GB以上
セキュリティグループ: SSH(22), HTTP(80), HTTPS(443), Custom(4000)
キーペア: aws-llm-multiuser.pem
```

#### 1.2 セキュリティグループ設定
```bash
# インバウンドルール
SSH (22): 管理者IPアドレスのみ
HTTP (80): 0.0.0.0/0
HTTPS (443): 0.0.0.0/0  
Custom TCP (4000): 0.0.0.0/0 (LLMオーケストレーター)

# アウトバウンドルール
All traffic: 0.0.0.0/0 (OpenAI API等へのアクセス)
```

### Phase 2: システムデプロイ

#### 2.1 LLMオーケストレーターデプロイ
```bash
# Rocky Linux 9 専用デプロイスクリプト実行
export AWS_VM_HOST="your-ec2-public-ip"
export AWS_VM_USER="ec2-user"
export AWS_VM_KEY="~/.ssh/aws-llm-multiuser.pem"

# デプロイ実行
./deploy/rocky-linux-deploy.sh
```

#### 2.2 環境変数設定
```bash
# VM上で .env ファイル設定
ssh -i ~/.ssh/aws-llm-multiuser.pem ec2-user@your-ec2-ip
cd /opt/llm-orchestrator
cp .env.example .env

# 必須環境変数設定
cat >> .env << 'EOF'
NODE_ENV=production
PORT=4000

# 共有APIキー (実際の値に置き換え)
OPENAI_API_KEY=sk-your-openai-key-here
CLAUDE_API_KEY=sk-ant-your-anthropic-key-here  
GOOGLE_API_KEY=your-google-gemini-key-here

# コスト管理
MONTHLY_BUDGET_USD=200.00
COST_ALERT_WEBHOOK=https://your-webhook.com/alerts
EOF

# サービス再起動
sudo systemctl restart llm-orchestrator
sudo systemctl status llm-orchestrator
```

### Phase 3: マルチユーザー環境構築

#### 3.1 Ansible環境準備
```bash
# ローカル環境でAnsible準備
pip3 install ansible

# インベントリファイル編集
cp deploy/inventory.ini.example deploy/inventory.ini
vim deploy/inventory.ini

# 実際のIPアドレスを設定
[rocky_llm_vms]
192.168.1.100 ansible_user=ec2-user ansible_ssh_private_key_file=~/.ssh/aws-llm-multiuser.pem
```

#### 3.2 ユーザー情報設定
```bash
# ユーザー情報を multi-user-setup.yml で設定
vim deploy/multi-user-setup.yml

# claude_users セクションを実際のメンバー情報で更新
claude_users:
  - name: developer1
    full_name: "Developer Name 1"
    uid: 2001
    initial_password_hash: "$6$rounds=4096$salt$hash"  # mkpasswd で生成
    ssh_public_key: "ssh-rsa AAAAB3NzaC1yc2E... dev1@company.com"
  - name: developer2
    full_name: "Developer Name 2"  
    uid: 2002
    initial_password_hash: "$6$rounds=4096$salt$hash"
    ssh_public_key: "ssh-rsa AAAAB3NzaC1yc2E... dev2@company.com"
```

#### 3.3 APIキー暗号化設定
```bash
# Ansible Vault でAPIキーを暗号化
ansible-vault create deploy/vault.yml

# vault.yml の内容 (エディタで開く)
vault_openai_api_key: "sk-your-real-openai-key"
vault_anthropic_api_key: "sk-ant-your-real-anthropic-key"  
vault_google_api_key: "your-real-google-key"
admin_contact: "admin@company.com"
```

#### 3.4 マルチユーザー環境デプロイ実行
```bash
# Ansible Playbook 実行
ansible-playbook -i deploy/inventory.ini \
                 --vault-password-file=<(echo "your-vault-password") \
                 deploy/multi-user-setup.yml

# 実行結果確認
# ✅ ユーザー作成完了
# ✅ SSH公開鍵設定完了  
# ✅ Node.js + NVM 環境構築完了
# ✅ Claude CLI インストール完了
# ✅ ~/.claude 自動設定完了
```

### Phase 4: 動作確認とテスト

#### 4.1 システムヘルスチェック
```bash
# LLMオーケストレーター動作確認
curl http://your-ec2-ip:4000/health
curl http://your-ec2-ip:4000/info

# 期待するレスポンス
{
  "success": true,
  "data": {
    "system": "5-Tier Hybrid LLM System",
    "available_models": 5,
    "models_by_tier": {
      "tier0": 1, "tier1": 1, "tier2": 1, "tier3": 2
    }
  }
}
```

#### 4.2 マルチユーザーテスト
```bash
# 各ユーザーでSSHログイン確認
ssh -i ~/.ssh/user1-key developer1@your-ec2-ip

# ログイン時の自動表示確認
# 🤖 Claude Code マルチユーザー環境
# ✅ Node.js: v20.x.x
# ✅ Claude CLI: インストール済み
# ✅ ~/.claude: 設定済み
# ✅ オーケストレーター: 接続OK

# Claude Code動作テスト
claude --help
llm-status
llm-info
```

#### 4.3 機能テスト
```bash
# 基本生成テスト
curl -X POST http://your-ec2-ip:4000/generate \
  -H "Content-Type: application/json" \
  -H "X-User-ID: developer1" \
  -d '{
    "prompt": "Hello, Rocky Linux 9 multi-user system test",
    "task_type": "general"
  }'

# コーディングテスト  
curl -X POST http://your-ec2-ip:4000/code \
  -H "Content-Type: application/json" \
  -H "X-User-ID: developer1" \
  -d '{
    "task": "Create a Python function to calculate factorial",
    "language": "python",
    "include_tests": true
  }'

# OpenAI Assistant API テスト
curl -X POST http://your-ec2-ip:4000/assistant/chat \
  -H "Content-Type: application/json" \
  -H "X-User-ID: developer1" \
  -d '{
    "message": "Explain the benefits of microservices architecture"
  }'
```

## 🔐 セキュリティ設定

### 追加セキュリティ措置

#### SSL/TLS設定 (推奨)
```bash
# Let's Encrypt証明書取得
sudo dnf install -y certbot
sudo certbot certonly --standalone -d your-domain.com

# Nginx リバースプロキシ設定
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Nginx設定
sudo tee /etc/nginx/sites-available/llm-orchestrator << 'EOF'
server {
    listen 80;
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-User-ID $http_x_user_id;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx
```

#### ファイアウォール強化
```bash
# firewalld 追加設定
sudo firewall-cmd --zone=public --add-service=http --permanent
sudo firewall-cmd --zone=public --add-service=https --permanent
sudo firewall-cmd --zone=public --remove-port=4000/tcp --permanent  # Nginxが代行
sudo firewall-cmd --reload

# 不要サービス無効化
sudo systemctl disable cups
sudo systemctl disable bluetooth
```

## 📊 監視とメンテナンス

### システム監視設定

#### CloudWatch エージェント設定
```bash
# CloudWatch エージェントインストール
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# 設定ファイル作成
sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "metrics": {
    "namespace": "LLM/Orchestrator",
    "metrics_collected": {
      "cpu": {"measurement": ["cpu_usage_idle", "cpu_usage_user", "cpu_usage_system"]},
      "disk": {"measurement": ["used_percent"], "resources": ["*"]},
      "mem": {"measurement": ["mem_used_percent"]},
      "net": {"measurement": ["bytes_sent", "bytes_recv", "packets_sent", "packets_recv"]}
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/llm-orchestrator/*.log",
            "log_group_name": "/aws/ec2/llm-orchestrator",
            "log_stream_name": "{instance_id}/app.log"
          },
          {
            "file_path": "/opt/llm-orchestrator/data/user-usage-logs.jsonl", 
            "log_group_name": "/aws/ec2/llm-usage",
            "log_stream_name": "{instance_id}/usage.log"
          }
        ]
      }
    }
  }
}
EOF

# CloudWatch エージェント起動
sudo systemctl enable amazon-cloudwatch-agent
sudo systemctl start amazon-cloudwatch-agent
```

### 定期メンテナンス

#### 日次メンテナンススクリプト
```bash
# crontab 設定
cat >> /tmp/maintenance-cron << 'EOF'
# LLMシステム日次メンテナンス
0 2 * * * /opt/llm-orchestrator/deploy/daily-maintenance.sh
0 6 * * * /opt/llm-orchestrator/deploy/usage-report.sh
EOF

sudo crontab /tmp/maintenance-cron
```

## 🎓 ユーザー教育

### 初回ログイン時の案内

各ユーザーの初回ログイン時に表示される内容:
1. セキュリティガイドライン説明
2. 5層システムの使い方
3. コスト管理の重要性
4. 基本的な使用方法
5. トラブルシューティング

### 継続的な教育
- 月次利用状況レポートの共有
- ベストプラクティスの共有
- セキュリティアップデートの通知
- 新機能の案内

## 🚨 トラブルシューティング

### よくある問題と解決方法

#### 1. Claude CLI が動作しない
```bash
# NVM環境確認
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Claude CLI 再インストール  
npm install -g @anthropic-ai/claude-cli
```

#### 2. API接続エラー
```bash
# 環境変数確認
echo $CLAUDE_API_KEY | head -c 10

# ネットワーク確認
curl -I https://api.anthropic.com/
curl http://localhost:4000/health
```

#### 3. 権限エラー
```bash
# ~/.claude 権限修正
chmod 700 ~/.claude
chmod 600 ~/.claude/*

# ユーザーグループ確認
id
groups
```

## 📈 スケーリング計画

### 水平スケーリング
- ロードバランサー + 複数インスタンス
- セッション情報の外部ストレージ化
- データベース分離

### 垂直スケーリング  
- インスタンスタイプ変更
- メモリ・CPU増強
- ストレージ拡張

## 📞 サポート体制

### サポート連絡先
- **システム管理者**: system-admin@company.com
- **技術サポート**: tech-support@company.com  
- **セキュリティ**: security@company.com

### エスカレーション手順
1. ユーザー → 技術サポート
2. 技術サポート → システム管理者
3. 重大問題 → セキュリティチーム

---

## ✅ デプロイ完了チェックリスト

- [ ] AWS EC2インスタンス起動・設定完了
- [ ] Rocky Linux 9 基本環境構築完了
- [ ] LLMオーケストレーター デプロイ完了
- [ ] 環境変数・APIキー設定完了
- [ ] マルチユーザー環境 Ansible構築完了
- [ ] 全ユーザーのSSH接続確認完了
- [ ] Claude Code 自動設定動作確認完了
- [ ] システム機能テスト完了
- [ ] セキュリティ設定完了
- [ ] 監視・ログ設定完了
- [ ] ユーザー教育・ドキュメント整備完了
- [ ] バックアップ体制構築完了

🎉 **Rocky Linux 9 マルチユーザー Claude Code 環境デプロイ完了！**

本格的な5層ハイブリッドLLMシステムでの開発業務をお楽しみください。