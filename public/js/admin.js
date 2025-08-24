// Admin Panel JavaScript

class AdminPanelApp {
    constructor() {
        this.authenticated = false;
        this.refreshInterval = null;
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupEventListeners();
        this.showAuthModal();
    }

    checkAuthentication() {
        // セッションストレージから認証状態をチェック
        const authToken = sessionStorage.getItem('admin_token');
        if (authToken) {
            this.authenticated = true;
            this.hideAuthModal();
            this.startDataRefresh();
        }
    }

    showAuthModal() {
        if (!this.authenticated) {
            const authModal = new bootstrap.Modal(document.getElementById('authModal'));
            authModal.show();
        }
    }

    hideAuthModal() {
        const authModal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
        if (authModal) {
            authModal.hide();
        }
    }

    setupEventListeners() {
        // 認証フォーム
        document.getElementById('auth-form').addEventListener('submit', (e) => {
            this.handleAuthentication(e);
        });

        // ログアウト
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // タブ切り替え
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.setActiveTab(e.target.id);
            });
        });

        // クイックアクション
        document.getElementById('emergency-stop-btn').addEventListener('click', () => {
            this.emergencyStop();
        });

        document.getElementById('restart-services-btn').addEventListener('click', () => {
            this.restartServices();
        });

        document.getElementById('backup-system-btn').addEventListener('click', () => {
            this.backupSystem();
        });

        // ログ関連
        document.getElementById('log-filter').addEventListener('change', () => {
            this.filterLogs();
        });

        document.getElementById('export-logs-btn').addEventListener('click', () => {
            this.exportLogs();
        });
    }

    async handleAuthentication(e) {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;

        try {
            const response = await fetch('/admin/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                const result = await response.json();
                sessionStorage.setItem('admin_token', result.token);
                this.authenticated = true;
                this.hideAuthModal();
                this.startDataRefresh();
                this.showAlert('認証成功', 'success');
            } else {
                this.showAlert('認証に失敗しました', 'danger');
                document.getElementById('admin-password').value = '';
            }
        } catch (error) {
            console.error('認証エラー:', error);
            this.showAlert('認証エラーが発生しました', 'danger');
        }
    }

    logout() {
        sessionStorage.removeItem('admin_token');
        this.authenticated = false;
        this.stopDataRefresh();
        this.showAuthModal();
        this.showAlert('ログアウトしました', 'info');
    }

    setActiveTab(activeTabId) {
        // タブのアクティブ状態を更新
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(activeTabId).classList.add('active');

        // パネルの表示を更新
        document.querySelectorAll('.admin-panel').forEach(panel => {
            panel.style.display = 'none';
        });

        const panelMap = {
            'system-overview-tab': 'system-overview-panel',
            'user-sessions-tab': 'user-sessions-panel',
            'troubleshooting-logs-tab': 'troubleshooting-logs-panel',
            'model-performance-tab': 'model-performance-panel',
            'security-settings-tab': 'security-settings-panel',
            'system-maintenance-tab': 'system-maintenance-panel'
        };

        const targetPanel = panelMap[activeTabId];
        if (targetPanel) {
            const panelElement = document.getElementById(targetPanel);
            if (panelElement) {
                panelElement.style.display = 'block';
                
                // 特定のパネルの場合はデータを更新
                switch (activeTabId) {
                    case 'user-sessions-tab':
                        this.loadUserSessions();
                        break;
                    case 'troubleshooting-logs-tab':
                        this.loadTroubleshootingLogs();
                        break;
                }
            }
        }
    }

    startDataRefresh() {
        // 初回データ読み込み
        this.loadSystemOverview();

        // 5秒間隔でデータを更新
        this.refreshInterval = setInterval(() => {
            this.loadSystemOverview();
        }, 5000);
    }

    stopDataRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    async loadSystemOverview() {
        if (!this.authenticated) return;

        try {
            const [healthResponse, metricsResponse] = await Promise.all([
                fetch('/health', {
                    headers: {
                        'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                    }
                }),
                fetch('/metrics', {
                    headers: {
                        'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                    }
                })
            ]);

            const healthData = await healthResponse.json();
            const metricsData = await metricsResponse.json();

            this.updateSystemMetrics(healthData, metricsData);
            this.updateSystemResources();

        } catch (error) {
            console.error('システム概要の更新エラー:', error);
        }
    }

    updateSystemMetrics(healthData, metricsData) {
        // 総リクエスト数
        const totalRequests = metricsData.requests?.total || 0;
        document.getElementById('total-requests').textContent = totalRequests.toLocaleString();

        // アクティブセッション（推定値）
        const activeSessions = Math.floor(Math.random() * 50) + 10; // デモ用
        document.getElementById('active-sessions').textContent = activeSessions;

        // エラー率
        const errorRate = metricsData.requests 
            ? (((metricsData.requests.total - metricsData.requests.successful) / metricsData.requests.total) * 100).toFixed(1)
            : '0.0';
        document.getElementById('error-rate').textContent = `${errorRate}%`;

        // 平均応答時間
        const avgResponseTime = metricsData.performance?.average_response_time || 0;
        document.getElementById('avg-response-time').textContent = `${avgResponseTime}ms`;
    }

    updateSystemResources() {
        // デモンストレーション用のランダムな値を生成
        const cpuUsage = Math.floor(Math.random() * 60) + 10;
        const memoryUsage = Math.floor(Math.random() * 70) + 20;
        const diskUsage = Math.floor(Math.random() * 40) + 30;

        // プログレスバーを更新
        this.updateProgressBar('cpu-usage', cpuUsage);
        this.updateProgressBar('memory-usage', memoryUsage);
        this.updateProgressBar('disk-usage', diskUsage);
    }

    updateProgressBar(elementId, percentage) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.width = `${percentage}%`;
            element.setAttribute('aria-valuenow', percentage);
            
            // 色を使用率に応じて変更
            element.className = 'progress-bar';
            if (percentage > 80) {
                element.classList.add('bg-danger');
            } else if (percentage > 60) {
                element.classList.add('bg-warning');
            } else {
                element.classList.add('bg-success');
            }
        }
    }

    async loadUserSessions() {
        if (!this.authenticated) return;

        try {
            const response = await fetch('/admin/sessions', {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                }
            });

            if (response.ok) {
                const sessions = await response.json();
                this.displayUserSessions(sessions);
            } else {
                throw new Error('セッション情報の取得に失敗');
            }
        } catch (error) {
            console.error('ユーザセッション読み込みエラー:', error);
            document.getElementById('sessions-tbody').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger">
                        セッション情報の読み込みに失敗しました
                    </td>
                </tr>
            `;
        }
    }

    displayUserSessions(sessions) {
        const tbody = document.getElementById('sessions-tbody');
        
        if (sessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        アクティブなセッションがありません
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sessions.map(session => `
            <tr>
                <td><code>${session.id}</code></td>
                <td>${session.ip_address}</td>
                <td>${new Date(session.created_at).toLocaleString()}</td>
                <td>${new Date(session.last_activity).toLocaleString()}</td>
                <td>
                    <span class="badge bg-${session.status === 'active' ? 'success' : 'warning'}">
                        ${session.status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-outline-danger btn-sm" 
                            onclick="adminApp.terminateSession('${session.id}')">
                        <i class="fas fa-times"></i> 終了
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async loadTroubleshootingLogs() {
        if (!this.authenticated) return;

        const logDisplay = document.getElementById('troubleshooting-log-display');
        
        try {
            const response = await fetch('/admin/troubleshooting-logs', {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                }
            });

            if (response.ok) {
                const logs = await response.json();
                this.displayTroubleshootingLogs(logs);
            } else {
                throw new Error('ログの取得に失敗');
            }
        } catch (error) {
            console.error('トラブルシューティングログ読み込みエラー:', error);
            logDisplay.innerHTML = `
                <div class="text-center text-danger p-4">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ログの読み込みに失敗しました
                </div>
            `;
        }
    }

    displayTroubleshootingLogs(logs) {
        const logDisplay = document.getElementById('troubleshooting-log-display');
        
        if (logs.length === 0) {
            logDisplay.innerHTML = `
                <div class="text-center text-muted p-4">
                    トラブルシューティングログがありません
                </div>
            `;
            return;
        }

        logDisplay.innerHTML = logs.map(log => `
            <div class="log-entry ${log.severity}">
                <div class="log-header">
                    <strong>[${log.timestamp}]</strong> 
                    <span class="badge bg-${this.getSeverityColor(log.severity)}">${log.severity.toUpperCase()}</span>
                    <span class="ms-2">${log.session_id}</span>
                </div>
                <div class="log-content">
                    <strong>Problem:</strong> ${log.problem_description}<br>
                    <strong>Resolution:</strong> ${log.resolution_status}<br>
                    <strong>Actions:</strong> ${log.actions_taken.join(', ')}
                </div>
            </div>
        `).join('');
    }

    getSeverityColor(severity) {
        const colorMap = {
            'critical': 'danger',
            'high': 'warning', 
            'medium': 'info',
            'low': 'success'
        };
        return colorMap[severity] || 'secondary';
    }

    async emergencyStop() {
        if (!confirm('緊急停止を実行しますか？この操作により全サービスが停止されます。')) {
            return;
        }

        try {
            const response = await fetch('/admin/emergency-stop', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                }
            });

            if (response.ok) {
                this.showAlert('緊急停止が実行されました', 'warning');
            } else {
                throw new Error('緊急停止の実行に失敗');
            }
        } catch (error) {
            console.error('緊急停止エラー:', error);
            this.showAlert('緊急停止の実行に失敗しました', 'danger');
        }
    }

    async restartServices() {
        if (!confirm('サービスを再起動しますか？')) {
            return;
        }

        try {
            const response = await fetch('/admin/restart-services', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                }
            });

            if (response.ok) {
                this.showAlert('サービスの再起動を開始しました', 'info');
            } else {
                throw new Error('サービス再起動の実行に失敗');
            }
        } catch (error) {
            console.error('サービス再起動エラー:', error);
            this.showAlert('サービス再起動の実行に失敗しました', 'danger');
        }
    }

    async backupSystem() {
        try {
            const response = await fetch('/admin/backup', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                }
            });

            if (response.ok) {
                this.showAlert('システムバックアップを開始しました', 'success');
            } else {
                throw new Error('バックアップの実行に失敗');
            }
        } catch (error) {
            console.error('バックアップエラー:', error);
            this.showAlert('バックアップの実行に失敗しました', 'danger');
        }
    }

    filterLogs() {
        const filter = document.getElementById('log-filter').value;
        const logEntries = document.querySelectorAll('.log-entry');

        logEntries.forEach(entry => {
            if (filter === 'all' || entry.classList.contains(filter)) {
                entry.style.display = 'block';
            } else {
                entry.style.display = 'none';
            }
        });
    }

    async exportLogs() {
        try {
            const response = await fetch('/admin/export-logs', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `troubleshooting_logs_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.showAlert('ログをエクスポートしました', 'success');
            } else {
                throw new Error('ログエクスポートに失敗');
            }
        } catch (error) {
            console.error('ログエクスポートエラー:', error);
            this.showAlert('ログエクスポートに失敗しました', 'danger');
        }
    }

    async terminateSession(sessionId) {
        if (!confirm(`セッション ${sessionId} を終了しますか？`)) {
            return;
        }

        try {
            const response = await fetch(`/admin/sessions/${sessionId}/terminate`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                }
            });

            if (response.ok) {
                this.showAlert('セッションを終了しました', 'success');
                this.loadUserSessions(); // セッション一覧を再読み込み
            } else {
                throw new Error('セッション終了に失敗');
            }
        } catch (error) {
            console.error('セッション終了エラー:', error);
            this.showAlert('セッション終了に失敗しました', 'danger');
        }
    }

    showAlert(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);

        // 5秒後に自動削除
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// アプリケーション初期化
const adminApp = new AdminPanelApp();

// グローバルに公開
window.adminApp = adminApp;