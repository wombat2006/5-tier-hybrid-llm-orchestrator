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
        this.loadDashboardData();
        this.setActiveTab('dashboard-tab');
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

        // 5層LLM生成
        document.getElementById('generate-llm-btn')?.addEventListener('click', () => {
            this.generateLLMResponse();
        });

        // コード処理
        document.getElementById('process-code-btn')?.addEventListener('click', () => {
            this.processCode();
        });

        // ダッシュボード更新
        document.getElementById('refresh-dashboard-btn')?.addEventListener('click', () => {
            this.loadDashboardData();
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
            'dashboard-tab': 'dashboard-panel',
            'llm-generator-tab': 'llm-generator-panel',
            'code-analysis-tab': 'code-analysis-panel',
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

        // ログパターンを自動検出（非同期）
        const logDetectionMessage = this.addChatMessage('🔍 入力内容を確認中...', 'system', true);
        
        const isLog = await this.isLogContent(message);
        this.removeChatMessage(logDetectionMessage);
        
        if (isLog) {
            this.addChatMessage('📊 ログコンテンツを検出しました。自動的にログ解析を実行します...', 'system');
            await this.performAutoLogAnalysis(message, message); // ユーザーメッセージも渡す
            return;
        }

        // 深い洞察要求を検出
        const deepAnalysisRequest = this.detectDeepAnalysisRequest(message);
        
        let loadingMessage = '回答を準備中...';
        if (deepAnalysisRequest.isDeepAnalysis) {
            if (deepAnalysisRequest.isExplicitWallBounce) {
                loadingMessage = `🎯 マルチTier壁打ち分析を実行中...`;
                this.addChatMessage(`🎪 壁打ち要求を検出しました。複数のAIで並行分析を開始します！`, 'system');
            } else {
                loadingMessage = `🧠 ${deepAnalysisRequest.intensityLevel}レベルの分析を実行中...`;
                this.addChatMessage(`💡 深い洞察要求を検出しました。上位Tierモデルで処理します。`, 'system');
            }
        }

        // ローディングメッセージを表示
        const loadingId = this.addChatMessage(loadingMessage, 'system', true);

        try {
            // 深い洞察要求または複雑な質問の場合は壁打ちを実行
            if (deepAnalysisRequest.isDeepAnalysis || this.isComplexQuestion(message)) {
                await this.performMultiTierWallBounce(message, deepAnalysisRequest, loadingId);
                return;
            }

            // 通常のトラブルシューティングセッション
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

    async generateLLMResponse() {
        const promptInput = document.getElementById('llm-prompt');
        const tierSelect = document.getElementById('tier-select');
        const taskTypeSelect = document.getElementById('task-type');
        const resultDiv = document.getElementById('llm-result');

        const prompt = promptInput?.value?.trim();
        if (!prompt) {
            this.showAlert('プロンプトを入力してください', 'warning');
            return;
        }

        // ローディング状態を表示
        resultDiv.innerHTML = `
            <div class="d-flex justify-content-center align-items-center p-4">
                <div class="spinner-border text-success me-3" role="status"></div>
                <span class="tech-glow">AI が生成中...</span>
            </div>
        `;

        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    task_type: taskTypeSelect?.value || 'premium',
                    tier: tierSelect?.value || 'auto',
                    options: {
                        temperature: 0.7,
                        max_tokens: 2048
                    }
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.displayLLMResult(result);
            } else {
                throw new Error(result.error || 'LLM生成に失敗しました');
            }
        } catch (error) {
            console.error('LLM生成エラー:', error);
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ${error.message}
                </div>
            `;
        }
    }

    displayLLMResult(result) {
        const resultDiv = document.getElementById('llm-result');
        
        let html = `
            <div class="analysis-result">
                <div class="mb-3">
                    <h6><i class="fas fa-brain me-2"></i>LLM生成結果</h6>
                    <div class="mb-2">
                        <span class="badge bg-info">Tier: ${result.tier_used || 'Auto'}</span>
                        <span class="badge bg-secondary ms-2">Model: ${result.model_used || 'N/A'}</span>
                    </div>
                </div>
                <div class="mb-3">
                    <h6><i class="fas fa-edit me-2"></i>生成内容</h6>
                    <div class="code-block" style="max-height: 400px; overflow-y: auto;">
                        ${this.formatResponseText(result.response)}
                    </div>
                </div>
        `;

        if (result.performance_metrics) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-chart-line me-2"></i>パフォーマンス</h6>
                    <div class="row">
                        <div class="col-md-6">
                            <small class="text-muted">応答時間: ${result.performance_metrics.response_time}ms</small>
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted">トークン数: ${result.performance_metrics.tokens_used || 'N/A'}</small>
                        </div>
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        resultDiv.innerHTML = html;
    }

    async processCode() {
        const codeInput = document.getElementById('code-input');
        const languageSelect = document.getElementById('language-select');
        const actionSelect = document.getElementById('code-action');
        const resultDiv = document.getElementById('code-result');

        const code = codeInput?.value?.trim();
        if (!code) {
            this.showAlert('コードを入力してください', 'warning');
            return;
        }

        // ローディング状態を表示
        resultDiv.innerHTML = `
            <div class="d-flex justify-content-center align-items-center p-4">
                <div class="spinner-border text-primary me-3" role="status"></div>
                <span class="tech-glow">コード解析中...</span>
            </div>
        `;

        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: this.buildCodePrompt(code, languageSelect?.value, actionSelect?.value),
                    task_type: 'coding',
                    options: {
                        temperature: 0.3,
                        max_tokens: 4096
                    }
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.displayCodeResult(result, actionSelect?.value);
            } else {
                throw new Error(result.error || 'コード処理に失敗しました');
            }
        } catch (error) {
            console.error('コード処理エラー:', error);
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ${error.message}
                </div>
            `;
        }
    }

    buildCodePrompt(code, language, action) {
        const prompts = {
            analyze: `以下の${language}コードを詳細に解析してください：\n\n${code}\n\n解析項目：\n- コードの目的と機能\n- アルゴリズムの説明\n- 潜在的な問題点\n- 改善提案`,
            review: `以下の${language}コードをレビューしてください：\n\n${code}\n\nレビュー項目：\n- セキュリティの問題\n- パフォーマンスの問題\n- コード品質\n- ベストプラクティス`,
            optimize: `以下の${language}コードを最適化してください：\n\n${code}\n\n最適化の観点：\n- パフォーマンス向上\n- メモリ使用量削減\n- 可読性改善\n- バグ修正`,
            explain: `以下の${language}コードを初心者にもわかりやすく説明してください：\n\n${code}\n\n説明項目：\n- 各行の処理内容\n- 使用されている技術\n- 実行の流れ`,
            test: `以下の${language}コードに対するテストコードを生成してください：\n\n${code}\n\nテスト項目：\n- 正常系テスト\n- 異常系テスト\n- 境界値テスト\n- エッジケース`
        };
        return prompts[action] || prompts.analyze;
    }

    displayCodeResult(result, action) {
        const resultDiv = document.getElementById('code-result');
        const actionLabels = {
            analyze: '解析結果',
            review: 'レビュー結果',
            optimize: '最適化結果',
            explain: '説明結果',
            test: 'テスト生成結果'
        };
        
        let html = `
            <div class="analysis-result">
                <div class="mb-3">
                    <h6><i class="fas fa-code me-2"></i>${actionLabels[action] || 'コード処理結果'}</h6>
                    <div class="mb-2">
                        <span class="badge bg-primary">Tier: ${result.tier_used || 'Auto'}</span>
                        <span class="badge bg-secondary ms-2">Model: ${result.model_used || 'Qwen3 Coder'}</span>
                    </div>
                </div>
                <div class="mb-3">
                    <div class="code-block" style="max-height: 500px; overflow-y: auto;">
                        ${this.formatResponseText(result.response)}
                    </div>
                </div>
        `;

        if (result.performance_metrics) {
            html += `
                <div class="mb-3">
                    <h6><i class="fas fa-chart-line me-2"></i>処理情報</h6>
                    <div class="row">
                        <div class="col-md-6">
                            <small class="text-muted">処理時間: ${result.performance_metrics.response_time}ms</small>
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted">トークン使用: ${result.performance_metrics.tokens_used || 'N/A'}</small>
                        </div>
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        resultDiv.innerHTML = html;
    }

    async loadDashboardData() {
        try {
            // システム情報と統計を並行取得
            const [healthResponse, metricsResponse, infoResponse] = await Promise.all([
                fetch('/health'),
                fetch('/metrics'), 
                fetch('/info')
            ]);

            const healthData = await healthResponse.json();
            const metricsData = await metricsResponse.json();
            const infoData = await infoResponse.json();

            this.updateDashboardStats(healthData, metricsData, infoData);
            this.updateTierStatus();
            this.updateRecentActivity();

        } catch (error) {
            console.error('ダッシュボードデータ取得エラー:', error);
            document.getElementById('dashboard-stats').innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    ダッシュボードデータの取得に失敗しました
                </div>
            `;
        }
    }

    updateDashboardStats(health, metrics, info) {
        const statsDiv = document.getElementById('dashboard-stats');
        
        let html = `
            <div class="row g-3">
                <div class="col-md-3">
                    <div class="metric-card">
                        <div class="metric-icon bg-success">
                            <i class="fas fa-heartbeat"></i>
                        </div>
                        <div class="metric-info">
                            <h3>${health.status === 'healthy' ? 'OK' : 'NG'}</h3>
                            <p>システム状態</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="metric-card">
                        <div class="metric-icon bg-info">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="metric-info">
                            <h3>${this.formatUptime(health.uptime || 0)}</h3>
                            <p>稼働時間</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="metric-card">
                        <div class="metric-icon bg-primary">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div class="metric-info">
                            <h3>${metrics.requests?.total || 0}</h3>
                            <p>総リクエスト数</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="metric-card">
                        <div class="metric-icon bg-warning">
                            <i class="fas fa-memory"></i>
                        </div>
                        <div class="metric-info">
                            <h3>${info.memory_usage ? (info.memory_usage / 1024 / 1024).toFixed(1) : 'N/A'}MB</h3>
                            <p>メモリ使用量</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        statsDiv.innerHTML = html;
    }

    async updateTierStatus() {
        // ヘルス状態を取得
        try {
            const healthResponse = await fetch('/health');
            const healthData = await healthResponse.json();
            
            const tierStatusDiv = document.getElementById('tier-status');
            const specialLLMDiv = document.getElementById('special-llm-status');
            
            // 5層LLMシステム状態
            const tierInfo = [
                { name: 'Tier 0 (Qwen3 Coder) - コラボレーション統合', healthy: healthData.details.collaborative_pipeline !== false, usage: '25%' },
                { name: 'Tier 1 (Gemini Flash)', healthy: healthData.details.gemini_2_5_flash, usage: '45%' },
                { name: 'Tier 2 (Claude Sonnet)', healthy: healthData.details.claude_sonnet, usage: '25%' },
                { name: 'Tier 3 (GPT-4o)', healthy: healthData.details.gpt4o, usage: '5%' }
            ];

            let html = tierInfo.map(tier => `
                <div class="tier-indicator">
                    <div class="tier-label">${tier.name}</div>
                    <div>
                        <span class="status-dot status-${tier.healthy ? 'healthy' : 'error'}"></span>
                        <span class="metric-value">${tier.usage}</span>
                    </div>
                </div>
            `).join('');

            tierStatusDiv.innerHTML = html;

            // 特殊LLMシステム状態
            const specialLLMInfo = [
                { name: 'Qwen3 Coder (単体)', healthy: healthData.details.qwen3_coder, status: 'OpenRouter接続問題' },
                { name: 'Collaborative Pipeline', healthy: true, status: '正常稼働' },
                { name: 'Hybrid Task Router', healthy: true, status: '自動振り分け' },
                { name: 'Auto Log Detection', healthy: true, status: 'Claude Code統合' }
            ];

            let specialHTML = specialLLMInfo.map(special => `
                <div class="tier-indicator">
                    <div class="tier-label">${special.name}</div>
                    <div>
                        <span class="status-dot status-${special.healthy ? 'healthy' : 'error'}"></span>
                        <small class="text-muted">${special.status}</small>
                    </div>
                </div>
            `).join('');

            specialLLMDiv.innerHTML = specialHTML;

        } catch (error) {
            console.error('ステータス更新エラー:', error);
        }
    }

    updateRecentActivity() {
        const activityDiv = document.getElementById('recent-activity');
        
        // モックデータ - 実際の実装では API から取得
        const activities = [
            { icon: 'fas fa-brain', text: 'LLM生成リクエスト処理完了', time: '2分前' },
            { icon: 'fas fa-search', text: 'ログ解析実行', time: '5分前' },
            { icon: 'fas fa-code', text: 'コード解析完了', time: '8分前' },
            { icon: 'fas fa-shield-alt', text: 'セキュリティチェック実行', time: '12分前' },
            { icon: 'fas fa-comments', text: 'トラブルシューティングセッション開始', time: '15分前' }
        ];

        let html = activities.map(activity => `
            <div class="activity-item">
                <i class="${activity.icon}"></i>
                <span>${activity.text}</span>
                <small>${activity.time}</small>
            </div>
        `).join('');

        activityDiv.innerHTML = html;
    }

    formatResponseText(text) {
        // HTMLエスケープしてから改行とコードブロックを処理
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>')
            .replace(/```([\s\S]*?)```/g, '<pre class="code-block">$1</pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    /**
     * ログコンテンツかどうかを判定（Claude Code に問い合わせ）
     */
    async isLogContent(text) {
        // 明らかに短い会話文は除外
        if (text.length < 30 || this.isObviousConversation(text)) {
            return false;
        }

        // 基本的なログパターンがある場合のみClaude Codeに問い合わせ
        const hasBasicLogIndicators = this.hasBasicLogPatterns(text);
        if (!hasBasicLogIndicators) {
            return false;
        }

        // Claude Code に問い合わせて判定
        return await this.askClaudeCodeForLogDetection(text);
    }

    /**
     * 明らかな会話文かどうかを判定
     */
    isObviousConversation(text) {
        const conversationalPatterns = [
            /^(こんにちは|お疲れ|よろしく|ありがとう|すみません)/i,
            /\?(\s|$)/,  // 疑問符
            /^(how|what|why|when|where|can you|could you|please)/i,
            /ですか？|でしょうか？/,
            /^(はい|いいえ|そうです)[\s。]/,
        ];
        
        return conversationalPatterns.some(pattern => pattern.test(text));
    }

    /**
     * 基本的なログパターンがあるかチェック
     */
    hasBasicLogPatterns(text) {
        const basicPatterns = [
            /\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}/, // タイムスタンプ
            /\d{2}:\d{2}:\d{2}/, // 時刻
            /(ERROR|WARN|INFO|DEBUG|FATAL)/i, // ログレベル
            /(failed|error|exception|stack)/i, // エラー系キーワード
            /(systemctl|service|httpd|nginx|mysql|postgresql)/i, // システム関連
            /\d+\.\d+\.\d+\.\d+/, // IP
            /^\s*at\s+.*:\d+/m, // スタックトレース風
        ];
        
        return basicPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Claude Code にログ判定を問い合わせ
     */
    async askClaudeCodeForLogDetection(text) {
        try {
            const prompt = `以下のテキストがログファイルやシステムログの内容かどうかを判定してください。

テキスト:
"""
${text.substring(0, 500)}...
"""

以下の条件を満たす場合のみ「YES」と回答してください：
1. システムログ、アプリケーションログ、エラーログのいずれかである
2. 実際のサーバーやシステムから出力された形跡がある
3. 会話文、質問、説明文ではない

判定結果を「YES」または「NO」の1文字で回答してください。`;

            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    task_type: 'general', // Gemini Flashを使用（確実に動作）
                    options: {
                        temperature: 0.1, // 確実性重視
                        max_tokens: 10    // 短い回答
                    }
                })
            });

            const result = await response.json();
            
            if (response.ok && result.response) {
                return result.response.trim().toUpperCase().includes('YES');
            }
            
            return false;
        } catch (error) {
            console.error('Claude Code log detection error:', error);
            // フォールバックとして基本判定を使用
            return this.fallbackLogDetection(text);
        }
    }

    /**
     * フォールバック用のシンプルなログ判定
     */
    fallbackLogDetection(text) {
        const strongIndicators = [
            /\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[.,]\d{3}/, // 精密タイムスタンプ
            /^\s*at\s+[\w$.]+\([\w$.]+:\d+:\d+\)$/m, // スタックトレース
            /\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\w+\s+(kernel|systemd|sshd)/i, // syslog
        ];
        
        return strongIndicators.some(pattern => pattern.test(text));
    }


    /**
     * 複雑な質問かどうかを判定
     */
    isComplexQuestion(message) {
        // 単純な内容をこのシステムに聞くことは少ないという前提で、ほとんどを複雑と判定
        const simplePatterns = [
            /^(こんにちは|お疲れ|ありがとう|はい|いいえ)[\s。]*$/,
            /^.{1,10}$/, // 10文字以下の短いメッセージ
        ];
        
        return !simplePatterns.some(pattern => pattern.test(message.trim()));
    }

    /**
     * マルチTier壁打ちを実行
     */
    async performMultiTierWallBounce(message, deepAnalysisRequest, loadingId) {
        try {
            // 壁打ち対象のTierを決定
            const tiers = await this.selectWallBounceTiers(deepAnalysisRequest.intensityLevel);
            
            this.removeChatMessage(loadingId);
            this.addChatMessage(`🎯 ${tiers.length}つのTierで並行解析を開始します...`, 'system');
            
            // 並行してすべてのTierで処理
            const promises = tiers.map(async (tier, index) => {
                const progressId = this.addChatMessage(`${tier.icon} ${tier.name}: 処理中...`, 'system', true);
                
                try {
                    const result = await this.executeOnTier(message, tier);
                    this.removeChatMessage(progressId);
                    
                    return {
                        tier: tier,
                        result: result,
                        order: index
                    };
                } catch (error) {
                    this.removeChatMessage(progressId);
                    return {
                        tier: tier,
                        error: error.message,
                        order: index
                    };
                }
            });

            // すべての結果を待つ
            const results = await Promise.all(promises);
            
            // 結果を順番に表示
            results
                .filter(r => !r.error)
                .forEach((r, index) => {
                    this.addChatMessage(`\n**${r.tier.name}からの洞察:**\n${r.result}`, 'system');
                });

            // エラーがあった場合は報告
            const errors = results.filter(r => r.error);
            if (errors.length > 0) {
                this.addChatMessage(`⚠️ ${errors.length}個のTierでエラーが発生しましたが、他のTierから十分な洞察を得られました。`, 'system');
            }

            // 壁打ち完了メッセージ
            const successCount = results.length - errors.length;
            const tierNames = results.filter(r => !r.error).map(r => r.tier.name).join(', ');
            
            this.addChatMessage(`✨ マルチTier分析が完了しました。${successCount}つの異なる観点からの洞察をお届けしました。\n\n📊 **参加AI**: ${tierNames}\n\n各AIの特性を活かした多角的な分析により、包括的な洞察を提供いたします。`, 'system');

        } catch (error) {
            console.error('マルチTier壁打ちエラー:', error);
            this.removeChatMessage(loadingId);
            this.addChatMessage(`❌ マルチTier分析でエラーが発生しました: ${error.message}`, 'system');
        }
    }

    /**
     * 壁打ち対象Tierを選択
     */
    async selectWallBounceTiers(intensityLevel) {
        const healthResponse = await fetch('/health');
        const healthData = await healthResponse.json();
        
        const availableTiers = [
            { name: 'GPT-4o (Tier 3)', taskType: 'critical', icon: '🧠', available: healthData.details.gpt4o, priority: 4 },
            { name: 'Claude Sonnet (Tier 2)', taskType: 'premium', icon: '🎭', available: healthData.details.claude_sonnet, priority: 3 },
            { name: 'Gemini Pro Exp (Tier 1+)', taskType: 'complex_analysis', icon: '💎', available: healthData.details.gemini_pro_exp, priority: 2 },
            { name: 'Gemini Flash (Tier 1)', taskType: 'general', icon: '⚡', available: healthData.details.gemini_2_5_flash, priority: 1 },
            { name: 'Collaborative Coding (Tier 0)', taskType: 'coding', icon: '👥', available: true, priority: 0 }, // コラボレーションパイプライン
        ].filter(tier => tier.available);

        // 強度レベルに応じて選択
        switch (intensityLevel) {
            case 'critical':
                // 全Tier使用（最大5つの異なる視点）
                return availableTiers.slice(0, 4); 
            case 'premium':
                // 上位3Tier使用（バランスの良い多角的分析）
                return availableTiers.slice(0, 3);
            case 'standard':
                // 上位2Tier + コラボレーションTier（効率的な多視点）
                return [...availableTiers.slice(0, 2), availableTiers.find(t => t.priority === 0)].filter(Boolean);
            default:
                // デフォルトで異なるTier 3つ（高・中・低レベルの視点）
                return [
                    availableTiers.find(t => t.priority >= 3),
                    availableTiers.find(t => t.priority >= 1 && t.priority < 3), 
                    availableTiers.find(t => t.priority === 0)
                ].filter(Boolean);
        }
    }

    /**
     * 特定のTierで処理を実行
     */
    async executeOnTier(message, tier) {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: message,
                task_type: tier.taskType,
                options: {
                    temperature: 0.7,
                    max_tokens: 1500
                }
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `${tier.name}での処理に失敗しました`);
        }

        return result.response;
    }

    /**
     * 自動ログ解析を実行（インテリジェントフォールバック付き）
     */
    async performAutoLogAnalysis(logContent, userMessage = '') {
        const analysisMethod = await this.selectOptimalAnalysisMethod(logContent, userMessage);
        
        try {
            let result;
            
            if (analysisMethod === 'advanced') {
                // 高度なログ解析APIを使用
                result = await this.performAdvancedLogAnalysis(logContent);
            } else {
                // LLM直接解析（フォールバック）
                result = await this.performDirectLLMAnalysis(logContent, analysisMethod);
            }

            if (result) {
                this.displayAutoLogAnalysisResult(result);
                
                // ログ解析タブに切り替えて結果も表示
                this.setActiveTab('log-analysis-tab');
                if (result.diagnosis) {
                    this.displayLogAnalysisResult({ diagnosis: result });
                }
            }
        } catch (error) {
            console.error('自動ログ解析エラー:', error);
            this.addChatMessage(`❌ ログ解析エラー: ${error.message}`, 'system');
        }
    }

    /**
     * 最適な解析方法を選択（深い洞察要求を考慮）
     */
    async selectOptimalAnalysisMethod(logContent, userMessage = '') {
        // ユーザーからの深い分析要求を検出
        const deepAnalysisRequest = this.detectDeepAnalysisRequest(userMessage);
        
        // ログの複雑さを評価
        const complexity = this.evaluateLogComplexity(logContent);
        
        // システム健康状態を確認
        try {
            const healthResponse = await fetch('/health');
            const healthData = await healthResponse.json();
            
            // 深い分析が要求された場合は強制的に上位Tierを使用
            if (deepAnalysisRequest.isDeepAnalysis) {
                return this.selectHighTierModel(healthData, deepAnalysisRequest.intensityLevel);
            }
            
            // 高度なログ解析システムが利用可能かチェック
            if (complexity.isAdvanced && healthData.success) {
                return 'advanced';
            }
            
            // 通常のフォールバック階層を選択
            return this.selectStandardFallback(healthData);
            
        } catch (error) {
            console.log('ヘルス状態確認失敗、フォールバックを使用:', error);
            return 'claude_sonnet'; // 安全なフォールバック
        }
    }

    /**
     * 深い分析要求を検出（壁打ち要求含む）
     */
    detectDeepAnalysisRequest(userMessage) {
        const deepAnalysisPatterns = [
            // 明示的な壁打ち要求 (最高レベル)
            { pattern: /(壁打ち|複数のAI|複数のモデル|いろんなAI)(で|して|を使って)/, level: 'critical' },
            { pattern: /(異なる|複数の)(観点|視点|意見|AI)/, level: 'critical' },
            { pattern: /(全ての|すべての|各)Tier(で|から)/, level: 'critical' },
            { pattern: /多角的|多面的|多元的/, level: 'critical' },
            
            // 深い洞察要求 (最高レベル)
            { pattern: /(もっと|さらに|より)(深く|詳しく|詳細に)(洞察|分析|解析|調査)/, level: 'critical' },
            { pattern: /(徹底的|包括的|完全)に(分析|解析|調査)/, level: 'critical' },
            { pattern: /(根本的|本質的)な(原因|問題)/, level: 'critical' },
            { pattern: /深掘り|deep dive|in-depth analysis/, level: 'critical' },
            
            // 高レベル分析要求
            { pattern: /(詳しく|詳細に)(教えて|説明|解析)/, level: 'premium' },
            { pattern: /(専門的|技術的)な(観点|視点|分析)/, level: 'premium' },
            { pattern: /(複雑|高度)な(分析|解析)/, level: 'premium' },
            
            // 中レベル分析要求
            { pattern: /(もう少し|もうちょっと)(詳しく|詳細)/, level: 'standard' },
            { pattern: /追加(情報|詳細|分析)/, level: 'standard' },
        ];

        const userText = userMessage.toLowerCase();
        
        for (const { pattern, level } of deepAnalysisPatterns) {
            if (pattern.test(userText)) {
                return {
                    isDeepAnalysis: true,
                    intensityLevel: level,
                    matchedPattern: pattern.toString(),
                    isExplicitWallBounce: /壁打ち|複数のAI|複数のモデル|いろんなAI|異なる.*観点|複数の.*視点|全ての.*Tier|多角的|多面的|多元的/.test(userText)
                };
            }
        }

        return { isDeepAnalysis: false, intensityLevel: 'none', isExplicitWallBounce: false };
    }

    /**
     * 高Tierモデルを選択
     */
    selectHighTierModel(healthData, intensityLevel) {
        switch (intensityLevel) {
            case 'critical':
                // 最高品質が必要
                if (healthData.details.gpt4o) return 'gpt4o';
                if (healthData.details.claude_sonnet) return 'claude_sonnet';
                if (healthData.details.gemini_pro_exp) return 'gemini_pro_exp';
                return 'gemini_2_5_flash';
                
            case 'premium':
                // 高品質が必要
                if (healthData.details.claude_sonnet) return 'claude_sonnet';
                if (healthData.details.gpt4o) return 'gpt4o';
                if (healthData.details.gemini_pro_exp) return 'gemini_pro_exp';
                return 'gemini_2_5_flash';
                
            case 'standard':
                // 標準品質の向上
                if (healthData.details.claude_sonnet) return 'claude_sonnet';
                if (healthData.details.gemini_pro_exp) return 'gemini_pro_exp';
                return 'gemini_2_5_flash';
                
            default:
                return this.selectStandardFallback(healthData);
        }
    }

    /**
     * 標準フォールバック選択
     */
    selectStandardFallback(healthData) {
        if (healthData.details.gemini_pro_exp) {
            return 'gemini_pro_exp';
        } else if (healthData.details.claude_sonnet) {
            return 'claude_sonnet';
        } else if (healthData.details.gpt4o) {
            return 'gpt4o';
        } else {
            return 'gemini_2_5_flash'; // 最後の手段
        }
    }

    /**
     * ログの複雑さを評価
     */
    evaluateLogComplexity(logContent) {
        const lines = logContent.split('\n').length;
        const hasStackTrace = /^\s*at\s+.*:\d+/m.test(logContent);
        const hasMultipleServices = (logContent.match(/\b(httpd|nginx|mysql|postgresql|systemd|docker)\b/gi) || []).length > 1;
        const hasComplexErrors = /\b(exception|traceback|segfault|core dump|memory leak)\b/i.test(logContent);
        
        return {
            isAdvanced: lines > 10 || hasStackTrace || hasMultipleServices || hasComplexErrors,
            lines: lines,
            complexity: hasStackTrace + hasMultipleServices + hasComplexErrors
        };
    }

    /**
     * 高度なログ解析API経由
     */
    async performAdvancedLogAnalysis(logContent) {
        const response = await fetch('/troubleshoot/analyze-advanced', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                raw_logs: logContent,
                context: {
                    description: 'チャット経由で投稿されたログの自動解析',
                    system_type: this.detectSystemType(logContent),
                    urgency: this.detectUrgency(logContent)
                }
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || '高度なログ解析に失敗しました');
        }
        
        return result.diagnosis;
    }

    /**
     * LLM直接解析（フォールバック）
     */
    async performDirectLLMAnalysis(logContent, modelType) {
        const analysisPrompt = this.buildLogAnalysisPrompt(logContent);
        
        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: analysisPrompt,
                task_type: this.getTaskTypeForModel(modelType),
                options: {
                    temperature: 0.3,
                    max_tokens: 1500
                }
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'LLM解析に失敗しました');
        }
        
        // 簡易的な診断形式に変換
        return this.parseDirectAnalysisResult(result.response, modelType);
    }

    /**
     * ログ解析用プロンプトを構築
     */
    buildLogAnalysisPrompt(logContent) {
        return `以下のシステムログを解析し、問題を特定して解決策を提示してください。

ログ内容:
"""
${logContent.substring(0, 2000)}
"""

以下の形式で回答してください：

## 🔍 問題の概要
[主要な問題を簡潔に説明]

## ⚠️ 重要度
[critical/high/medium/low]

## 🔧 推奨される解決策
1. [即座に実行すべきアクション]
2. [追加の調査項目] 
3. [長期的な対策]

## 📋 確認コマンド
\`\`\`bash
[問題を確認するためのコマンド]
\`\`\`

## 💡 根本原因の推定
[なぜこの問題が発生したかの分析]`;
    }

    /**
     * モデルタイプに適したタスクタイプを取得
     */
    getTaskTypeForModel(modelType) {
        const mapping = {
            'gemini_pro_exp': 'complex_analysis',
            'claude_sonnet': 'premium',
            'gpt4o': 'critical',
            'gemini_2_5_flash': 'general'
        };
        
        return mapping[modelType] || 'premium';
    }

    /**
     * 直接解析結果をパース
     */
    parseDirectAnalysisResult(analysisText, modelType) {
        // 簡易的な構造化データを作成
        const severityMatch = analysisText.match(/重要度[:\s]*([^\n]+)/i);
        const severity = severityMatch ? severityMatch[1].trim().toLowerCase() : 'medium';
        
        return {
            primary_issue: {
                title: `LLM解析結果 (${modelType})`,
                description: analysisText.substring(0, 200) + '...',
                severity: severity,
                confidence_score: modelType === 'gpt4o' ? 0.95 : 0.8
            },
            impact_assessment: {
                user_impact: severity === 'critical' ? 'critical' : 'medium',
                urgency_level: severity === 'critical' ? 5 : 3
            },
            resolution_plan: {
                immediate_actions: [
                    { title: 'LLM推奨アクション', description: '詳細はメッセージを確認してください' }
                ]
            },
            analysis_method: `Direct LLM Analysis (${modelType})`,
            full_analysis: analysisText
        };
    }

    /**
     * システムタイプを検出
     */
    detectSystemType(logContent) {
        if (/httpd|apache|nginx/i.test(logContent)) return 'web_server';
        if (/postgresql|mysql|database/i.test(logContent)) return 'database';
        if (/systemd|systemctl|service/i.test(logContent)) return 'system_service';
        if (/docker|container|k8s|kubernetes/i.test(logContent)) return 'container';
        return 'linux';
    }

    /**
     * 緊急度を検出
     */
    detectUrgency(logContent) {
        const criticalPatterns = /FATAL|CRITICAL|EMERGENCY|failed to start|connection refused|out of memory/i;
        const highPatterns = /ERROR|failed|exception|crash|timeout/i;
        
        if (criticalPatterns.test(logContent)) return 'critical';
        if (highPatterns.test(logContent)) return 'high';
        return 'medium';
    }

    /**
     * チャット内での自動ログ解析結果表示
     */
    displayAutoLogAnalysisResult(diagnosis) {
        let summary;
        
        if (diagnosis.full_analysis) {
            // 直接LLM解析の場合は、フル回答を表示
            summary = `🔍 **ログ解析完了** (${diagnosis.analysis_method})\n\n`;
            summary += diagnosis.full_analysis;
        } else {
            // 従来の高度解析の場合
            summary = `🔍 **ログ解析結果**\n\n`;
            summary += `**主要問題**: ${diagnosis.primary_issue.title}\n`;
            summary += `**重要度**: ${diagnosis.primary_issue.severity.toUpperCase()}\n`;
            summary += `**影響**: ${diagnosis.impact_assessment.user_impact}\n\n`;
            
            if (diagnosis.resolution_plan.immediate_actions.length > 0) {
                summary += `**推奨アクション**:\n`;
                diagnosis.resolution_plan.immediate_actions.slice(0, 3).forEach((action, index) => {
                    summary += `${index + 1}. ${action.title}\n`;
                });
            }
            
            summary += `\n詳細は「ログ解析」タブをご確認ください。`;
        }
        
        this.addChatMessage(this.formatResponseText(summary), 'system');
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