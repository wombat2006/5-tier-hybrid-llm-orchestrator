import dotenv from 'dotenv';
import express from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import compression from 'compression';
import { LLMOrchestrator } from './orchestrator/LLMOrchestrator';
import LogAnalysisService, { LogAnalysisRequest } from './services/LogAnalysisService';
import InteractiveTroubleshooter from './services/InteractiveTroubleshooter';
import AdvancedLogAnalyzer, { LogAnalysisContext } from './services/AdvancedLogAnalyzer';
import { ToolOrchestratorService, AnalysisToolRequest } from './services/ToolOrchestratorService';
import { CLIRequest } from './services/CLIInterfaceManager';
import { LLMRequest } from './types';

// 環境変数読み込み
dotenv.config();

// SSL証明書の設定（本番環境用）
let sslOptions: any = null;
let userPort = 4000;     // 開発時のフォールバック
let adminPort = 4001;    // 開発時のフォールバック

try {
  sslOptions = {
    key: fs.readFileSync('/etc/ssl/advsec/www.advsec.co.jp.key'),
    cert: fs.readFileSync('/etc/ssl/advsec/fullchain.crt')
  };
  userPort = 443;    // 一般ユーザ向けSSL
  adminPort = 80;    // 管理者向けSSL (非標準だが要求仕様)
  console.log('✅ SSL証明書を読み込みました - 本番モード');
} catch (error) {
  console.log('⚠️  SSL証明書が読み込めません - 開発モード（HTTP）で起動します');
  console.log('   本番環境では適切な権限設定が必要です');
}

// アプリケーション作成
const app = express();
const adminApp = express();

// パフォーマンス最適化ミドルウェア設定
app.use(compression()); // gzip圧縮でレスポンスサイズ削減
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静的ファイル配信設定
app.use(express.static('public'));

// CORS対応
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// オーケストレーター初期化
let orchestrator: LLMOrchestrator;
let toolOrchestrator: ToolOrchestratorService;
const logAnalysisService = new LogAnalysisService();
const interactiveTroubleshooter = new InteractiveTroubleshooter();
const advancedLogAnalyzer = new AdvancedLogAnalyzer();

try {
  orchestrator = new LLMOrchestrator();
  toolOrchestrator = ToolOrchestratorService.getInstance();
  console.log('🚀 All services initialized successfully');
  console.log('   - LLM Orchestrator ✅');
  console.log('   - Tool Orchestrator ✅');
  console.log('   - Log Analysis Service ✅');
  console.log('   - Interactive Troubleshooter ✅');
  console.log('   - Advanced Log Analyzer ✅');
} catch (error) {
  console.error('❌ Failed to initialize services:', error);
  process.exit(1);
}

// ルート定義

// ヘルスチェック
// キャッシュされたヘルスチェック結果
let healthCheckCache: { data: any; timestamp: number } | null = null;
const HEALTH_CHECK_CACHE_TTL = 30000; // 30秒キャッシュ

app.get('/health', async (req, res) => {
  try {
    // キャッシュクリア強制フラグをチェック
    const forceRefresh = req.query.nocache === 'true' || req.query.refresh === 'true';
    
    // 高速化: キャッシュされた結果があり、まだ有効で、強制リフレッシュでない場合は即座に返す
    const now = Date.now();
    if (healthCheckCache && (now - healthCheckCache.timestamp) < HEALTH_CHECK_CACHE_TTL && !forceRefresh) {
      res.status(200).json({
        ...healthCheckCache.data,
        cached: true,
        cache_age_ms: now - healthCheckCache.timestamp
      });
      return;
    }

    const healthCheck = await orchestrator.healthCheck();
    const responseData = {
      success: healthCheck.healthy,
      timestamp: new Date().toISOString(),
      details: healthCheck.details,
      cached: false
    };

    // 結果をキャッシュ
    healthCheckCache = {
      data: responseData,
      timestamp: now
    };

    // HTTPステータスコードは常に200で返す（UIが503を正しく処理できないため）
    res.status(200).json(responseData);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      cached: false
    });
  }
});

