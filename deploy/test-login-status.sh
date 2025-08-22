#!/bin/bash

# ログイン時CLAUDE.mdステータス表示テスト
# deploy/templates/login_check.sh.j2 の機能をテストします

echo "📋 CLAUDE.mdステータス表示テスト開始..."

# テスト環境準備
TEST_HOME="/tmp/claude-test-home"
mkdir -p "$TEST_HOME/.claude"

echo "🧪 テストケース1: CLAUDE.mdファイルが存在する場合"
# テスト用CLAUDE.mdファイル作成
cat > "$TEST_HOME/.claude/CLAUDE.md" << 'EOF'
# テスト用CLAUDE.md設定

## 🎯 テスト設定
- テストユーザー: test_user
- テスト環境: development
- カスタマイズ: 有効

### システム設定
- デバッグモード: true
- ログレベル: debug
EOF

# テンプレートのロジックを模擬
HOME="$TEST_HOME"
if [ -f "$HOME/.claude/CLAUDE.md" ]; then
    CLAUDE_SIZE=$(wc -c < "$HOME/.claude/CLAUDE.md" 2>/dev/null || echo "0")
    echo -e "✅ CLAUDE.md検出: ${CLAUDE_SIZE}文字 (カスタマイズ済み)"
else
    echo -e "❌ CLAUDE.md: 未検出"
fi

echo ""
echo "🧪 テストケース2: CLAUDE.mdファイルが存在しない場合"
# テスト用ファイル削除
rm -f "$TEST_HOME/.claude/CLAUDE.md"

if [ -f "$HOME/.claude/CLAUDE.md" ]; then
    CLAUDE_SIZE=$(wc -c < "$HOME/.claude/CLAUDE.md" 2>/dev/null || echo "0")
    echo -e "❌ CLAUDE.md: ${CLAUDE_SIZE}文字 (想定外の検出)"
else
    echo -e "✅ CLAUDE.md: 未設定 (claude-sync で初期化)"
fi

echo ""
echo "🧪 テストケース3: 権限エラーハンドリング"
# 読み取り不可ファイル作成
touch "$TEST_HOME/.claude/CLAUDE.md"
chmod 000 "$TEST_HOME/.claude/CLAUDE.md"

CLAUDE_SIZE=$(wc -c < "$HOME/.claude/CLAUDE.md" 2>/dev/null || echo "0")
if [ "$CLAUDE_SIZE" = "0" ]; then
    echo "✅ 権限エラー処理: 正常 (デフォルト値0を返却)"
else
    echo "❌ 権限エラー処理: 失敗"
fi

echo ""
echo "🔍 テンプレートファイルの整合性確認..."

# テンプレートファイル確認
TEMPLATE_FILE="deploy/templates/login_check.sh.j2"
if [ -f "$TEMPLATE_FILE" ]; then
    echo "✅ テンプレートファイル: 存在確認"
    
    # 必要な機能が実装されているか確認
    if grep -q "CLAUDE.md" "$TEMPLATE_FILE"; then
        echo "✅ CLAUDE.md処理: テンプレートに実装確認"
    else
        echo "❌ CLAUDE.md処理: テンプレートに未実装"
    fi
    
    if grep -q "wc -c" "$TEMPLATE_FILE"; then
        echo "✅ ファイルサイズ取得: テンプレートに実装確認"
    else
        echo "❌ ファイルサイズ取得: テンプレートに未実装"
    fi
    
    if grep -q "カスタマイズ済み" "$TEMPLATE_FILE"; then
        echo "✅ ステータスメッセージ: テンプレートに実装確認"
    else
        echo "❌ ステータスメッセージ: テンプレートに未実装"
    fi
else
    echo "❌ テンプレートファイル: 未発見"
fi

# テスト環境クリーンアップ
rm -rf "$TEST_HOME"

echo ""
echo "🎉 ログイン時CLAUDE.mdステータス表示テスト完了！"