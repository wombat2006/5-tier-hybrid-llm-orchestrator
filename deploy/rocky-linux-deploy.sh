#!/bin/bash

# Rocky Linux 9 対応 AWS VM デプロイスクリプト
# 5層ハイブリッドLLMシステム + マルチユーザー環境対応

set -e

# カラーコード定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 設定変数
AWS_VM_USER="${AWS_VM_USER:-ec2-user}"  # Rocky Linux 9 では ec2-user
AWS_VM_HOST="${AWS_VM_HOST:-}"
AWS_VM_KEY="${AWS_VM_KEY:-~/.ssh/aws-llm-system.pem}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/llm-orchestrator}"
SERVICE_NAME="llm-orchestrator"
NODE_VERSION="${NODE_VERSION:-20}"

# ログ関数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 使用法表示
show_usage() {
    echo "使用法: $0 [OPTIONS]"
    echo ""
    echo "オプション:"
    echo "  -h, --host HOST       AWS VM のホスト名/IP"
    echo "  -u, --user USER       SSH ユーザー名 (Rocky Linux 9: ec2-user)"
    echo "  -k, --key KEY         SSH 秘密鍵のパス"
    echo "  -p, --path PATH       デプロイ先パス (デフォルト: /opt/llm-orchestrator)"
    echo "  --help               このヘルプを表示"
    echo ""
    echo "Rocky Linux 9 固有設定:"
    echo "  • パッケージマネージャー: dnf"
    echo "  • ファイアウォール: firewalld"
    echo "  • デフォルトユーザー: ec2-user"
}

# 引数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host) AWS_VM_HOST="$2"; shift 2 ;;
        -u|--user) AWS_VM_USER="$2"; shift 2 ;;
        -k|--key) AWS_VM_KEY="$2"; shift 2 ;;
        -p|--path) DEPLOY_PATH="$2"; shift 2 ;;
        --help) show_usage; exit 0 ;;
        *) log_error "不明なオプション: $1"; show_usage; exit 1 ;;
    esac
done

# 必須パラメーター確認
if [ -z "$AWS_VM_HOST" ]; then
    log_error "AWS VM ホストが指定されていません"
    show_usage; exit 1
fi

# デプロイ開始
echo "==========================================="
echo "🚀 Rocky Linux 9 AWS VM デプロイ開始"
echo "==========================================="
log_info "ホスト: $AWS_VM_USER@$AWS_VM_HOST"
log_info "OS: Rocky Linux 9"
log_info "デプロイ先: $DEPLOY_PATH"

# 1. デプロイ準備チェック
log_info "1️⃣ デプロイ準備チェック実行中..."
if ! node deploy/pre-deploy-check.js; then
    log_error "デプロイ準備チェックに失敗しました"
    exit 1
fi
log_success "デプロイ準備チェック完了"

# 2. SSH接続確認
log_info "2️⃣ Rocky Linux VM への接続確認中..."
if ! ssh -i "$AWS_VM_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$AWS_VM_USER@$AWS_VM_HOST" "echo 'SSH接続確認OK'" > /dev/null 2>&1; then
    log_error "Rocky Linux VM への SSH 接続に失敗しました"
    log_info "確認事項:"
    log_info "  • SSH鍵のパス: $AWS_VM_KEY"
    log_info "  • ホスト名/IP: $AWS_VM_HOST"
    log_info "  • ユーザー名: $AWS_VM_USER (Rocky Linux 9: ec2-user)"
    exit 1
fi
log_success "SSH接続確認完了"

# 3. Rocky Linux 9 環境準備
log_info "3️⃣ Rocky Linux 9 環境準備中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << 'EOF'
    set -e
    
    echo "🔄 システム更新中..."
    sudo dnf update -y -q
    
    echo "📦 必要なパッケージインストール中..."
    sudo dnf install -y git curl wget make gcc-c++ openssl-devel
    
    # EPEL リポジトリ有効化
    sudo dnf install -y epel-release
    
    # Node.js用の追加パッケージ
    sudo dnf groupinstall -y "Development Tools"
    
    echo "🔥 firewalld 設定中..."
    sudo systemctl start firewalld
    sudo systemctl enable firewalld
    
    # 必要なポート開放
    sudo firewall-cmd --zone=public --add-port=4000/tcp --permanent
    sudo firewall-cmd --zone=public --add-port=80/tcp --permanent
    sudo firewall-cmd --zone=public --add-port=443/tcp --permanent
    sudo firewall-cmd --reload
    
    echo "✅ Rocky Linux 9 環境準備完了"