// ヘルスチェックキャッシュクリア
app.post('/health/clear-cache', (req, res) => {
  try {
    healthCheckCache = null;
    res.json({
      success: true,
      message: 'Health check cache cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

// LLMモデルヒエラルキー表示
app.get('/models/hierarchy', (req, res) => {
  try {
    const availableModels = orchestrator.getAvailableModels();
    
    // Tierごとにモデルを分類
    const hierarchy = {
      tier0: { name: "Tier 0 - 無料・最優先", models: [] as any[] },
      tier1: { name: "Tier 1 - 高速汎用", models: [] as any[] },
      tier2: { name: "Tier 2 - 複雑推論", models: [] as any[] },
      tier3: { name: "Tier 3 - 最高品質", models: [] as any[] },
      tier4: { name: "Tier 4 - 最高級推論", models: [] as any[] }
    };

    // モデル情報を取得してTier別に分類
    availableModels.forEach(model => {
      const tierKey = `tier${model.tier}` as keyof typeof hierarchy;
      if (hierarchy[tierKey]) {
        hierarchy[tierKey].models.push({
          id: model.id,
          name: model.name || model.id,
          provider: model.provider || 'unknown',
          capabilities: model.capabilities || [],
          cost_per_1k_tokens: model.cost_per_1k_tokens || { input: 0, output: 0 },
          latency_ms: model.latency_ms || 'N/A'
        });
      }
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      total_models: availableModels.length,
      hierarchy: hierarchy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get model hierarchy',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// システム情報
app.get('/info', (req, res) => {
  try {
    const availableModels = orchestrator.getAvailableModels();
    res.json({
      success: true,
      data: {
        system: '5-Tier Hybrid LLM System',
        version: '1.0.0',
        available_models: availableModels.length,
        models_by_tier: {
          tier0: availableModels.filter(m => m.tier === 0).length,
          tier1: availableModels.filter(m => m.tier === 1).length,
          tier2: availableModels.filter(m => m.tier === 2).length,
          tier3: availableModels.filter(m => m.tier === 3).length,
        },
        capabilities: Array.from(new Set(availableModels.flatMap(m => m.capabilities))),
        providers: Array.from(new Set(availableModels.map(m => m.provider)))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get system info',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// メトリクス取得
app.get('/metrics', (req, res) => {
  try {
    const metrics = orchestrator.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Redis統合リアルタイムメトリクス
app.get('/metrics/realtime', async (req, res) => {
  try {
    // LLMOrchestratorからRedisLoggerにアクセスするためのプロキシメソッドを追加する必要があります
    const realtimeMetrics = await orchestrator.getRealTimeMetrics();
    res.json({
      success: true,
      data: realtimeMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get real-time metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// クエリ分析履歴取得
app.get('/analytics/queries/:date?', async (req, res) => {
  try {
    const date = req.params.date || new Date().toISOString().split('T')[0];
    const limit = parseInt(req.query.limit as string) || 100;
    
    const queryHistory = await orchestrator.getQueryAnalysisHistory(date, limit);
    res.json({
      success: true,
      date,
      data: queryHistory,
      count: queryHistory.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get query analysis history',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 日次コストレポート
app.get('/costs/daily/:date?', async (req, res) => {
  try {
    const date = req.params.date || new Date().toISOString().split('T')[0];
    const costReport = await orchestrator.getDailyCostReport(date);
    
    res.json({
      success: true,
      date,
      data: costReport
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get daily cost report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upstash Redis統合ステータス
app.get('/redis/status', async (req, res) => {
  try {
    const redisStats = await orchestrator.getRedisStats();
    res.json({
      success: true,
      data: redisStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get Redis status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// メインのLLM処理エンドポイント
app.post('/generate', async (req, res) => {
  try {
    const { 
      prompt, 
      task_type, 
      preferred_tier, 
      user_metadata,
      conversation_id,  // 🆕 会話ID対応
      context           // 🆕 直接コンテキスト指定
    } = req.body;

    // 入力検証
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }

    if (prompt.length > 50000) {
      return res.status(400).json({
        success: false,
        error: 'Prompt too long (max 50,000 characters)'
      });
    }

    // 🆕 会話IDの処理
    let finalUserMetadata = user_metadata || {};
    if (conversation_id) {
      finalUserMetadata.session_id = conversation_id;
    }

    const request: LLMRequest = {
      prompt,
      task_type: task_type || 'auto',
      preferred_tier,
      user_metadata: finalUserMetadata,
      context: context  // 🆕 直接コンテキスト対応
    };

    console.log(`\n📥 New request received: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
    console.log(`📋 Task type: ${request.task_type}, Preferred tier: ${preferred_tier || 'auto'}`);
    if (conversation_id) {
      console.log(`💬 Conversation ID: ${conversation_id}`);
    }

    const response = await orchestrator.process(request);

    const responseData = {
      success: response.success,
      model_used: response.model_used,
      tier_used: response.tier_used,
      response: response.response_text,
      result: response.response_text, // 🆕 alias for compatibility
      conversation_id: conversation_id, // 🆕 会話ID返却
      metadata: {
        ...response.metadata,
        cost_info: response.cost_info,
        performance_info: response.performance_info
      },
      ...(response.error && { error: response.error })
    };

    console.log(`📤 Response sent - Model: ${response.model_used}, Success: ${response.success}, Cost: $${response.cost_info.total_cost_usd.toFixed(4)}`);

    return res.status(response.success ? 200 : 500).json(responseData);

  } catch (error) {
    console.error('❌ Error in /generate endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 ログ解析診断エンドポイント
app.post('/analyze-logs', async (req, res) => {
  try {
    const {
      user_command,
      error_output,
      system_context,
      log_files,
      environment_info
    } = req.body;

    // 入力検証
    if (!user_command || typeof user_command !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'user_command is required and must be a string'
      });
    }

    if (!error_output || typeof error_output !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'error_output is required and must be a string'
      });
    }

    const logRequest: LogAnalysisRequest = {
      user_command,
      error_output,
      system_context,
      log_files,
      environment_info
    };

    console.log(`\n🔍 Log analysis request received`);
    console.log(`📝 Command: ${user_command}`);
    console.log(`❌ Error: ${error_output.substring(0, 100)}${error_output.length > 100 ? '...' : ''}`);

    // ログ解析実行
    const analysisPlan = await logAnalysisService.analyzeLog(logRequest);

    // 高度なLLM処理が必要な場合は、オーケストレーターに委譲
    const detailedPrompt = `
Please provide detailed troubleshooting assistance for the following system issue:

**User Command:** ${user_command}
**Error Output:** ${error_output}
**System Context:** ${system_context || 'Not provided'}

**Analysis Results:**
- Intent: ${analysisPlan.identified_intent}
- Error Type: ${analysisPlan.error_classification.error_type}
- Severity: ${analysisPlan.error_classification.severity}
- Root Causes: ${analysisPlan.root_cause_hypothesis.join('; ')}
- Strategy: ${analysisPlan.solution_strategy}

Please provide:
1. Detailed step-by-step resolution procedure
2. Specific commands to execute with explanations
3. Prevention measures for the future
4. Alternative approaches if the primary solution fails

Focus on practical, executable solutions for system administrators.
`;

    const llmRequest: LLMRequest = {
      prompt: detailedPrompt,
      task_type: analysisPlan.routing_decision.task_type,
      user_metadata: {
        priority: analysisPlan.urgency_level >= 4 ? 'critical' : 'high',
        endpoint: 'analyze-logs'
      }
    };

    const llmResponse = await orchestrator.process(llmRequest);

    const responseData = {
      success: true,
      analysis: analysisPlan,
      detailed_solution: llmResponse.response_text,
      model_used: llmResponse.model_used,
      tier_used: llmResponse.tier_used,
      metadata: {
        urgency_level: analysisPlan.urgency_level,
        error_classification: analysisPlan.error_classification,
        recommended_commands: analysisPlan.recommended_commands,
        routing_reasoning: analysisPlan.routing_decision.reasoning,
        cost_info: llmResponse.cost_info,
        performance_info: llmResponse.performance_info
      }
    };

    console.log(`🎯 Log analysis completed - Model: ${llmResponse.model_used}, Urgency: ${analysisPlan.urgency_level}/5`);

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ Error in /analyze-logs endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Log analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 インタラクティブトラブルシューティング開始
app.post('/troubleshoot/start', async (req, res) => {
  try {
    const { problem_description, user_id } = req.body;

    if (!problem_description || typeof problem_description !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'problem_description is required and must be a string'
      });
    }

    console.log(`\n🚀 Starting troubleshooting session`);
    console.log(`📝 Problem: ${problem_description.substring(0, 100)}...`);

    const response = await interactiveTroubleshooter.startTroubleshootingSession(
      problem_description,
      user_id
    );

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ Error in /troubleshoot/start endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start troubleshooting session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 ユーザー回答処理
app.post('/troubleshoot/answer', async (req, res) => {
  try {
    const { session_id, question_id, answer } = req.body;

    if (!session_id || !question_id || !answer) {
      return res.status(400).json({
        success: false,
        error: 'session_id, question_id, and answer are required'
      });
    }

    console.log(`\n💬 Processing answer for session ${session_id}`);
    console.log(`❓ Question: ${question_id}`);
    console.log(`📝 Answer: ${answer.substring(0, 100)}...`);

    const response = await interactiveTroubleshooter.processUserResponse(
      session_id,
      question_id,
      answer
    );

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ Error in /troubleshoot/answer endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process answer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 診断実行
app.post('/troubleshoot/diagnose', async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id is required'
      });
    }

    console.log(`\n🔬 Performing diagnosis for session ${session_id}`);

    const response = await interactiveTroubleshooter.performDiagnosis(session_id);

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ Error in /troubleshoot/diagnose endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to perform diagnosis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 解決プロセス開始
app.post('/troubleshoot/resolve', async (req, res) => {
  try {
    const { session_id, approved_actions } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id is required'
      });
    }

    console.log(`\n🔧 Starting resolution for session ${session_id}`);

    const response = await interactiveTroubleshooter.startResolution(
      session_id,
      approved_actions
    );

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ Error in /troubleshoot/resolve endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start resolution',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 セッション状態取得
app.get('/troubleshoot/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log(`\n📋 Getting session status: ${sessionId}`);

    const session = interactiveTroubleshooter.getSessionStatus(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.status(200).json({
      success: true,
      session: session
    });

  } catch (error) {
    console.error('❌ Error in /troubleshoot/session endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get session status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 アクティブセッション一覧
app.get('/troubleshoot/sessions', async (req, res) => {
  try {
    const { user_id } = req.query;

    console.log(`\n📂 Getting active sessions${user_id ? ` for user ${user_id}` : ''}`);

    const sessions = interactiveTroubleshooter.getActiveSessions(
      user_id as string | undefined
    );

    return res.status(200).json({
      success: true,
      sessions: sessions,
      total: sessions.length
    });

  } catch (error) {
    console.error('❌ Error in /troubleshoot/sessions endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get active sessions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🆕 高度ログ解析（AdvancedLogAnalyzer使用）
app.post('/troubleshoot/analyze-advanced', async (req, res) => {
  try {
    const { raw_logs, context } = req.body;

    if (!raw_logs || typeof raw_logs !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'raw_logs is required and must be a string'
      });
    }

    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'context is required and must be an object'
      });
    }

    console.log(`\n🧠 Advanced log analysis requested`);
    console.log(`📊 Log size: ${raw_logs.length} characters`);
    console.log(`🔍 Context: ${context.description || context.user_description || 'No description'}...`);

    // contextを正しい形式に変換
    const analysisContext: any = {
      user_description: context.description || context.user_description || 'User provided logs for analysis',
      environment: context.environment || {},
      timeline: context.timeline || {},
      system_info: {
        error_frequency: context.urgency === 'high' ? 'continuous' : 'intermittent',
        user_impact: context.urgency === 'high' ? 'critical' : 'minor',
        services_affected: context.system_type ? [context.system_type] : []
      }
    };

    const diagnosis = await advancedLogAnalyzer.analyzeUserLogs(raw_logs, analysisContext);

    return res.status(200).json({
      success: true,
      diagnosis: diagnosis,
      analysis_timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /troubleshoot/analyze-advanced endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Advanced log analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Qwen3 Coder専用エンドポイント
app.post('/code', async (req, res) => {
  try {
    const { task, language = 'python', include_tests = false } = req.body;

    if (!task || typeof task !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Task is required and must be a string'
      });
    }

    const codePrompt = `Generate ${language} code for: ${task}${include_tests ? ' (include tests)' : ''}`;

    const request: LLMRequest = {
      prompt: codePrompt,
      task_type: 'coding',
      preferred_tier: 0, // Force Tier 0 (Qwen3 Coder)
      user_metadata: { 
        language,
        include_tests,
        endpoint: 'code'
      }
    };

    const response = await orchestrator.process(request);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      code: response.response_text,
      language,
      model_used: response.model_used,
      metadata: response.metadata,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /code endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Code generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Vector Storage専用エンドポイント群

// RAG検索エンドポイント
app.post('/rag/search', async (req, res) => {
  try {
    const { query, max_results = 5, relevance_threshold = 0.7, context_window_size = 4000 } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    const ragRequest = {
      query,
      max_results,
      relevance_threshold,
      context_window_size
    };

    const request: LLMRequest = {
      prompt: JSON.stringify(ragRequest),
      task_type: 'rag_search',
      user_metadata: {
        endpoint: 'rag_search',
        ...req.body.user_metadata
      }
    };

    const response = await orchestrator.process(request);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      data: response.response_text ? JSON.parse(response.response_text) : null,
      model_used: response.model_used,
      cost_info: response.cost_info,
      performance_info: response.performance_info,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /rag/search endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'RAG search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OpenAI Assistant API - File Search機能
app.post('/assistant/file-search', async (req, res) => {
  try {
    const { query, file_paths, thread_id, additional_instructions } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    const request: LLMRequest = {
      prompt: query,
      task_type: 'file_search',
      user_metadata: {
        endpoint: 'assistant_file_search',
        file_count: file_paths?.length || 0,
        ...req.body.user_metadata
      }
    };

    // AssistantRequestの追加プロパティ
    if (file_paths) (request as any).files = file_paths.map((path: string) => ({ file_path: path }));
    if (thread_id) (request as any).thread_id = thread_id;
    if (additional_instructions) (request as any).additional_instructions = additional_instructions;

    const response = await orchestrator.process(request);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      answer: response.response_text,
      model_used: response.model_used,
      cost_info: response.cost_info,
      performance_info: response.performance_info,
      thread_id: (response as any).thread_id,
      files_used: (response as any).files_used,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /assistant/file-search endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'File search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OpenAI Assistant API - Code Interpreter機能
app.post('/assistant/code-interpreter', async (req, res) => {
  try {
    const { query, code_context, thread_id, additional_instructions } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    const enhancedPrompt = code_context 
      ? `${query}\n\n関連コンテキスト:\n${code_context}`
      : query;

    const request: LLMRequest = {
      prompt: enhancedPrompt,
      task_type: 'code_interpreter',
      user_metadata: {
        endpoint: 'assistant_code_interpreter',
        has_context: !!code_context,
        ...req.body.user_metadata
      }
    };

    // AssistantRequestの追加プロパティ
    if (thread_id) (request as any).thread_id = thread_id;
    if (additional_instructions) (request as any).additional_instructions = additional_instructions;

    const response = await orchestrator.process(request);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      result: response.response_text,
      model_used: response.model_used,
      cost_info: response.cost_info,
      performance_info: response.performance_info,
      thread_id: (response as any).thread_id,
      tools_used: (response as any).tools_used,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /assistant/code-interpreter endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Code interpreter failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OpenAI Assistant API - 汎用アシスタント機能
app.post('/assistant/chat', async (req, res) => {
  try {
    const { message, thread_id, assistant_id, file_paths, additional_instructions } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string'
      });
    }

    const request: LLMRequest = {
      prompt: message,
      task_type: 'general_assistant',
      user_metadata: {
        endpoint: 'assistant_chat',
        has_files: !!(file_paths?.length),
        ...req.body.user_metadata
      }
    };

    // AssistantRequestの追加プロパティ
    if (file_paths) (request as any).files = file_paths.map((path: string) => ({ file_path: path }));
    if (thread_id) (request as any).thread_id = thread_id;
    if (assistant_id) (request as any).assistant_id = assistant_id;
    if (additional_instructions) (request as any).additional_instructions = additional_instructions;

    const response = await orchestrator.process(request);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      message: response.response_text,
      model_used: response.model_used,
      cost_info: response.cost_info,
      performance_info: response.performance_info,
      thread_id: (response as any).thread_id,
      assistant_id: (response as any).assistant_id,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /assistant/chat endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Assistant chat failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// メトリクスリセット（開発/テスト用）
app.post('/reset-metrics', (req, res) => {
  try {
    orchestrator.resetMetrics();
    res.json({
      success: true,
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// AI推論インターフェースエンドポイント
// ============================================

// 統計情報キャッシュ
let statsCache: { ai: any; tools: any; timestamp: number } | null = null;
const STATS_CACHE_TTL = 10000; // 10秒キャッシュ

// AI Interface統計情報取得
app.get('/ai/stats', async (req, res) => {
  try {
    // 高速化: キャッシュチェック
    const now = Date.now();
    if (statsCache && (now - statsCache.timestamp) < STATS_CACHE_TTL) {
      res.json({
        ...statsCache.ai,
        cached: true,
        cache_age_ms: now - statsCache.timestamp
      });
      return;
    }

    const aiStats = await toolOrchestrator.getToolStats();
    const responseData = {
      success: true,
      data: {
        ai_interfaces: aiStats.ai_interfaces,
        active_sessions: aiStats.active_sessions,
        total_ai_interfaces: Object.values(aiStats.ai_interfaces).filter(Boolean).length
      },
      cached: false
    };

    // キャッシュ更新
    if (!statsCache) {
      statsCache = { ai: responseData, tools: null, timestamp: now };
    } else {
      statsCache.ai = responseData;
      statsCache.timestamp = now;
    }

    res.json(responseData);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get AI interface stats',
      details: error instanceof Error ? error.message : 'Unknown error',
      cached: false
    });
  }
});

// Gemini AI Interface実行
app.post('/ai/gemini', async (req, res) => {
  try {
    const { prompt, model, sandbox, interactive, yolo, all_files, debug } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }

    const cliRequest: CLIRequest = {
      interface_type: 'gemini_cli',
      prompt,
      options: {
        model,
        sandbox: Boolean(sandbox),
        interactive: Boolean(interactive), 
        yolo: Boolean(yolo),
        all_files: Boolean(all_files),
        debug: Boolean(debug)
      },
      context: {
        working_dir: process.cwd()
      }
    };

    console.log(`[API] Gemini AI request: ${prompt.substring(0, 100)}...`);
    const response = await toolOrchestrator.processAIRequest(cliRequest);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      interface_used: response.interface_used,
      response_text: response.response_text,
      metadata: response.metadata,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /ai/gemini endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Gemini AI execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Claude AI Interface実行
app.post('/ai/claude', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }

    const cliRequest: CLIRequest = {
      interface_type: 'claude_code',
      prompt,
      context: {
        working_dir: process.cwd()
      }
    };

    console.log(`[API] Claude AI request: ${prompt.substring(0, 100)}...`);
    const response = await toolOrchestrator.processAIRequest(cliRequest);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      interface_used: response.interface_used,
      response_text: response.response_text,
      metadata: response.metadata,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /ai/claude endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Claude AI execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// 分析ツールエンドポイント
// ============================================

// Context7 プロジェクト分析ツール実行
app.post('/tools/context7', async (req, res) => {
  try {
    const { query, project_identifier, output_format, max_tokens } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    const analysisRequest: AnalysisToolRequest = {
      tool_type: 'context7',
      command: query,
      args: [project_identifier || '.'],
      options: {
        output_format: output_format === 'json' ? 'json' : 'txt',
        working_dir: process.cwd()
      }
    };

    console.log(`[API] Context7 analysis request: ${query.substring(0, 100)}...`);
    const response = await toolOrchestrator.processAnalysisRequest(analysisRequest);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      tool_used: response.tool_used,
      result: response.result,
      metadata: response.metadata,
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /tools/context7 endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Context7 analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 分析ツール統計情報取得
app.get('/tools/stats', async (req, res) => {
  try {
    // 高速化: キャッシュチェック
    const now = Date.now();
    if (statsCache && statsCache.tools && (now - statsCache.timestamp) < STATS_CACHE_TTL) {
      res.json({
        ...statsCache.tools,
        cached: true,
        cache_age_ms: now - statsCache.timestamp
      });
      return;
    }

    const toolStats = await toolOrchestrator.getToolStats();
    const responseData = {
      success: true,
      data: {
        analysis_tools: toolStats.analysis_tools,
        total_analysis_tools: Object.values(toolStats.analysis_tools).filter(Boolean).length
      },
      cached: false
    };

    // キャッシュ更新
    if (!statsCache) {
      statsCache = { ai: null, tools: responseData, timestamp: now };
    } else {
      statsCache.tools = responseData;
      statsCache.timestamp = now;
    }

    res.json(responseData);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get analysis tool stats',
      details: error instanceof Error ? error.message : 'Unknown error',
      cached: false
    });
  }
});

// 最適AIインターフェース自動選択実行
app.post('/ai/auto', async (req, res) => {
  try {
    const { 
      prompt, 
      coding_focused, 
      interactive_preferred, 
      sandbox_required, 
      context_analysis,
      encryption_required 
    } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }

    // 最適なAIインターフェースを自動選択
    const selectedInterface = await toolOrchestrator.selectOptimalAI(prompt, {
      coding_focused: Boolean(coding_focused),
      interactive_preferred: Boolean(interactive_preferred),
      sandbox_required: Boolean(sandbox_required)
    });

    const cliRequest: CLIRequest = {
      interface_type: selectedInterface,
      prompt,
      options: {
        sandbox: Boolean(sandbox_required),
        interactive: Boolean(interactive_preferred)
      },
      context: {
        working_dir: process.cwd()
      }
    };

    console.log(`[API] Auto AI request (${selectedInterface}): ${prompt.substring(0, 100)}...`);
    const response = await toolOrchestrator.processAIRequest(cliRequest);

    return res.status(response.success ? 200 : 500).json({
      success: response.success,
      interface_used: response.interface_used,
      response_text: response.response_text,
      metadata: {
        ...response.metadata,
        auto_selected_interface: selectedInterface,
        selection_reason: `Auto-selected ${selectedInterface} based on preferences`
      },
      ...(response.error && { error: response.error })
    });

  } catch (error) {
    console.error('❌ Error in /ai/auto endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Auto AI interface selection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 404 ハンドラー
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /health',
      'GET /info', 
      'GET /metrics',
      'POST /generate',
      'POST /code',
      'POST /rag/search',
      'POST /assistant/file-search',
      'POST /assistant/code-interpreter',
      'POST /assistant/chat',
      'POST /reset-metrics',
      'GET /ai/stats',
      'POST /ai/claude',
      'POST /ai/gemini',
      'POST /ai/auto',
      'GET /tools/stats',
      'POST /tools/context7'
    ]
  });
});

// エラーハンドラー
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🔥 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 管理者認証ミドルウェア
const adminAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  // 基本的な認証チェック（実際の実装ではより堅牢な認証が必要）
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  // 簡単なトークン検証（本来はより堅牢な検証が必要）
  const token = authHeader.substring(7);
  if (token !== 'admin_authenticated') {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  
  next();
};

// 管理者認証エンドポイント
adminApp.post('/admin/auth', (req, res) => {
  const { password } = req.body;
  
  // 簡単なパスワード認証（実際の実装ではハッシュ化されたパスワードを使用）
  if (password === process.env.ADMIN_PASSWORD || password === 'advsec_admin_2025') {
    res.json({ token: 'admin_authenticated', expires_in: 3600 });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// 管理者専用エンドポイント
adminApp.get('/admin/sessions', adminAuthMiddleware, (req, res) => {
  // デモ用のセッションデータ
  const sessions = [
    {
      id: 'sess_001',
      ip_address: '192.168.1.100',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      last_activity: new Date(Date.now() - 300000).toISOString(),
      status: 'active'
    },
    {
      id: 'sess_002', 
      ip_address: '203.104.209.102',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      last_activity: new Date(Date.now() - 600000).toISOString(),
      status: 'inactive'
    }
  ];
  res.json(sessions);
});

adminApp.get('/admin/troubleshooting-logs', adminAuthMiddleware, (req, res) => {
  // デモ用のログデータ
  const logs = [
    {
      timestamp: new Date().toISOString(),
      severity: 'critical',
      session_id: 'sess_001',
      problem_description: 'PostgreSQL connection failed',
      resolution_status: 'resolved',
      actions_taken: ['Restart PostgreSQL service', 'Update connection pool']
    },
    {
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      severity: 'high',
      session_id: 'sess_002',
      problem_description: 'High memory usage detected',
      resolution_status: 'investigating',
      actions_taken: ['Memory analysis', 'Process monitoring']
    }
  ];
  res.json(logs);
});

// サーバー起動
let userServer: any;
let adminServer: any;

if (sslOptions) {
  // HTTPS（本番モード）
  userServer = https.createServer(sslOptions, app);
  adminServer = https.createServer(sslOptions, adminApp);
  
  userServer.listen(userPort, '0.0.0.0', () => {
    console.log('\n🌟 =====================================');
    console.log('🚀 一般ユーザ向けサービス (HTTPS)');
    console.log('🌟 =====================================');
    console.log(`📡 Server: https://www.advsec.co.jp:${userPort}`);
    console.log(`🔍 Health: https://www.advsec.co.jp:${userPort}/health`);
    console.log(`📊 Metrics: https://www.advsec.co.jp:${userPort}/metrics`);
    console.log('\n🎯 利用可能なエンドポイント:');
    console.log(`   POST /generate - LLM生成リクエスト`);
    console.log(`   POST /analyze-logs - ログ解析`);
    console.log(`   POST /troubleshoot/* - トラブルシューティング関連`);
  });

  adminServer.listen(adminPort, '0.0.0.0', () => {
    console.log('\n🛡️ =====================================');
    console.log('🔐 管理者向けサービス (HTTPS)');
    console.log('🛡️ =====================================');
    console.log(`📡 Admin Server: https://www.advsec.co.jp:${adminPort}/admin`);
    console.log(`🔐 認証が必要です - パスワード: advsec_admin_2025`);
    console.log('\n🎯 管理機能:');
    console.log(`   システム監視・ユーザセッション管理・ログ解析`);
    console.log('\n✨ 両サービスが完全に初期化されました!');
  });
} else {
  // HTTP（開発モード）
  userServer = http.createServer(app);
  adminServer = http.createServer(adminApp);
  
  userServer.listen(userPort, '0.0.0.0', () => {
    console.log('\n🌟 =====================================');
    console.log('🚀 一般ユーザ向けサービス (HTTP - 開発モード)');
    console.log('🌟 =====================================');
    console.log(`📡 Server: http://www.advsec.co.jp:${userPort}`);
    console.log(`🔍 Health: http://www.advsec.co.jp:${userPort}/health`);
    console.log(`📊 Metrics: http://www.advsec.co.jp:${userPort}/metrics`);
    console.log('\n🎯 利用可能なエンドポイント:');
    console.log(`   POST /generate - LLM生成リクエスト`);
    console.log(`   POST /analyze-logs - ログ解析`);
    console.log(`   POST /troubleshoot/* - トラブルシューティング関連`);
  });

  adminServer.listen(adminPort, '0.0.0.0', () => {
    console.log('\n🛡️ =====================================');
    console.log('🔐 管理者向けサービス (HTTP - 開発モード)');
    console.log('🛡️ =====================================');
    console.log(`📡 Admin Server: http://www.advsec.co.jp:${adminPort}/admin`);
    console.log(`🔐 認証が必要です - パスワード: advsec_admin_2025`);
    console.log('\n🎯 管理機能:');
    console.log(`   システム監視・ユーザセッション管理・ログ解析`);
    console.log('\n✨ 両サービスが完全に初期化されました!');
    console.log('\n⚠️  本番環境ではSSL証明書への適切な権限設定が必要です');
  });
}

// 優雅なシャットダウン
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

export { orchestrator };