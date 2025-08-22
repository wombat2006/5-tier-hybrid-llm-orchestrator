#!/bin/bash

# Claude Code 自動設定スクリプト
# ユーザーログイン時に ~/.claude を自動設定

set -e

# カラーコード
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 設定変数
CLAUDE_DIR="$HOME/.claude"
CONFIG_FILE="$CLAUDE_DIR/config.json"
CLAUDE_MD_FILE="$CLAUDE_DIR/CLAUDE.md"
LLM_ORCHESTRATOR_URL="${LLM_ORCHESTRATOR_URL:-http://localhost:4000}"
USER_NAME="${USER:-$(whoami)}"

# ログ関数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Claude Code 自動設定メイン関数
setup_claude_code() {
    log_info "🤖 Claude Code 自動設定開始 (ユーザー: $USER_NAME)"
    
    # 1. ~/.claude ディレクトリ作成
    if [ ! -d "$CLAUDE_DIR" ]; then
        log_info "📁 ~/.claude ディレクトリ作成中..."
        mkdir -p "$CLAUDE_DIR"
        chmod 700 "$CLAUDE_DIR"
        log_success "ディレクトリ作成完了"
    else
        log_info "📁 ~/.claude ディレクトリは既に存在"
    fi

    # 2. config.json 作成
    if [ ! -f "$CONFIG_FILE" ] || [ "$1" == "--force" ]; then
        log_info "⚙️ config.json 設定中..."
        create_config_file
        log_success "config.json 作成完了"
    else
        log_info "⚙️ config.json は既に存在"
    fi

    # 3. CLAUDE.md 作成
    if [ ! -f "$CLAUDE_MD_FILE" ] || [ "$1" == "--force" ]; then
        log_info "📋 CLAUDE.md 設定中..."
        create_claude_md
        log_success "CLAUDE.md 作成完了"
    else
        log_info "📋 CLAUDE.md は既に存在"
    fi

    # 4. 権限設定
    log_info "🔒 セキュリティ権限設定中..."
    chmod 600 "$CONFIG_FILE" 2>/dev/null || true
    chmod 600 "$CLAUDE_MD_FILE" 2>/dev/null || true
    log_success "権限設定完了"

    # 5. 環境変数確認
    log_info "🔧 環境変数確認中..."
    check_environment_variables

    # 6. Claude CLI インストール確認
    log_info "🛠️ Claude CLI 確認中..."
    check_claude_cli

    # 7. 設定完了確認
    if verify_setup; then
        log_success "🎉 Claude Code 自動設定完了！"
        show_quick_start_guide
    else
        log_error "❌ 設定に問題があります"
        return 1
    fi
}

# config.json 作成
create_config_file() {
    cat > "$CONFIG_FILE" << EOF
{
  "version": "1.0",
  "user": "$USER_NAME",
  "environment": "multi-user-production",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "managed_by": "auto-setup-script",
  
  "api_keys": {
    "anthropic": "\${CLAUDE_API_KEY}",
    "openai": "\${OPENAI_API_KEY}",
    "google": "\${GOOGLE_API_KEY}"
  },
  
  "llm_orchestrator": {
    "url": "$LLM_ORCHESTRATOR_URL",
    "enabled": true,
    "default_tier": 1,
    "max_requests_per_hour": 50,
    "daily_cost_limit_usd": 10.0
  },
  
  "security": {
    "api_key_source": "environment",
    "log_requests": true,
    "mask_sensitive_data": true,
    "session_timeout_hours": 8
  },
  
  "preferences": {
    "default_model": "claude-3-5-sonnet",
    "temperature": 0.7,
    "max_tokens": 4000,
    "auto_save": true,
    "language": "ja"
  },
  
  "workspace": {
    "projects_directory": "~/projects",
    "auto_create_gitignore": true,
    "backup_enabled": true,
    "default_gitignore": [".env", "*.log", ".claude/", "node_modules/"]
  },
  
  "cost_management": {
    "track_usage": true,
    "alert_threshold_usd": 5.0,
    "preferred_tiers": [0, 1, 2, 3],
    "auto_optimize": true
  },
  
  "ui_preferences": {
    "show_cost_info": true,
    "show_tier_info": true,
    "compact_mode": false,
    "dark_mode": false
  }
}
EOF
}

