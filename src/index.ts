import dotenv from 'dotenv';
import express from 'express';
import compression from 'compression';
import { LLMOrchestrator } from './orchestrator/LLMOrchestrator';
import { ToolOrchestratorService, AnalysisToolRequest } from './services/ToolOrchestratorService';
import { CLIRequest } from './services/CLIInterfaceManager';
import { LLMRequest } from './types';

// 環境変数読み込み
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// パフォーマンス最適化ミドルウェア設定
app.use(compression()); // gzip圧縮でレスポンスサイズ削減
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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

try {
  orchestrator = new LLMOrchestrator();
  toolOrchestrator = ToolOrchestratorService.getInstance();
  console.log('🚀 Both LLM and Tool Orchestrators initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize orchestrators:', error);
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
      tier0: { name: "Tier 0 - 無料・最優先", models: [] },
      tier1: { name: "Tier 1 - 高速汎用", models: [] },
      tier2: { name: "Tier 2 - 複雑推論", models: [] },
      tier3: { name: "Tier 3 - 最高品質", models: [] },
      tier4: { name: "Tier 4 - 最高級推論", models: [] }
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

// メインのLLM処理エンドポイント
app.post('/generate', async (req, res) => {
  try {
    const { 
      prompt, 
      task_type, 
      preferred_tier, 
      user_metadata 
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

    const request: LLMRequest = {
      prompt,
      task_type: task_type || 'auto',
      preferred_tier,
      user_metadata: user_metadata || {}
    };

    console.log(`\n📥 New request received: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
    console.log(`📋 Task type: ${request.task_type}, Preferred tier: ${preferred_tier || 'auto'}`);

    const response = await orchestrator.process(request);

    const responseData = {
      success: response.success,
      model_used: response.model_used,
      tier_used: response.tier_used,
      response: response.response_text,
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

// サーバー起動
app.listen(port, () => {
  console.log('\n🌟 =====================================');
  console.log('🚀 5-Tier Hybrid LLM System Server');
  console.log('🌟 =====================================');
  console.log(`📡 Server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   GET    http://localhost:${port}/health`);
  console.log(`   GET    http://localhost:${port}/info`);
  console.log(`   GET    http://localhost:${port}/metrics`);
  console.log(`   POST   http://localhost:${port}/generate`);
  console.log(`   POST   http://localhost:${port}/code`);
  console.log(`   POST   http://localhost:${port}/rag/search`);
  console.log('');
  console.log('🤖 OpenAI Assistant API endpoints:');
  console.log(`   POST   http://localhost:${port}/assistant/file-search`);
  console.log(`   POST   http://localhost:${port}/assistant/code-interpreter`);
  console.log(`   POST   http://localhost:${port}/assistant/chat`);
  console.log(`   POST   http://localhost:${port}/reset-metrics`);
  console.log('');
  console.log('🤖 AI Interface endpoints:');
  console.log(`   GET    http://localhost:${port}/ai/stats`);
  console.log(`   POST   http://localhost:${port}/ai/claude`);
  console.log(`   POST   http://localhost:${port}/ai/gemini`);
  console.log(`   POST   http://localhost:${port}/ai/auto`);
  console.log('');
  console.log('🔍 Analysis Tool endpoints:');
  console.log(`   GET    http://localhost:${port}/tools/stats`);
  console.log(`   POST   http://localhost:${port}/tools/context7`);
  console.log('\n🆕 NEW: Vector Storage & RAG capabilities added!');
  console.log('\n💡 Tier Priority: 0 (Qwen3 Coder) → 1 (Gemini Flash) → 2 (Claude) → 3 (Premium)');
  console.log('🌟 =====================================\n');
});

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