EOF
log_success "Rocky Linux 9 環境準備完了"

# 4. Node.js インストール (NVM使用)
log_info "4️⃣ Node.js インストール中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    
    # NVM インストール
    if [ ! -d "\$HOME/.nvm" ]; then
        echo "📥 NVM インストール中..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        export NVM_DIR="\$HOME/.nvm"
        [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
    else
        export NVM_DIR="\$HOME/.nvm"
        [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
    fi
    
    # Node.js ${NODE_VERSION} インストール
    echo "📥 Node.js ${NODE_VERSION} インストール中..."
    nvm install ${NODE_VERSION}
    nvm use ${NODE_VERSION}
    nvm alias default ${NODE_VERSION}
    
    # PM2 グローバルインストール
    echo "📥 PM2 インストール中..."
    npm install -g pm2
    
    # Node.js バージョン確認
    node --version
    npm --version
    pm2 --version
    
    echo "✅ Node.js 環境構築完了"
EOF
log_success "Node.js インストール完了"

# 5. デプロイディレクトリ準備
log_info "5️⃣ デプロイディレクトリ準備中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    
    # デプロイディレクトリ作成
    sudo mkdir -p $DEPLOY_PATH
    sudo chown -R $AWS_VM_USER:$AWS_VM_USER $DEPLOY_PATH
    
    # ログディレクトリ作成
    sudo mkdir -p /var/log/llm-orchestrator
    sudo chown -R $AWS_VM_USER:$AWS_VM_USER /var/log/llm-orchestrator
    
    echo "✅ ディレクトリ準備完了"
EOF
log_success "ディレクトリ準備完了"

# 6. アプリケーションファイル転送
log_info "6️⃣ アプリケーションファイル転送中..."
TEMP_DIR=$(mktemp -d)
cp -r package.json package-lock.json dist src/config "$TEMP_DIR/"
cp README.md .env.example "$TEMP_DIR/" 2>/dev/null || true

# Rocky Linux 9 専用設定ファイルも転送
cp deploy/rocky-linux-deploy.sh "$TEMP_DIR/" 2>/dev/null || true

rsync -avz --delete -e "ssh -i $AWS_VM_KEY" "$TEMP_DIR/" "$AWS_VM_USER@$AWS_VM_HOST:$DEPLOY_PATH/"
rm -rf "$TEMP_DIR"
log_success "ファイル転送完了"

# 7. 依存関係インストール
log_info "7️⃣ 依存関係インストール中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    cd $DEPLOY_PATH
    
    # NVM 環境読み込み
    export NVM_DIR="\$HOME/.nvm"
    [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
    
    # 本番用依存関係のみインストール
    npm ci --production --silent
    
    echo "✅ 依存関係インストール完了"
EOF
log_success "依存関係インストール完了"

# 8. systemd サービス設定
log_info "8️⃣ systemd サービス設定中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    
    # systemd サービスファイル作成
    sudo tee /etc/systemd/system/llm-orchestrator.service > /dev/null << 'SERVICE_EOF'
[Unit]
Description=5-Tier Hybrid LLM Orchestrator
After=network.target

[Service]
Type=simple
User=$AWS_VM_USER
WorkingDirectory=$DEPLOY_PATH
Environment=NODE_ENV=production
Environment=PATH=/home/$AWS_VM_USER/.nvm/versions/node/v${NODE_VERSION}/bin:/usr/bin:/bin
ExecStart=/home/$AWS_VM_USER/.nvm/versions/node/v${NODE_VERSION}/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    sudo systemctl daemon-reload
    sudo systemctl enable llm-orchestrator
    
    echo "✅ systemd サービス設定完了"
EOF
log_success "systemd サービス設定完了"

# 9. 環境変数設定確認
log_info "9️⃣ 環境変数設定確認..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    cd $DEPLOY_PATH
    
    if [ ! -f .env ]; then
        echo "⚠️  .env ファイルが見つかりません"
        echo "📝 以下の手順で .env ファイルを作成してください:"
        echo ""
        echo "1. cp .env.example .env"
        echo "2. 必要なAPI キーを設定:"
        echo "   • ALIBABA_ACCESS_KEY_ID"
        echo "   • ALIBABA_ACCESS_KEY_SECRET"  
        echo "   • GOOGLE_API_KEY"
        echo "   • ANTHROPIC_API_KEY"
        echo "   • OPENAI_API_KEY"
        echo "   • NODE_ENV=production"
        echo "   • PORT=4000"
        echo ""
        echo ".env.example の内容:"
        if [ -f .env.example ]; then
            head -20 .env.example
        fi
    else
        echo "✅ .env ファイル確認済み"
    fi
EOF

# 10. サービス起動
log_info "🔟 サービス起動..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    cd $DEPLOY_PATH
    
    # サービス開始
    sudo systemctl start llm-orchestrator
    
    # サービス状態確認
    sudo systemctl status llm-orchestrator --no-pager
    
    echo "✅ サービス起動完了"
EOF
log_success "サービス起動完了"

# 11. ヘルスチェック
log_info "1️⃣1️⃣ ヘルスチェック実行中..."
sleep 10
HEALTH_CHECK_URL="http://$AWS_VM_HOST:4000/health"

if command -v curl &> /dev/null; then
    for i in {1..5}; do
        if curl -s "$HEALTH_CHECK_URL" | grep -q "success"; then
            log_success "ヘルスチェック成功 - システム正常稼働中"
            break
        fi
        if [ $i -eq 5 ]; then
            log_warning "ヘルスチェック失敗 - サービスログを確認してください"
        else
            log_info "ヘルスチェック再試行中... ($i/5)"
            sleep 5
        fi
    done
else
    log_info "手動でヘルスチェックを実行してください: $HEALTH_CHECK_URL"
fi

# 12. デプロイ完了情報
echo ""
echo "==========================================="
echo "🎉 Rocky Linux 9 デプロイ完了!"
echo "==========================================="
echo ""
log_success "5層ハイブリッドLLMシステムが Rocky Linux 9 VM にデプロイされました"
echo ""
echo "📋 デプロイ情報:"
echo "   🐧 OS: Rocky Linux 9"
echo "   🌐 ホスト: $AWS_VM_HOST"
echo "   📁 パス: $DEPLOY_PATH"
echo "   🚀 サービス: llm-orchestrator (systemd)"
echo ""
echo "🔗 アクセス URL:"
echo "   • ヘルスチェック: http://$AWS_VM_HOST:4000/health"
echo "   • システム情報: http://$AWS_VM_HOST:4000/info"
echo "   • メトリクス: http://$AWS_VM_HOST:4000/metrics"
echo ""
echo "🛠️ Rocky Linux 9 管理コマンド:"
echo "   • サービス状態: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'sudo systemctl status llm-orchestrator'"
echo "   • サービス再起動: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'sudo systemctl restart llm-orchestrator'"
echo "   • ログ確認: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'sudo journalctl -u llm-orchestrator -f'"
echo "   • ファイアウォール状態: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'sudo firewall-cmd --list-all'"
echo ""
echo "⚙️ 次のステップ:"
echo "   1. cd $DEPLOY_PATH && cp .env.example .env"
echo "   2. .env ファイルに API キーを設定"
echo "   3. sudo systemctl restart llm-orchestrator"
echo "   4. ヘルスチェック実行"
echo ""
echo "🎯 テスト実行:"
echo "   curl -X POST http://$AWS_VM_HOST:4000/generate \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"prompt\":\"Hello Rocky Linux 9 hybrid system\",\"task_type\":\"general\"}'"

log_success "Rocky Linux 9 デプロイスクリプト実行完了"