# CLAUDE.md 作成
create_claude_md() {
    cat > "$CLAUDE_MD_FILE" << 'EOF'
# Claude Code マルチユーザー環境設定

## 【重要】セキュリティガイドライン

### API キー管理
- 現在は共有APIキーを使用中
- 環境変数から読み込み（直接記載禁止）
- 他ユーザーとの共有厳禁
- 不正使用の即座通報

### 使用量管理
- 日次コスト制限: $10.00
- 時間あたりリクエスト制限: 50回
- 全活動のログ記録・監視

## 5層ハイブリッドシステム利用ガイド

### Tier 0: Qwen3 Coder (推奨: 開発作業)
```
用途: プログラミング、デバッグ、コードレビュー
コスト: $0.05/1K入力トークン ⭐ 最安
キーワード: code, function, debug, script
```

### Tier 1: Gemini Flash (推奨: 一般作業)  
```
用途: 調査、検証、要約、翻訳
コスト: 無料枠利用 ⭐ 無料
キーワード: research, summarize, translate
```

### Tier 2: Claude Sonnet (推奨: 複雑判断)
```
用途: 複雑推論、設計判断、統合
コスト: $3.00/1K入力トークン 💰 高額
キーワード: design, architecture, complex
```

### Tier 3: GPT-4o/Gemini Pro (推奨: 最重要のみ)
```
用途: 戦略的判断、最重要決定
コスト: $2.50/1K入力トークン 💎 プレミアム  
キーワード: strategic, critical, premium
```

## 基本的な使用方法

### Claude CLI
```bash
# 基本的なチャット
claude chat "コードレビューをお願いします"

# ファイルを含めた分析
claude analyze file.py

# 特定のTierを指定
claude --tier 0 "Python関数を作成"
```

### HTTP API経由
```bash
# 一般的な生成
curl -X POST http://localhost:4000/generate \
  -H "Content-Type: application/json" \
  -H "X-User-ID: $USER" \
  -d '{"prompt":"質問内容","task_type":"general"}'

# コーディング専用
curl -X POST http://localhost:4000/code \
  -H "Content-Type: application/json" \
  -H "X-User-ID: $USER" \
  -d '{"task":"Python関数作成","language":"python"}'
```

## プロジェクト管理

### 推奨ディレクトリ構造
```
~/projects/
├── project1/
│   ├── .claude/          # プロジェクト固有設定
│   ├── .env.example      # 環境変数テンプレート
│   ├── .gitignore        # 自動生成
│   └── src/
├── project2/
└── shared-resources/
```

### プロジェクト開始手順
```bash
cd ~/projects
mkdir my-new-project
cd my-new-project
claude init  # プロジェクト初期化
```

## コスト最適化のコツ

1. **適切なTier選択**: コーディング → Tier 0, 調査 → Tier 1
2. **プロンプト最適化**: 簡潔で明確な指示
3. **バッチ処理**: 関連する質問をまとめて
4. **結果の再利用**: 類似タスクは過去結果を参考

## トラブルシューティング

### よくあるエラーと対処法
```bash
# 権限エラー
chmod 700 ~/.claude
chmod 600 ~/.claude/config.json

# API接続エラー  
echo $CLAUDE_API_KEY | head -c 10  # キー確認
curl -I http://localhost:4000/health  # 接続確認

# Node.js/npm エラー
source ~/.bashrc  # 環境再読み込み
nvm use 20        # Node.js バージョン確認
```

## 緊急連絡先

- **技術サポート**: tech-support@company.com
- **セキュリティ報告**: security@company.com  
- **システム管理者**: system-admin@company.com

---

**最終更新**: 自動設定スクリプトによる生成
**環境**: Rocky Linux 9 マルチユーザー本番環境
EOF

    # ユーザー名を実際の値に置換
    sed -i "s/\$USER/$USER_NAME/g" "$CLAUDE_MD_FILE"
}

