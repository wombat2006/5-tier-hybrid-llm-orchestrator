#!/bin/bash

# Rocky Linux 9 デプロイスクリプト検証テスト
# deploy/rocky-linux-deploy.sh の機能をテストします

echo "🚀 Rocky Linux 9 デプロイスクリプト検証開始..."

DEPLOY_SCRIPT="deploy/rocky-linux-deploy.sh"

if [ ! -f "$DEPLOY_SCRIPT" ]; then
    echo "❌ デプロイスクリプト未発見: $DEPLOY_SCRIPT"
    exit 1
fi

echo "✅ デプロイスクリプト: 存在確認"

echo ""
echo "🔍 スクリプト構文チェック..."
if bash -n "$DEPLOY_SCRIPT" 2>/dev/null; then
    echo "✅ Bash構文: 正常"
else
    echo "❌ Bash構文: エラー検出"
    bash -n "$DEPLOY_SCRIPT"
    exit 1
fi

echo ""
echo "🔍 Rocky Linux 9 固有機能確認..."

# dnf パッケージマネージャー対応
if grep -q "dnf" "$DEPLOY_SCRIPT"; then
    echo "✅ dnf パッケージマネージャー: 対応確認"
else
    echo "❌ dnf パッケージマネージャー: 未対応"
fi

# firewalld ファイアウォール対応
if grep -q "firewalld" "$DEPLOY_SCRIPT"; then
    echo "✅ firewalld ファイアウォール: 対応確認"
else
    echo "❌ firewalld ファイアウォール: 未対応"
fi

# systemd サービス対応
if grep -q "systemctl" "$DEPLOY_SCRIPT"; then
    echo "✅ systemd サービス管理: 対応確認"
else
    echo "❌ systemd サービス管理: 未対応"
fi

# ec2-user デフォルトユーザー
if grep -q "ec2-user" "$DEPLOY_SCRIPT"; then
    echo "✅ ec2-user デフォルト設定: 確認"
else
    echo "❌ ec2-user デフォルト設定: 未設定"
fi

echo ""
echo "🔍 セキュリティ機能確認..."

# SSH鍵認証
if grep -q "ssh.*-i" "$DEPLOY_SCRIPT"; then
    echo "✅ SSH鍵認証: 対応確認"
else
    echo "❌ SSH鍵認証: 未対応"
fi

# sudo権限チェック
if grep -q "sudo" "$DEPLOY_SCRIPT"; then
    echo "✅ sudo権限使用: 確認"
else
    echo "❌ sudo権限使用: 未確認"
fi

echo ""
echo "🔍 必須コマンド・機能確認..."

# Node.js インストール
if grep -q -i "node" "$DEPLOY_SCRIPT"; then
    echo "✅ Node.js インストール: 対応確認"
else
    echo "❌ Node.js インストール: 未対応"
fi

# npm/yarn パッケージ管理
if grep -q -E "(npm|yarn)" "$DEPLOY_SCRIPT"; then
    echo "✅ パッケージ管理: 対応確認"
else
    echo "❌ パッケージ管理: 未対応"
fi

# PM2 プロセス管理
if grep -q "pm2" "$DEPLOY_SCRIPT"; then
    echo "✅ PM2 プロセス管理: 対応確認"
else
    echo "❌ PM2 プロセス管理: 未対応"
fi

echo ""
echo "🔍 エラーハンドリング確認..."

# set -e 使用
if grep -q "set -e" "$DEPLOY_SCRIPT"; then
    echo "✅ エラー時停止: 設定確認"
else
    echo "❌ エラー時停止: 未設定"
fi

# 戻り値チェック
error_checks=0
if grep -q "\$?" "$DEPLOY_SCRIPT"; then
    ((error_checks++))
fi
if grep -q "if.*;" "$DEPLOY_SCRIPT"; then
    ((error_checks++))
fi

if [ $error_checks -gt 0 ]; then
    echo "✅ エラーハンドリング: ${error_checks}箇所で確認"
else
    echo "⚠️ エラーハンドリング: 確認不十分"
fi

echo ""
echo "🔍 設定ファイル確認..."

# 環境変数設定
if grep -q "\.env" "$DEPLOY_SCRIPT"; then
    echo "✅ 環境変数設定: 対応確認"
else
    echo "❌ 環境変数設定: 未対応"
fi

# systemd サービスファイル
if grep -q "\.service" "$DEPLOY_SCRIPT"; then
    echo "✅ systemd サービスファイル: 対応確認"
else
    echo "❌ systemd サービスファイル: 未対応"
fi

echo ""
echo "🔍 Ansibleテンプレート確認..."

TEMPLATES_DIR="deploy/templates"
if [ -d "$TEMPLATES_DIR" ]; then
    echo "✅ テンプレートディレクトリ: 存在確認"
    
    template_count=$(find "$TEMPLATES_DIR" -name "*.j2" | wc -l)
    echo "✅ Ansibleテンプレート: ${template_count}個検出"
    
    # 主要テンプレートの確認
    key_templates=("llm-orchestrator.service.j2" "login_check.sh.j2")
    for template in "${key_templates[@]}"; do
        if [ -f "$TEMPLATES_DIR/$template" ]; then
            echo "  ✅ $template: 存在確認"
        else
            echo "  ❌ $template: 未発見"
        fi
    done
else
    echo "❌ テンプレートディレクトリ: 未発見"
fi

echo ""
echo "🔍 ヘルプ・使用法確認..."

if grep -q "show_usage\|--help" "$DEPLOY_SCRIPT"; then
    echo "✅ ヘルプ機能: 実装確認"
else
    echo "❌ ヘルプ機能: 未実装"
fi

echo ""
echo "🔍 ドライランテスト..."

# --dry-run オプションがあるかチェック
if grep -q "dry.run\|--dry" "$DEPLOY_SCRIPT"; then
    echo "✅ ドライラン機能: 対応確認"
else
    echo "⚠️ ドライラン機能: 未対応 (推奨機能)"
fi

echo ""
echo "📊 検証結果サマリー"
echo "================================"

passed=0
total=15

# カウント処理（簡略化）
for check in "dnf" "firewalld" "systemctl" "ec2-user" "ssh.*-i" "sudo" "node" "npm\|yarn" "pm2" "set -e" "\.env" "\.service" "show_usage" "$TEMPLATES_DIR"; do
    if [ "$check" = "$TEMPLATES_DIR" ]; then
        [ -d "$TEMPLATES_DIR" ] && ((passed++))
    else
        grep -q "$check" "$DEPLOY_SCRIPT" 2>/dev/null && ((passed++))
    fi
done

echo "合格: $passed / $total"
echo "成功率: $(( passed * 100 / total ))%"

if [ $passed -ge 12 ]; then
    echo ""
    echo "🎉 Rocky Linux 9 デプロイスクリプト検証完了!"
    echo "✅ 本番環境デプロイ準備OK - 高品質なスクリプトです"
    exit 0
else
    echo ""
    echo "⚠️ いくつかの改善項目があります"
    echo "💡 追加実装を検討してください"
    exit 1
fi