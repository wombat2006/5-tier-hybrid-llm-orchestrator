#!/bin/bash

# SSL証明書への権限設定を行い、443と80ポートでサーバーを起動するスクリプト

echo "🔧 SSL証明書権限設定中..."

# 証明書ディレクトリへの読み取り権限を設定
sudo chmod 755 /etc/ssl/advsec/
sudo chmod 644 /etc/ssl/advsec/fullchain.crt
sudo chmod 644 /etc/ssl/advsec/www.advsec.co.jp.key

# Rocky ユーザーが SSL 証明書を読み取り可能にする
sudo chown root:rocky /etc/ssl/advsec/www.advsec.co.jp.key
sudo chown root:rocky /etc/ssl/advsec/fullchain.crt

echo "🚀 SSL証明書の権限設定完了"

# PM2を停止
echo "⏹️  既存のPM2プロセスを停止中..."
pm2 stop all
pm2 delete all

# Root権限でポート443と80でアプリケーションを起動
echo "🔐 Root権限で443と80ポートでサーバーを起動中..."
sudo -E PM2_HOME=/home/rocky/.pm2 PATH=/home/rocky/.nvm/versions/node/v20.19.4/bin:$PATH /home/rocky/.nvm/versions/node/v20.19.4/bin/pm2 start dist/index.js --name "llm-orchestrator-ssl" --user rocky

echo "✅ SSL対応サーバーが起動しました"
echo "📡 一般ユーザ向け: https://www.advsec.co.jp:443"
echo "🛡️ 管理者向け: https://www.advsec.co.jp:80/admin"

# 起動確認
echo "🔍 サーバー状態確認中..."
sleep 3
sudo -E PM2_HOME=/home/rocky/.pm2 PATH=/home/rocky/.nvm/versions/node/v20.19.4/bin:$PATH /home/rocky/.nvm/versions/node/v20.19.4/bin/pm2 status