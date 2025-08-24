#!/bin/bash

# Git-ベース Rocky Linux 9 対応 AWS VM デプロイスクリプト
# 5層ハイブリッドLLMシステム - Gitリポジトリ連携デプロイ

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
GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/wombat2006/5-tier-hybrid-llm-orchestrator.git}"
GIT_BRANCH="${GIT_BRANCH:-master}"

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
    echo "  -r, --repo URL        Git リポジトリURL"
    echo "  -b, --branch BRANCH   Git ブランチ名 (デフォルト: master)"
    echo "  --help               このヘルプを表示"
    echo ""
    echo "Git-ベースデプロイの利点:"
    echo "  • バージョン管理と履歴追跡"
    echo "  • 増分更新による高速デプロイ"
    echo "  • ロールバック機能"
    echo "  • 設定の一元管理"
}

# 引数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host) AWS_VM_HOST="$2"; shift 2 ;;
        -u|--user) AWS_VM_USER="$2"; shift 2 ;;
        -k|--key) AWS_VM_KEY="$2"; shift 2 ;;
        -p|--path) DEPLOY_PATH="$2"; shift 2 ;;
        -r|--repo) GIT_REPO_URL="$2"; shift 2 ;;
        -b|--branch) GIT_BRANCH="$2"; shift 2 ;;
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
echo "============================================="
echo "🚀 Git-ベース Rocky Linux 9 デプロイ開始"
echo "============================================="
log_info "ホスト: $AWS_VM_USER@$AWS_VM_HOST"
log_info "OS: Rocky Linux 9"
log_info "デプロイ先: $DEPLOY_PATH"
log_info "Git リポジトリ: $GIT_REPO_URL"
log_info "Git ブランチ: $GIT_BRANCH"

# 1. SSH接続確認
log_info "1️⃣ Rocky Linux VM への接続確認中..."
if ! ssh -i "$AWS_VM_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$AWS_VM_USER@$AWS_VM_HOST" "echo 'SSH接続確認OK'" > /dev/null 2>&1; then
    log_error "Rocky Linux VM への SSH 接続に失敗しました"
    exit 1
fi
log_success "SSH接続確認完了"

# 2. Rocky Linux 9 環境準備
log_info "2️⃣ Rocky Linux 9 環境準備中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << 'EOF'
    set -e
    
    echo "🔄 システム更新中..."
    sudo dnf update -y -q
    
    echo "📦 必要なパッケージインストール中..."
    sudo dnf install -y git curl wget make gcc-c++ openssl-devel
    
    # EPEL リポジトリ有効化
    sudo dnf install -y epel-release
    
    # Development Tools
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

# 3. Node.js インストール (NVM使用)
log_info "3️⃣ Node.js インストール中..."
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

# 4. デプロイディレクトリ準備
log_info "4️⃣ デプロイディレクトリ準備中..."
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

# 5. Git リポジトリクローン/更新
log_info "5️⃣ Git リポジトリデプロイ中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    
    if [ -d "$DEPLOY_PATH/.git" ]; then
        echo "📥 既存リポジトリ更新中..."
        cd $DEPLOY_PATH
        git fetch origin
        git reset --hard origin/$GIT_BRANCH
        git pull origin $GIT_BRANCH
    else
        echo "📥 リポジトリクローン中..."
        git clone -b $GIT_BRANCH $GIT_REPO_URL $DEPLOY_PATH
        cd $DEPLOY_PATH
    fi
    
    echo "Git デプロイ完了: \$(git log -1 --oneline)"
EOF
log_success "Git リポジトリデプロイ完了"

# 6. 依存関係インストールとビルド
log_info "6️⃣ 依存関係インストール中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    cd $DEPLOY_PATH
    
    # NVM 環境読み込み
    export NVM_DIR="\$HOME/.nvm"
    [ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
    
    # 本番用依存関係のみインストール
    echo "📦 npm ci --production 実行中..."
    npm ci --production --silent
    
    # TypeScriptビルド（devDependenciesが必要な場合）
    if [ -f "tsconfig.json" ] && [ ! -d "dist" ]; then
        echo "🔨 TypeScriptビルド実行中..."
        npm install typescript @types/node --save-dev
        npm run build
    fi
    
    echo "✅ 依存関係インストール完了"
EOF
log_success "依存関係インストール完了"

# 7. 環境変数設定
log_info "7️⃣ 環境変数設定確認..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    cd $DEPLOY_PATH
    
    if [ ! -f .env ]; then
        echo "⚠️  .env ファイルが見つかりません"
        echo "📝 以下の手順で .env ファイルを作成してください:"
        echo ""
        echo "1. cp .env.production .env"
        echo "2. 必要なAPI キーを設定:"
        echo "   • ALIBABA_ACCESS_KEY_ID"
        echo "   • ALIBABA_ACCESS_KEY_SECRET"  
        echo "   • GOOGLE_API_KEY"
        echo "   • ANTHROPIC_API_KEY"
        echo "   • OPENAI_API_KEY"
        echo "   • NODE_ENV=production"
        echo "   • PORT=4000"
        echo ""
        echo ".env.production の内容:"
        if [ -f .env.production ]; then
            head -20 .env.production
        fi
    else
        echo "✅ .env ファイル確認済み"
    fi
EOF

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

# 9. サービス起動
log_info "9️⃣ サービス起動..."
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

# 10. ヘルスチェック
log_info "🔟 ヘルスチェック実行中..."
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

# 11. デプロイ完了情報
echo ""
echo "============================================="
echo "🎉 Git-ベース Rocky Linux 9 デプロイ完了!"
echo "============================================="
echo ""
log_success "5層ハイブリッドLLMシステムが Rocky Linux 9 VM にデプロイされました"
echo ""
echo "📋 デプロイ情報:"
echo "   🐧 OS: Rocky Linux 9"
echo "   🌐 ホスト: $AWS_VM_HOST"
echo "   📁 パス: $DEPLOY_PATH"
echo "   🚀 サービス: llm-orchestrator (systemd)"
echo "   📦 Git: $GIT_REPO_URL ($GIT_BRANCH)"
echo ""
echo "🔗 アクセス URL:"
echo "   • ヘルスチェック: http://$AWS_VM_HOST:4000/health"
echo "   • システム情報: http://$AWS_VM_HOST:4000/info"
echo "   • メトリクス: http://$AWS_VM_HOST:4000/metrics"
echo ""
echo "🛠️ Git-ベース運用コマンド:"
echo "   • 更新デプロイ: $0 -h $AWS_VM_HOST -u $AWS_VM_USER -k $AWS_VM_KEY"
echo "   • サービス状態: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'sudo systemctl status llm-orchestrator'"
echo "   • ログ確認: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'sudo journalctl -u llm-orchestrator -f'"
echo "   • Git ログ: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'cd $DEPLOY_PATH && git log --oneline -10'"
echo ""
echo "⚙️ 次のステップ:"
echo "   1. cd $DEPLOY_PATH && cp .env.production .env"
echo "   2. .env ファイルに API キーを設定"
echo "   3. sudo systemctl restart llm-orchestrator"
echo "   4. ヘルスチェック実行"
echo ""
echo "🔄 更新デプロイ手順:"
echo "   1. ローカルで git push"
echo "   2. このスクリプトを再実行"
echo "   3. 自動的に最新版にアップデート"

log_success "Git-ベース Rocky Linux 9 デプロイスクリプト実行完了"