# 環境変数確認
check_environment_variables() {
    local missing_vars=()
    
    if [ -z "$CLAUDE_API_KEY" ]; then
        missing_vars+=("CLAUDE_API_KEY")
    fi
    
    if [ -z "$OPENAI_API_KEY" ]; then
        missing_vars+=("OPENAI_API_KEY")
    fi
    
    if [ -z "$GOOGLE_API_KEY" ]; then
        missing_vars+=("GOOGLE_API_KEY")
    fi
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_warning "未設定の環境変数: ${missing_vars[*]}"
        log_warning "~/.bashrc に以下を追加してください:"
        for var in "${missing_vars[@]}"; do
            echo "export $var=\"your-api-key-here\""
        done
    else
        log_success "必要な環境変数は設定済み"
    fi
}

# Claude CLI 確認
check_claude_cli() {
    # NVM環境読み込み
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    if command -v claude >/dev/null 2>&1; then
        log_success "Claude CLI: インストール済み"
        claude --version 2>/dev/null || log_info "バージョン確認不可"
    elif command -v claude-cli >/dev/null 2>&1; then
        log_success "Claude CLI (claude-cli): インストール済み" 
        claude-cli --version 2>/dev/null || log_info "バージョン確認不可"
    else
        log_warning "Claude CLI: 未インストール"
        log_info "インストール方法: npm install -g @anthropic-ai/claude-cli"
    fi
}

# 設定検証
verify_setup() {
    local success=true
    
    # ディレクトリ確認
    if [ ! -d "$CLAUDE_DIR" ]; then
        log_error "~/.claude ディレクトリが存在しません"
        success=false
    fi
    
    # 設定ファイル確認
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "config.json が存在しません"
        success=false
    fi
    
    # 権限確認
    if [ "$(stat -c %a "$CLAUDE_DIR" 2>/dev/null)" != "700" ]; then
        log_warning "~/.claude ディレクトリの権限が不適切です"
    fi
    
    # JSON構文確認（jqが利用可能な場合）
    if command -v jq >/dev/null 2>&1; then
        if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
            log_error "config.json の構文が不正です"
            success=false
        fi
    fi
    
    return $([ "$success" = true ])
}

# クイックスタートガイド表示
show_quick_start_guide() {
    echo ""
    echo -e "${GREEN}🚀 Claude Code クイックスタート${NC}"
    echo "========================================="
    echo -e "• システム状態確認: ${YELLOW}llm-status${NC}"
    echo -e "• システム情報取得: ${YELLOW}llm-info${NC}"
    echo -e "• Claude Code起動: ${YELLOW}claude${NC}"
    echo -e "• 設定確認: ${YELLOW}cat ~/.claude/config.json${NC}"
    echo -e "• 使用説明書: ${YELLOW}cat ~/.claude/CLAUDE.md${NC}"
    echo ""
    echo -e "${BLUE}💡 プロジェクト開始:${NC}"
    echo "cd ~/projects && mkdir my-project && cd my-project"
    echo ""
    echo -e "${YELLOW}⚠️  重要: API キー設定を確認してください${NC}"
    echo "source ~/.bashrc  # 環境変数再読み込み"
}

# メイン処理
main() {
    case "$1" in
        --help|-h)
            echo "Claude Code 自動設定スクリプト"
            echo ""
            echo "使用法:"
            echo "  $0 [OPTIONS]"
            echo ""
            echo "オプション:"
            echo "  --force    既存ファイルを上書き"
            echo "  --verify   設定のみ確認"
            echo "  --help     このヘルプを表示"
            ;;
        --verify)
            log_info "Claude Code 設定確認中..."
            if verify_setup; then
                log_success "設定に問題ありません"
            else
                log_error "設定に問題があります"
                exit 1
            fi
            ;;
        *)
            setup_claude_code "$@"
            ;;
    esac
}

# スクリプト実行（source されていない場合）
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi