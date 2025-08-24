// IT Troubleshooting System Web Interface

class ITTroubleshootingApp {
    constructor() {
        this.currentSession = null;
        this.chatMessages = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSystemInfo();
        this.setActiveTab('log-analysis-tab');
    }

    setupEventListeners() {
        // タブ切り替え
        document.querySelectorAll('[id$="-tab"]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.setActiveTab(e.target.id);
            });
        });

        // ログ解析
        document.getElementById('analyze-logs-btn').addEventListener('click', () => {
            this.analyzeLog();
        });

        // チャット送信
        document.getElementById('send-chat-btn').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // コマンド安全性評価
        document.getElementById('assess-command-btn').addEventListener('click', () => {
            this.assessCommandSafety();
        });
    }

    setActiveTab(activeTabId) {
        // タブのアクティブ状態を更新
        document.querySelectorAll('[id$="-tab"]').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(activeTabId).classList.add('active');

        // パネルの表示を更新
        document.querySelectorAll('.content-panel').forEach(panel => {
            panel.style.display = 'none';
        });

        const panelMap = {
            'log-analysis-tab': 'log-analysis-panel',
            'interactive-troubleshoot-tab': 'interactive-troubleshoot-panel',
            'safe-execution-tab': 'safe-execution-panel',
            'system-status-tab': 'system-status-panel'
        };

        const targetPanel = panelMap[activeTabId];
        if (targetPanel) {
            document.getElementById(targetPanel).style.display = 'block';
            
            // システム状態タブの場合は最新データを読み込み
            if (activeTabId === 'system-status-tab') {
                this.loadHealthStatus();
                this.loadMetrics();
            }
        }
    }

    async loadSystemInfo() {
        try {
            const response = await fetch('/info');
            const data = await response.json();
            
            const systemInfo = document.getElementById('system-info');
            systemInfo.innerHTML = `
                <div class="info-item">
                    <span class="status-indicator status-healthy"></span>
                    <strong>システム:</strong> ${data.name}
                </div>
                <div class="info-item">
                    <small class="text-muted">Version: ${data.version}</small>
                </div>
                <div class="info-item">
                    <small class="text-muted">Uptime: ${this.formatUptime(data.uptime)}</small>
                </div>
                <div class="info-item">
                    <small class="text-muted">Memory: ${(data.memory_usage / 1024 / 1024).toFixed(1)}MB</small>
                </div>
            `;
        } catch (error) {
            console.error('システム情報の取得に失敗:', error);
            document.getElementById('system-info').innerHTML = `
                <div class="text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    システム情報の取得に失敗しました
                </div>
            `;
        }
    }

    async analyzeLog() {
        const logInput = document.getElementById('log-input').value;
        const contextInput = document.getElementById('context-input').value;
        const resultDiv = document.getElementById('log-analysis-result');

        if (!logInput.trim()) {
            this.showAlert('ログデータを入力してください', 'warning');
            return;
        }

        // ローディング状態を表示
        resultDiv.innerHTML = `
            <div class="d-flex justify-content-center align-items-center p-4">
                <div class="spinner-border text-success me-3" role="status"></div>
                <span>ログを解析中...</span>
            </div>
        `;

        try {
            const response = await fetch('/troubleshoot/analyze-advanced', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    raw_logs: logInput,
                    context: {
                        description: contextInput || 'ユーザ提供ログの解析',
                        system_type: 'unknown',
                        urgency: 'medium'
                    }
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.displayLogAnalysisResult(result);
            } else {
                throw new Error(result.error || 'ログ解析に失敗しました');
            }
        } catch (error) {
            console.error('ログ解析エラー:', error);
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ${error.message}
                </div>
            `;
        }
    }

    displayLogAnalysisResult(result) {
        const resultDiv = document.getElementById('log-analysis-result');
        const diagnosis = result.diagnosis;

        let html = `
            <div class="analysis-result">
                <div class="mb-3">
                    <h6><i class="fas fa-search me-2"></i>解析結果概要</h6>
                    <div class="severity-${diagnosis.severity_level}">
                        重要度: ${diagnosis.severity_level.toUpperCase()}
                    </div>
                    <div>検出されたエラー: ${diagnosis.identified_errors.length}件</div>
                </div>
        `;

        if (diagnosis.identified_errors.length > 0) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-bug me-2"></i>検出されたエラー</h6>
                    <ul class="list-unstyled">
            `;
            diagnosis.identified_errors.forEach(error => {
                html += `
                    <li class="mb-2">
                        <span class="severity-${error.severity}">[${error.category}]</span>
                        <strong>${error.error_type}</strong><br>
                        <small class="text-muted">${error.description}</small>
                    </li>
                `;
            });
            html += `</ul></div>`;
        }

        if (diagnosis.root_cause_analysis.primary_hypothesis) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-lightbulb me-2"></i>根本原因分析</h6>
                    <div class="code-block">${diagnosis.root_cause_analysis.primary_hypothesis}</div>
                </div>
            `;
        }

        if (diagnosis.resolution_strategy.recommended_actions.length > 0) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-tools me-2"></i>推奨アクション</h6>
                    <ol>
            `;
            diagnosis.resolution_strategy.recommended_actions.forEach(action => {
                html += `<li>${action}</li>`;
            });
            html += `</ol></div>`;
        }

        html += `</div>`;
        resultDiv.innerHTML = html;
    }

    async sendChatMessage() {
        const chatInput = document.getElementById('chat-input');
        const message = chatInput.value.trim();

        if (!message) return;

        // メッセージを表示
        this.addChatMessage(message, 'user');
        chatInput.value = '';

        // ローディングメッセージを表示
        const loadingId = this.addChatMessage('回答を準備中...', 'system', true);

        try {
            let response;
            if (!this.currentSession) {
                // 新しいセッションを開始
                response = await fetch('/troubleshoot/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        problem_description: message
                    })
                });
            } else {
                // 既存セッションに回答を送信
                response = await fetch('/troubleshoot/respond', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        session_id: this.currentSession.session_id,
                        user_response: message
                    })
                });
            }

            const result = await response.json();

            // ローディングメッセージを削除
            this.removeChatMessage(loadingId);

            if (response.ok) {
                // システムからの返答を表示
                this.addChatMessage(result.message, 'system');
                
                // セッション情報を更新
                if (result.session_id) {
                    this.currentSession = {
                        session_id: result.session_id,
                        status: result.status || 'active'
                    };
                    this.updateSessionInfo();
                }
            } else {
                throw new Error(result.error || '通信エラーが発生しました');
            }
        } catch (error) {
            console.error('チャットエラー:', error);
            this.removeChatMessage(loadingId);
            this.addChatMessage(`エラー: ${error.message}`, 'system');
        }
    }

    addChatMessage(text, sender, isLoading = false) {
        const chatContainer = document.getElementById('chat-container');
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        messageDiv.id = messageId;
        
        messageDiv.innerHTML = `
            <div class="message-bubble ${sender}">
                ${isLoading ? '<i class="fas fa-spinner fa-spin me-2"></i>' : ''}
                ${text}
            </div>
            <div class="message-timestamp">
                ${new Date().toLocaleTimeString()}
            </div>
        `;

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        return messageId;
    }

    removeChatMessage(messageId) {
        const messageElement = document.getElementById(messageId);
        if (messageElement) {
            messageElement.remove();
        }
    }

    updateSessionInfo() {
        const sessionInfo = document.getElementById('session-info');
        if (this.currentSession) {
            sessionInfo.innerHTML = `
                <div class="info-item">
                    <span class="info-label">セッションID:</span><br>
                    <small class="text-monospace">${this.currentSession.session_id}</small>
                </div>
                <div class="info-item">
                    <span class="info-label">ステータス:</span>
                    ${this.currentSession.status}
                </div>
                <div class="info-item">
                    <span class="info-label">メッセージ数:</span>
                    ${this.chatMessages.length}
                </div>
                <button class="btn btn-sm btn-outline-secondary mt-2" onclick="app.resetSession()">
                    <i class="fas fa-refresh me-1"></i>セッションリセット
                </button>
            `;
        }
    }

    resetSession() {
        this.currentSession = null;
        this.chatMessages = [];
        document.getElementById('chat-container').innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-robot me-2"></i>
                問題を詳しく教えてください。対話的に解決策を見つけていきましょう。
            </div>
        `;
        document.getElementById('session-info').innerHTML = `
            <small class="text-muted">セッションが開始されていません</small>
        `;
    }

    async assessCommandSafety() {
        const commandInput = document.getElementById('command-input').value;
        const contextInput = document.getElementById('execution-context').value;
        const resultDiv = document.getElementById('safety-assessment-result');

        if (!commandInput.trim()) {
            this.showAlert('コマンドを入力してください', 'warning');
            return;
        }

        // ローディング状態を表示
        resultDiv.innerHTML = `
            <div class="d-flex justify-content-center align-items-center p-4">
                <div class="spinner-border text-danger me-3" role="status"></div>
                <span>安全性を評価中...</span>
            </div>
        `;

        try {
            const response = await fetch('/troubleshoot/assess-safety', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    command: commandInput,
                    context: {
                        environment: contextInput || 'unknown',
                        execution_user: 'web-user'
                    }
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.displaySafetyAssessment(result.assessment);
            } else {
                throw new Error(result.error || '安全性評価に失敗しました');
            }
        } catch (error) {
            console.error('安全性評価エラー:', error);
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ${error.message}
                </div>
            `;
        }
    }

    displaySafetyAssessment(assessment) {
        const resultDiv = document.getElementById('safety-assessment-result');
        const riskLevel = assessment.risk_level.toLowerCase();
        
        let html = `
            <div class="analysis-result safety-${riskLevel === 'high' ? 'low' : riskLevel === 'low' ? 'high' : 'medium'}">
                <div class="mb-3">
                    <h6><i class="fas fa-shield-alt me-2"></i>安全性評価結果</h6>
                    <div class="mb-2">
                        <strong>リスクレベル:</strong> 
                        <span class="badge bg-${riskLevel === 'high' ? 'danger' : riskLevel === 'low' ? 'success' : 'warning'}">
                            ${assessment.risk_level}
                        </span>
                    </div>
                    <div class="mb-2">
                        <strong>実行可能:</strong> ${assessment.is_safe ? '✅ はい' : '❌ いいえ'}
                    </div>
                </div>
        `;

        if (assessment.identified_risks.length > 0) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>特定されたリスク</h6>
                    <ul class="list-unstyled">
            `;
            assessment.identified_risks.forEach(risk => {
                html += `
                    <li class="mb-1">
                        <span class="badge bg-warning">${risk.category}</span>
                        ${risk.description}
                    </li>
                `;
            });
            html += `</ul></div>`;
        }

        if (assessment.safety_checks && assessment.safety_checks.length > 0) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-check-circle me-2"></i>実行前チェック項目</h6>
                    <ol>
            `;
            assessment.safety_checks.forEach(check => {
                html += `<li>${check}</li>`;
            });
            html += `</ol></div>`;
        }

        if (assessment.rollback_plan) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-undo me-2"></i>ロールバック計画</h6>
                    <div class="code-block">${assessment.rollback_plan}</div>
                </div>
            `;
        }

        html += `</div>`;
        resultDiv.innerHTML = html;
    }

    async loadHealthStatus() {
        try {
            const response = await fetch('/health');
            const data = await response.json();
            
            const healthStatus = document.getElementById('health-status');
            let statusHtml = `
                <div class="mb-2">
                    <span class="status-indicator status-${data.status === 'healthy' ? 'healthy' : 'error'}"></span>
                    <strong>ステータス:</strong> ${data.status}
                </div>
                <div class="mb-2">
                    <strong>稼働時間:</strong> ${this.formatUptime(data.uptime)}
                </div>
            `;

            if (data.services) {
                statusHtml += `<div class="mt-3"><strong>サービス状態:</strong></div>`;
                Object.entries(data.services).forEach(([service, status]) => {
                    statusHtml += `
                        <div class="mb-1">
                            <span class="status-indicator status-${status === 'healthy' ? 'healthy' : 'error'}"></span>
                            ${service}: ${status}
                        </div>
                    `;
                });
            }

            healthStatus.innerHTML = statusHtml;
        } catch (error) {
            console.error('ヘルスチェック取得エラー:', error);
            document.getElementById('health-status').innerHTML = `
                <div class="text-danger">ヘルスチェックの取得に失敗しました</div>
            `;
        }
    }

    async loadMetrics() {
        try {
            const response = await fetch('/metrics');
            const data = await response.json();
            
            const metricsDisplay = document.getElementById('metrics-display');
            let metricsHtml = '';

            if (data.requests) {
                metricsHtml += `
                    <div class="metric-item">
                        <span>総リクエスト数</span>
                        <span class="metric-value">${data.requests.total}</span>
                    </div>
                    <div class="metric-item">
                        <span>成功率</span>
                        <span class="metric-value">${((data.requests.successful / data.requests.total) * 100).toFixed(1)}%</span>
                    </div>
                `;
            }

            if (data.performance) {
                metricsHtml += `
                    <div class="metric-item">
                        <span>平均応答時間</span>
                        <span class="metric-value">${data.performance.average_response_time}ms</span>
                    </div>
                    <div class="metric-item">
                        <span>アクティブ接続数</span>
                        <span class="metric-value">${data.performance.active_connections}</span>
                    </div>
                `;
            }

            metricsDisplay.innerHTML = metricsHtml || '<div class="text-muted">メトリクスデータがありません</div>';
        } catch (error) {
            console.error('メトリクス取得エラー:', error);
            document.getElementById('metrics-display').innerHTML = `
                <div class="text-danger">メトリクスの取得に失敗しました</div>
            `;
        }
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}日 ${hours}時間 ${minutes}分`;
        } else if (hours > 0) {
            return `${hours}時間 ${minutes}分`;
        } else {
            return `${minutes}分`;
        }
    }

    showAlert(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.querySelector('.container-fluid').insertBefore(
            alertDiv, 
            document.querySelector('.row')
        );

        // 5秒後に自動削除
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// アプリケーション初期化
const app = new ITTroubleshootingApp();

// グローバルに公開（デバッグ用）
window.app = app;