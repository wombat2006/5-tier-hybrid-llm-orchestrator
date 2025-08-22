#!/bin/bash

# AWS VM デプロイスクリプト
# 5層ハイブリッドLLMシステムの本番環境デプロイ自動化

set -e  # エラーで即座に停止

# カラーコード定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 設定変数（実際の値に置き換えてください）
AWS_VM_USER="${AWS_VM_USER:-ubuntu}"
AWS_VM_HOST="${AWS_VM_HOST:-}"
AWS_VM_KEY="${AWS_VM_KEY:-~/.ssh/aws-llm-system.pem}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/llm-orchestrator}"
SERVICE_NAME="llm-orchestrator"
NODE_VERSION="${NODE_VERSION:-20}"

# ログ関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 使用法表示
show_usage() {
    echo "使用法: $0 [OPTIONS]"
    echo ""
    echo "オプション:"
    echo "  -h, --host HOST       AWS VM のホスト名/IP"
    echo "  -u, --user USER       SSH ユーザー名 (デフォルト: ubuntu)"
    echo "  -k, --key KEY         SSH 秘密鍵のパス"
    echo "  -p, --path PATH       デプロイ先パス (デフォルト: /opt/llm-orchestrator)"
    echo "  --help               このヘルプを表示"
    echo ""
    echo "環境変数:"
    echo "  AWS_VM_HOST          VM のホスト名/IP"
    echo "  AWS_VM_USER          SSH ユーザー名"
    echo "  AWS_VM_KEY           SSH 秘密鍵のパス"
    echo "  DEPLOY_PATH          デプロイ先パス"
    echo ""
    echo "例:"
    echo "  $0 -h ec2-xxx.amazonaws.com -u ubuntu -k ~/.ssh/aws-key.pem"
    echo "  AWS_VM_HOST=1.2.3.4 $0"
}

# 引数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host)
            AWS_VM_HOST="$2"
            shift 2
            ;;
        -u|--user)
            AWS_VM_USER="$2"
            shift 2
            ;;
        -k|--key)
            AWS_VM_KEY="$2"
            shift 2
            ;;
        -p|--path)
            DEPLOY_PATH="$2"
            shift 2
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            log_error "不明なオプション: $1"
            show_usage
            exit 1
            ;;
    esac
done

# 必須パラメーター確認
if [ -z "$AWS_VM_HOST" ]; then
    log_error "AWS VM ホストが指定されていません"
    log_info "AWS_VM_HOST環境変数を設定するか、-h オプションを使用してください"
    show_usage
    exit 1
fi

# デプロイ開始
echo "==========================================="
echo "🚀 AWS VM デプロイ開始"
echo "==========================================="
log_info "ホスト: $AWS_VM_USER@$AWS_VM_HOST"
log_info "デプロイ先: $DEPLOY_PATH"
log_info "SSH鍵: $AWS_VM_KEY"
echo ""

# 1. デプロイ準備チェック
log_info "1️⃣ デプロイ準備チェック実行中..."
if ! node deploy/pre-deploy-check.js; then
    log_error "デプロイ準備チェックに失敗しました"
    exit 1
fi
log_success "デプロイ準備チェック完了"

# 2. SSH接続確認
log_info "2️⃣ AWS VM への接続確認中..."
if ! ssh -i "$AWS_VM_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$AWS_VM_USER@$AWS_VM_HOST" "echo 'SSH接続確認OK'" > /dev/null 2>&1; then
    log_error "AWS VM への SSH 接続に失敗しました"
    log_info "確認事項:"
    log_info "  • SSH鍵のパス: $AWS_VM_KEY"
    log_info "  • ホスト名/IP: $AWS_VM_HOST"
    log_info "  • ユーザー名: $AWS_VM_USER"
    log_info "  • セキュリティグループでSSH(22)が許可されているか"
    exit 1
fi
log_success "SSH接続確認完了"

# 3. VM環境準備
log_info "3️⃣ AWS VM 環境準備中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    
    echo "システム更新中..."
    sudo apt update -qq
    
    # Node.js インストール確認/インストール
    if ! command -v node &> /dev/null; then
        echo "Node.js ${NODE_VERSION} インストール中..."
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # PM2 インストール確認/インストール
    if ! command -v pm2 &> /dev/null; then
        echo "PM2 インストール中..."
        sudo npm install -g pm2
    fi
    
    # デプロイディレクトリ準備
    sudo mkdir -p $DEPLOY_PATH
    sudo chown -R $AWS_VM_USER:$AWS_VM_USER $DEPLOY_PATH
    
    echo "VM環境準備完了"
EOF
log_success "VM環境準備完了"

# 4. アプリケーションファイル転送
log_info "4️⃣ アプリケーションファイル転送中..."

# 一時的なデプロイパッケージ作成（不要ファイルを除外）
TEMP_DIR=$(mktemp -d)
log_info "一時ディレクトリ: $TEMP_DIR"

