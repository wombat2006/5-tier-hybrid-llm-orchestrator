import dotenv from 'dotenv';
import express from 'express';
import { LLMOrchestrator } from './orchestrator/LLMOrchestrator';
import { LLMRequest } from './types';

// 環境変数読み込み
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// ミドルウェア設定
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

try {
  orchestrator = new LLMOrchestrator();
  console.log('🚀 LLM Orchestrator initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize LLM Orchestrator:', error);
  process.exit(1);
}

// ルート定義

// ヘルスチェック
app.get('/health', async (req, res) => {
  try {
    const healthCheck = await orchestrator.healthCheck();
    res.status(healthCheck.healthy ? 200 : 503).json({
      success: healthCheck.healthy,
      timestamp: new Date().toISOString(),
      details: healthCheck.details
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
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
      'POST /reset-metrics'
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