# 必要なファイルのみコピー
cp -r package.json package-lock.json dist src/config "$TEMP_DIR/"
cp README.md .env.example "$TEMP_DIR/" 2>/dev/null || true

# ファイル転送
rsync -avz --delete -e "ssh -i $AWS_VM_KEY" "$TEMP_DIR/" "$AWS_VM_USER@$AWS_VM_HOST:$DEPLOY_PATH/"

# 一時ディレクトリ削除
rm -rf "$TEMP_DIR"

log_success "ファイル転送完了"

# 5. 依存関係インストールとビルド
log_info "5️⃣ 依存関係インストール中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    cd $DEPLOY_PATH
    
    # 本番用依存関係のみインストール
    npm ci --production --silent
    
    echo "依存関係インストール完了"
EOF
log_success "依存関係インストール完了"

# 6. 環境変数設定
log_info "6️⃣ 環境変数設定確認..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    cd $DEPLOY_PATH
    
    if [ ! -f .env ]; then
        echo "⚠️ .env ファイルが見つかりません"
        echo "📝 .env.example を参考に .env ファイルを作成してください"
        echo ""
        echo "必須環境変数:"
        echo "  • OPENAI_API_KEY"
        echo "  • GOOGLE_API_KEY"
        echo "  • ANTHROPIC_API_KEY"
        echo "  • NODE_ENV=production"
        echo "  • PORT=4000"
        echo ""
        if [ -f .env.example ]; then
            echo ".env.example の内容:"
            cat .env.example
        fi
    else
        echo "✅ .env ファイル確認済み"
    fi
EOF

# 7. PM2でサービス起動
log_info "7️⃣ サービス起動中..."
ssh -i "$AWS_VM_KEY" "$AWS_VM_USER@$AWS_VM_HOST" << EOF
    set -e
    cd $DEPLOY_PATH
    
    # 既存プロセス停止
    pm2 delete $SERVICE_NAME 2>/dev/null || true
    
    # サービス起動
    pm2 start dist/index.js --name $SERVICE_NAME
    
    # 自動起動設定
    pm2 startup > /tmp/pm2_startup.sh 2>/dev/null || true
    if [ -f /tmp/pm2_startup.sh ]; then
        sudo bash /tmp/pm2_startup.sh
    fi
    
    # 設定保存
    pm2 save
    
    echo "サービス起動完了"
EOF
log_success "サービス起動完了"

# 8. ヘルスチェック
log_info "8️⃣ ヘルスチェック実行中..."
sleep 5  # サービス起動待機

HEALTH_CHECK_URL="http://$AWS_VM_HOST:4000/health"
if command -v curl &> /dev/null; then
    if curl -s "$HEALTH_CHECK_URL" | grep -q "success"; then
        log_success "ヘルスチェック成功 - サービス正常稼働中"
    else
        log_warning "ヘルスチェックに失敗 - ログを確認してください"
    fi
else
    log_info "curlが利用できません - 手動でヘルスチェックを実行してください"
    log_info "URL: $HEALTH_CHECK_URL"
fi

# 9. デプロイ情報表示
echo ""
echo "==========================================="
echo "🎉 デプロイ完了!"
echo "==========================================="
echo ""
log_success "5層ハイブリッドLLMシステムが AWS VM にデプロイされました"
echo ""
echo "📋 デプロイ情報:"
echo "   🌐 ホスト: $AWS_VM_HOST"
echo "   📁 パス: $DEPLOY_PATH"
echo "   🚀 サービス名: $SERVICE_NAME"
echo ""
echo "🔗 アクセス URL:"
echo "   • ヘルスチェック: http://$AWS_VM_HOST:4000/health"
echo "   • システム情報: http://$AWS_VM_HOST:4000/info"
echo "   • メトリクス: http://$AWS_VM_HOST:4000/metrics"
echo "   • LLM生成: http://$AWS_VM_HOST:4000/generate"
echo ""
echo "🛠️ 管理コマンド:"
echo "   • ログ確認: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'pm2 logs $SERVICE_NAME'"
echo "   • サービス状態: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'pm2 status'"
echo "   • サービス再起動: ssh -i $AWS_VM_KEY $AWS_VM_USER@$AWS_VM_HOST 'pm2 restart $SERVICE_NAME'"
echo ""
echo "⚙️ 次のステップ:"
echo "   1. .envファイルにAPIキーを設定"
echo "   2. セキュリティグループでHTTP(4000)ポートを開放"
echo "   3. ヘルスチェック実行"
echo "   4. 本番テスト実行"
echo ""
echo "🎯 設定が完了したら、以下でテスト実行:"
echo "   curl -X POST http://$AWS_VM_HOST:4000/generate \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"prompt\":\"Hello, test the hybrid system\",\"task_type\":\"general\"}'"

log_success "デプロイスクリプト実行完了"