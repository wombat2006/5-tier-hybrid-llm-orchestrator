import { 
  SystemConfig,
  LLMRequest,
  LLMResponse,
  BaseLLMClient,
  TaskType,
  ModelConfig,
  CollaborationRequest,
  CollaborationResponse,
  SystemMetrics
} from '../types';
import { ClaudeCodeQueryAnalyzer, ModelSuitabilityAnalyzer, QueryAnalysis } from '../analysis/QueryAnalyzer';
import { ContextAwareQueryAnalyzer } from '../analysis/ContextAwareQueryAnalyzer';
import { 
  Subtask, 
  DecompositionRequest, 
  DecompositionResult, 
  CollaborativeConfig, 
  CodingSession, 
  CodeResult,
  SubtaskStatus
} from '../types/collaborative';
import { ConfigLoader } from '../utils/ConfigLoader';
import { QwenCoderAPIClient } from '../clients/QwenCoderClient';
import { OpenRouterAPIClient } from '../clients/OpenRouterClient';
import { GeminiAPIClient } from '../clients/GeminiClient';
import { MockQwenClient } from '../clients/MockQwenClient';
import { AnthropicAPIClient } from '../clients/AnthropicClient';
import { OpenAIAPIClient } from '../clients/OpenAIClient';
import { OpenRouterModelRegistry } from '../services/OpenRouterModelRegistry';
import { ModelAliasResolver } from '../services/ModelAliasResolver';
// CLI関連のimportを削除 - ToolOrchestratorServiceに移行
import { TaskDecomposer } from '../pipeline/TaskDecomposer';
import { DifficultyClassifier } from '../pipeline/DifficultyClassifier';
import { QualityGate } from '../pipeline/QualityGate';
import { PrecisionCostManagementSystem } from '../management/CostManagementSystem';
import { CostManagementSystem, TokenUsage } from '../types/cost-management';
import { DefaultCapabilityRegistry } from '../services/CapabilityRegistry';
import { CapabilityRegistry, CapabilityProvider } from '../types/capability';
import { ConversationManager } from '../services/ConversationManager';
import { OpenAIAssistantProvider } from '../services/OpenAIAssistantProvider';
import { AssistantConfig } from '../types/assistant';
import RedisLogger, { QueryAnalysisLog } from '../utils/RedisLogger';
import UpstashRedisLogger from '../utils/UpstashRedisLogger';
import LogAnalysisService, { LogAnalysisRequest } from '../services/LogAnalysisService';
import InteractiveTroubleshooter from '../services/InteractiveTroubleshooter';
import AdvancedLogAnalyzer, { LogAnalysisContext } from '../services/AdvancedLogAnalyzer';
import SafeExecutionManager from '../services/SafeExecutionManager';

export class LLMOrchestrator {
  private config: SystemConfig;
  private clients: Map<string, BaseLLMClient> = new Map();
  private metrics: SystemMetrics = {
    requests_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
    success_rate_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
    average_latency_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
    cost_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
    total_monthly_spend: 0,
    budget_utilization_percentage: 0,
    most_used_capabilities: [],
    error_distribution: {}
  };
  private monthlySpend: number = 0;
  private requestCount: number = 0;
  
  // 協調フローコンポーネント
  private taskDecomposer!: TaskDecomposer;
  private difficultyClassifier!: DifficultyClassifier;
  private qualityGate!: QualityGate;
  private collaborativeConfig!: CollaborativeConfig;
  private activeSessions: Map<string, CodingSession> = new Map();
  
  // IT Troubleshooting Services
  private logAnalysisService!: LogAnalysisService;
  private interactiveTroubleshooter!: InteractiveTroubleshooter;
  private advancedLogAnalyzer!: AdvancedLogAnalyzer;
  private safeExecutionManager!: SafeExecutionManager;
  
  // コスト管理システム
  private costManagement!: CostManagementSystem;
  
  // Capability管理システム
  private capabilityRegistry!: CapabilityRegistry;
  
  // OpenRouter Model Registry
  private openRouterRegistry: OpenRouterModelRegistry | undefined;
  
  // Model Alias Resolver（公式エイリアス対応）
  private aliasResolver!: ModelAliasResolver;
  
  // 知的分析システム（Claude Code主導）
  private queryAnalyzer!: ClaudeCodeQueryAnalyzer;
  private contextAwareAnalyzer!: ContextAwareQueryAnalyzer;
  private suitabilityAnalyzer!: ModelSuitabilityAnalyzer;
  
  // Redis統合ログシステム（Upstash対応）
  private redisLogger!: RedisLogger | UpstashRedisLogger;
  
  // 会話コンテキスト管理システム
  private conversationManager!: ConversationManager;
  
  // CLI Interface Manager removed - moved to ToolOrchestratorService

  constructor(configPath?: string) {
    console.log('[LLMOrchestrator] Initializing 5-Tier Hybrid LLM System with Collaborative Coding...');
    
    const configLoader = ConfigLoader.getInstance();
    this.config = configLoader.loadConfig(configPath);
    
    // 環境変数検証
    const envCheck = configLoader.validateEnvironmentVariables();
    if (!envCheck.valid) {
      console.warn('[LLMOrchestrator] Missing environment variables:', envCheck.missingVars);
    }
    if (envCheck.warnings.length > 0) {
      console.warn('[LLMOrchestrator] Environment warnings:', envCheck.warnings);
    }

    this.initializeAliasResolver();
    // CLI Manager initialization moved to ToolOrchestratorService
    this.initializeOpenRouterRegistry();
    this.initializeClients();
    this.initializeMetrics();
    this.initializeIntelligentAnalyzer();
    this.initializeCollaborativeComponents();
    this.initializeCapabilityRegistry();
    
    // Redis統合ログシステム初期化
    this.initializeRedisLogger();
    
    // 会話コンテキスト管理システム初期化
    this.initializeConversationManager();
    
    // IT Troubleshooting Services 初期化
    this.initializeITTroubleshootingServices();
    
    // コスト管理は非同期で初期化
    this.initializeCostManagement().catch(error => {
      console.warn('[LLMOrchestrator] Cost management initialization failed:', error);
    });
    
    // 日次コスト更新スケジューラー開始
    this.startDailyCostScheduler();
    
    console.log('[LLMOrchestrator] ✅ System initialized successfully');
    this.printSystemSummary();
  }

  private initializeAliasResolver(): void {
    console.log('[LLMOrchestrator] Initializing Model Alias Resolver...');
    
    try {
      this.aliasResolver = ModelAliasResolver.getInstance();
      this.aliasResolver.loadConfig('./config/model-aliases.yaml');
      
      const stats = this.aliasResolver.getStats();
      console.log(`[LLMOrchestrator] ✅ Model Alias Resolver initialized: ${stats.providers} providers, ${stats.total_aliases} aliases, ${stats.official_alias_providers} official`);
      
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Failed to initialize Model Alias Resolver:', error);
      throw error;
    }
  }

  // initializeCLIManager method removed - moved to ToolOrchestratorService

  private initializeClients(): void {
    console.log('[LLMOrchestrator] Initializing API clients...');

    for (const [modelId, modelConfig] of Object.entries(this.config.models)) {
      try {
        let client: BaseLLMClient;
        
        // エイリアス解決でモデル名を取得
        const resolvedModelName = this.aliasResolver.resolveAlias(modelConfig.name);
        console.log(`[LLMOrchestrator] 🔄 Resolved model alias: ${modelConfig.name} → ${resolvedModelName}`);

        switch (modelConfig.provider) {
          case 'alibaba_cloud':
            // 環境変数が不足している場合はMockクライアントを使用
            if (!process.env.ALIBABA_ACCESS_KEY_ID || !process.env.ALIBABA_ACCESS_KEY_SECRET) {
              console.log(`[LLMOrchestrator] 🔄 Using Mock Qwen3 Coder client (missing credentials)`);
              client = new MockQwenClient();
            } else {
              client = new QwenCoderAPIClient();
            }
            console.log(`[LLMOrchestrator] ✅ Qwen3 Coder client initialized (Tier ${modelConfig.tier})`);
            break;
          
          case 'openrouter':
            // OpenRouter経由でQwen3-Coderを使用
            if (!process.env.OPENROUTER_API_KEY) {
              console.log(`[LLMOrchestrator] 🔄 Using Mock Qwen3 Coder client (missing OpenRouter credentials)`);
              client = new MockQwenClient();
            } else {
              client = new OpenRouterAPIClient(resolvedModelName);
            }
            console.log(`[LLMOrchestrator] ✅ OpenRouter Qwen3 Coder client initialized (Tier ${modelConfig.tier})`);
            break;
          
          case 'google':
            client = new GeminiAPIClient(resolvedModelName);
            console.log(`[LLMOrchestrator] ✅ Gemini client initialized: ${resolvedModelName} (Tier ${modelConfig.tier})`);
            break;
          
          case 'anthropic':
            client = new AnthropicAPIClient(resolvedModelName);
            console.log(`[LLMOrchestrator] ✅ Anthropic client initialized: ${resolvedModelName} (${modelId})`);
            break;
          
          case 'openai':
            client = new OpenAIAPIClient(resolvedModelName);
            console.log(`[LLMOrchestrator] ✅ OpenAI client initialized: ${resolvedModelName} (${modelId})`);
            break;
          
          default:
            console.error(`[LLMOrchestrator] ❌ Unknown provider: ${modelConfig.provider} for model ${modelId}`);
            continue;
        }

        this.clients.set(modelId, client);

      } catch (error) {
        console.error(`[LLMOrchestrator] ❌ Failed to initialize client for ${modelId}:`, error);
      }
    }

    // OpenRouter Registry からの動的クライアント初期化
    if (this.openRouterRegistry) {
      this.initializeOpenRouterClients();
    }

    console.log(`[LLMOrchestrator] Initialized ${this.clients.size} total clients`);
  }
  
  private initializeOpenRouterClients(): void {
    if (!this.openRouterRegistry) return;
    
    console.log('[LLMOrchestrator] Initializing OpenRouter dynamic clients...');
    
    try {
      const openRouterModels = this.openRouterRegistry.getAvailableModels();
      let dynamicClientCount = 0;
      
      for (const modelConfig of openRouterModels) {
        try {
          // 既存のクライアントがない場合のみ作成
          if (!this.clients.has(modelConfig.id)) {
            const client = this.openRouterRegistry.getClient(modelConfig.id);
            if (client) {
              this.clients.set(modelConfig.id, client);
              dynamicClientCount++;
              console.log(`[LLMOrchestrator] ✅ OpenRouter client initialized: ${modelConfig.id} (Tier ${modelConfig.tier})`);
            }
          }
        } catch (error) {
          console.warn(`[LLMOrchestrator] ⚠️ Failed to initialize OpenRouter client for ${modelConfig.id}:`, error);
        }
      }
      
      console.log(`[LLMOrchestrator] ✅ Initialized ${dynamicClientCount} OpenRouter dynamic clients`);
      
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Failed to initialize OpenRouter clients:', error);
    }
  }

  private initializeOpenRouterRegistry(): void {
    console.log('[LLMOrchestrator] Initializing OpenRouter Model Registry...');
    
    try {
      if (process.env.OPENROUTER_API_KEY) {
        this.openRouterRegistry = OpenRouterModelRegistry.getInstance();
        // 設定ファイルを読み込み
        const configPath = './config/openrouter-models.yaml';
        this.openRouterRegistry.loadConfig(configPath);
        
        const modelCount = this.openRouterRegistry.getAvailableModels().length;
        console.log(`[LLMOrchestrator] ✅ OpenRouter Model Registry initialized with ${modelCount} models`);
      } else {
        console.warn('[LLMOrchestrator] ⚠️ OpenRouter API key not found - dynamic models will be unavailable');
      }
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Failed to initialize OpenRouter Registry:', error);
      this.openRouterRegistry = undefined;
    }
  }

  private initializeMetrics(): void {
    this.metrics = {
      requests_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
      success_rate_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
      average_latency_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
      cost_per_tier: { 0: 0, 1: 0, 2: 0, 3: 0 },
      total_monthly_spend: 0,
      budget_utilization_percentage: 0,
      most_used_capabilities: [],
      error_distribution: {}
    };
  }

  private initializeIntelligentAnalyzer(): void {
    console.log('[LLMOrchestrator] 🧠 Initializing Claude Code-driven intelligent analysis system...');
    
    this.queryAnalyzer = new ClaudeCodeQueryAnalyzer();
    this.contextAwareAnalyzer = new ContextAwareQueryAnalyzer();
    this.suitabilityAnalyzer = new ModelSuitabilityAnalyzer();
    
    console.log('[LLMOrchestrator] ✅ Intelligent analysis system with context awareness initialized');
  }
  
  private initializeCollaborativeComponents(): void {
    console.log('[LLMOrchestrator] Initializing collaborative coding components...');
    
    // 協調設定の初期化
    this.collaborativeConfig = {
      difficultyThreshold: 0.6, // 60%以上easy判定でQwen3に委任
      maxRetries: 2,
      qcDepth: 'full',
      maxSubtasks: 10,
      enableParallelProcessing: true,
      autoEscalateToClaudeAfterRetries: true,
      qualityThresholds: {
        minScore: 70,
        requiresReview: 85
      }
    };
    
    // パイプラインコンポーネントの初期化
    this.taskDecomposer = new TaskDecomposer(this.collaborativeConfig);
    this.difficultyClassifier = new DifficultyClassifier(this.collaborativeConfig);
    this.qualityGate = new QualityGate(this.collaborativeConfig);
    
    console.log('[LLMOrchestrator] ✅ Collaborative components initialized');
  }
  
  private initializeCapabilityRegistry(): void {
    console.log('[LLMOrchestrator] Initializing capability registry...');
    
    // CapabilityRegistryの初期化
    this.capabilityRegistry = new DefaultCapabilityRegistry();
    
    try {
      // OpenAI Assistant API機能の設定・登録
      if (this.config.external_apis?.openai_assistant) {
        const assistantConfig = this.config.external_apis.openai_assistant;
        
        const assistantProviderConfig: AssistantConfig = {
          openai_api_key: process.env.OPENAI_API_KEY || '',
          model: assistantConfig.model || 'gpt-4o-mini',
          tools: (assistantConfig.tools || [
            { type: 'file_search' },
            { type: 'code_interpreter' }
          ]) as any,
          temperature: assistantConfig.temperature || 0.7,
          max_prompt_tokens: assistantConfig.max_prompt_tokens || 128000,
          max_completion_tokens: assistantConfig.max_completion_tokens || 4096,
          cost_per_1k_input_tokens: assistantConfig.cost_per_1k_input_tokens || 0.15,
          cost_per_1k_output_tokens: assistantConfig.cost_per_1k_output_tokens || 0.60
        };
        
        // OpenAI Assistant Providerの作成・登録
        const assistantProvider = new OpenAIAssistantProvider(assistantProviderConfig);
        
        // 非同期で初期化・登録
        assistantProvider.initialize(assistantProviderConfig).then(() => {
          this.capabilityRegistry.register(assistantProvider);
          console.log('[LLMOrchestrator] ✅ OpenAI Assistant capability registered');
        }).catch(error => {
          console.warn('[LLMOrchestrator] ⚠️ OpenAI Assistant initialization failed:', error);
        });
      }
      
      console.log('[LLMOrchestrator] ✅ Capability registry initialized');
      
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Capability registry initialization failed:', error);
    }
  }

  private initializeRedisLogger(): void {
    console.log('[LLMOrchestrator] Initializing Redis Logger...');
    
    try {
      // Upstash Redis設定を優先的に確認
      const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
      const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      
      if (upstashUrl && upstashToken) {
        console.log('[LLMOrchestrator] 🚀 Using Upstash Redis (cloud-native)');
        this.redisLogger = new UpstashRedisLogger();
        
        // 非同期接続
        this.redisLogger.connect().catch(error => {
          console.warn('[LLMOrchestrator] Upstash Redis connection failed, falling back to local Redis:', error);
          this.fallbackToLocalRedis();
        });
        
        console.log('[LLMOrchestrator] ✅ Upstash Redis Logger initialized');
      } else {
        console.log('[LLMOrchestrator] 📍 Using local Redis (fallback)');
        this.fallbackToLocalRedis();
      }
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Redis Logger initialization failed:', error);
      this.fallbackToLocalRedis();
    }
  }

  private fallbackToLocalRedis(): void {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redisLogger = new RedisLogger(redisUrl);
      
      this.redisLogger.connect().catch(error => {
        console.warn('[LLMOrchestrator] Local Redis connection failed, logging disabled:', error);
      });
      
      console.log('[LLMOrchestrator] ✅ Local Redis Logger initialized');
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Local Redis initialization failed:', error);
    }
  }

  private async initializeCostManagement(): Promise<void> {
    console.log('[LLMOrchestrator] Initializing precision cost management system...');
    
    try {
      // コスト管理システムの初期化
      this.costManagement = new PrecisionCostManagementSystem('./data/cost-management');
      
      // 予算設定の初期化
      const budgetConfig = {
        monthly_budget_usd: this.config.cost_management?.monthly_budget_usd || 70.0,
        warning_threshold: this.config.cost_management?.cost_alerts?.warning_threshold || 0.8,
        critical_threshold: this.config.cost_management?.cost_alerts?.critical_threshold || 0.95,
        auto_pause_at_limit: false,
        max_request_cost_usd: 1.0, // 単一リクエストの最大コスト
        max_session_cost_usd: 5.0, // セッション単位の最大コスト
        budget_reset_day: 1,
        timezone: 'UTC'
      };
      
      await this.costManagement.initialize(budgetConfig);
      
      console.log('[LLMOrchestrator] ✅ Cost management system initialized');
      console.log(`[LLMOrchestrator] 💰 Monthly budget: $${budgetConfig.monthly_budget_usd}`);
      console.log(`[LLMOrchestrator] 🚨 Alert thresholds: ${(budgetConfig.warning_threshold * 100).toFixed(0)}% / ${(budgetConfig.critical_threshold * 100).toFixed(0)}%`);
      
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Failed to initialize cost management:', error);
      // 基本的なモックシステムで続行
      console.log('[LLMOrchestrator] 🔄 Continuing with basic cost tracking...');
    }
  }

  private initializeConversationManager(): void {
    console.log('[LLMOrchestrator] 💬 Initializing Conversation Manager...');
    
    try {
      this.conversationManager = new ConversationManager(this.redisLogger);
      console.log('[LLMOrchestrator] ✅ Conversation Manager initialized with Redis backend');
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Failed to initialize Conversation Manager:', error);
      throw error;
    }
  }

  private initializeITTroubleshootingServices(): void {
    console.log('[LLMOrchestrator] 🔧 Initializing IT Troubleshooting Services...');
    
    try {
      this.logAnalysisService = new LogAnalysisService();
      this.interactiveTroubleshooter = new InteractiveTroubleshooter();
      this.advancedLogAnalyzer = new AdvancedLogAnalyzer();
      this.safeExecutionManager = new SafeExecutionManager();
      
      console.log('[LLMOrchestrator] ✅ IT Troubleshooting Services initialized:');
      console.log('   - Log Analysis Service');
      console.log('   - Interactive Troubleshooter');
      console.log('   - Advanced Log Analyzer');
      console.log('   - Safe Execution Manager');
    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Failed to initialize IT Troubleshooting Services:', error);
      throw error;
    }
  }

  private printSystemSummary(): void {
    console.log('\n🚀 === 5-Tier Hybrid LLM System Summary ===');
    
    const allModels = this.getAvailableModels();
    const modelsByTier: Record<number, ModelConfig[]> = {};
    
    // モデルをTierごとに分類
    for (const model of allModels) {
      if (!modelsByTier[model.tier]) {
        modelsByTier[model.tier] = [];
      }
      modelsByTier[model.tier].push(model);
    }
    
    // Tierごとに表示
    for (let tier = 0; tier <= 3; tier++) {
      const tierModels = modelsByTier[tier] || [];
      if (tierModels.length > 0) {
        console.log(`\nTier ${tier}: ${tierModels.length} models`);
        tierModels.forEach(model => {
          const status = this.clients.has(model.id) ? '✅' : '❌';
          const source = model.api_client === 'UniversalOpenRouterClient' ? '(OpenRouter)' : '(Direct)';
          console.log(`  ${status} ${model.id} ${source} - ${model.capabilities.join(', ')}`);
        });
      }
    }
    
    if (this.openRouterRegistry) {
      const orModels = this.openRouterRegistry.getAvailableModels();
      console.log(`\n🌐 OpenRouter Models: ${orModels.length} available`);
    }
    
    console.log(`\n💰 Monthly Budget: $${this.config.cost_management.monthly_budget_usd}`);
    console.log(`🔄 Collaboration: Cascade=${this.config.collaboration.cascade_enabled}, Refinement=${this.config.collaboration.refinement_enabled}`);
    console.log(`🤝 Collaborative Coding: Enabled with ${this.collaborativeConfig.maxSubtasks} max subtasks`);
    console.log('==========================================\n');
  }

  async process(request: LLMRequest): Promise<LLMResponse> {
    console.log(`\n🚨🚨🚨 [LLMOrchestrator] EMERGENCY TEST - Process method called! 🚨🚨🚨`);
    console.log(`\n[LLMOrchestrator] Processing request: "${request.prompt.substring(0, 100)}${request.prompt.length > 100 ? '...' : ''}"`);
    console.log(`[LLMOrchestrator] Task type: ${request.task_type || 'auto'}`);
    console.log(`[LLMOrchestrator] ***** PROCESS METHOD ENTRY POINT *****`);
    
    this.requestCount++;
    const startTime = Date.now();
    
    // 🆕 会話コンテキストの処理
    let conversationContext = request.context;
    let conversationId: string | undefined;
    
    if (request.user_metadata?.session_id) {
      conversationId = request.user_metadata.session_id;
      console.log(`[LLMOrchestrator] 💬 Using existing conversation: ${conversationId}`);
      
      // 既存会話のコンテキストを取得
      if (!conversationContext) {
        conversationContext = await this.conversationManager.buildConversationContext(conversationId);
        console.log(`[LLMOrchestrator] 📖 Built context with ${conversationContext?.turn_count || 0} turns`);
      }
    }

    // Vector Storage等の新機能リクエストかチェック
    const isCapabilityReq = this.isCapabilityRequest(request);
    console.log(`[LLMOrchestrator] isCapabilityRequest: ${isCapabilityReq}`);
    if (isCapabilityReq) {
      console.log(`[LLMOrchestrator] Routing to capability provider`);
      return this.processWithCapabilityProvider(request);
    }

    // 協調コーディングが必要かどうかを判定
    const shouldUseCollaborativeCoding = this.shouldUseCollaborativeCoding(request);
    console.log(`[LLMOrchestrator] shouldUseCollaborativeCoding: ${shouldUseCollaborativeCoding}`);
    
    if (shouldUseCollaborativeCoding) {
      console.log(`[LLMOrchestrator] 🤝 Routing to collaborative coding pipeline`);
      
      const decompositionRequest: DecompositionRequest = {
        originalPrompt: request.prompt,
        targetLanguage: this.extractTargetLanguage(request.prompt),
        complexityPreference: 'balanced',
        maxSubtasks: this.collaborativeConfig.maxSubtasks,
        context: typeof request.context === 'string' ? request.context : undefined
      };
      
      try {
        const session = await this.processCollaborativeCoding(decompositionRequest);
        
        // CodingSessionをLLMResponseに変換
        return this.convertSessionToResponse(session, startTime);
        
      } catch (error) {
        console.warn(`[LLMOrchestrator] Collaborative coding failed, falling back to standard processing:`, error);
        // フォールバックして通常処理を実行
      }
    }

    try {
      // 1. 🆕 コンテキスト考慮型の知的タスク分析
      console.log(`[LLMOrchestrator] 🔍 DETAILED DEBUG - Request task_type: ${request.task_type}`);
      console.log(`[LLMOrchestrator] 🔍 DETAILED DEBUG - Request prompt (first 50 chars): ${request.prompt.substring(0, 50)}`);
      
      let { taskType, analysis } = await this.classifyTaskIntelligently(request);
      
      // 🆕 会話コンテキストがある場合は、コンテキスト考慮分析を実行
      if (conversationContext) {
        console.log(`[LLMOrchestrator] 🧠 Performing context-aware analysis...`);
        analysis = await this.contextAwareAnalyzer.analyzeWithContext(request, conversationContext);
        
        // 複雑度エスカレーションによるタスクタイプ再分類
        if (analysis.context_factors?.complexity_escalation && analysis.context_factors.complexity_escalation > 1.5) {
          const escalatedTaskType = this.escalateTaskType(taskType);
          if (escalatedTaskType !== taskType) {
            console.log(`[LLMOrchestrator] ⬆️ Task type escalated: ${taskType} → ${escalatedTaskType}`);
            taskType = escalatedTaskType;
          }
        }
      }
      
      console.log(`[LLMOrchestrator] 🎯 Task intelligently classified as: ${taskType}`);

      // 2. 知的モデル選択（分析結果を活用）
      console.log(`[LLMOrchestrator] 🔄 About to call intelligent model selection with analysis...`);
      const selectedModel = await this.selectBestModelIntelligently(request, taskType, analysis);
      console.log(`[LLMOrchestrator] ✅ Selected model: ${selectedModel.id} (Tier ${selectedModel.tier})`);

      // 3. クエリ分析トレースログ（Redis）
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.logQueryAnalysis(requestId, request, analysis, selectedModel, taskType);

      // 4. 予算チェック
      if (!this.checkBudget(selectedModel)) {
        console.warn('[LLMOrchestrator] Budget exceeded, attempting fallback...');
        const fallbackModel = this.selectFallbackModel(selectedModel);
        if (!fallbackModel) {
          throw new Error('Budget exceeded and no fallback available');
        }
        return this.executeRequest(request, fallbackModel);
      }

      // 5. リクエスト実行
      const response = await this.executeRequest(request, selectedModel);

      // 6. 品質評価とカスケード判定
      if (this.shouldCascade(response, selectedModel)) {
        console.log('[LLMOrchestrator] Quality threshold not met, cascading to higher tier...');
        const cascadedResponse = await this.cascadeToHigherTier(request, selectedModel, response);
        
        // カスケード後も会話履歴に記録
        if (conversationId && cascadedResponse.success) {
          try {
            await this.conversationManager.addTurn(conversationId, request, cascadedResponse);
            console.log(`[LLMOrchestrator] 💾 Cascaded turn saved to conversation ${conversationId}`);
          } catch (convError) {
            console.warn(`[LLMOrchestrator] ⚠️ Failed to save cascaded conversation turn:`, convError);
          }
        }
        
        return cascadedResponse;
      }

      // 7. 洗練化判定
      if (this.shouldRefine(response, selectedModel)) {
        console.log('[LLMOrchestrator] Applying refinement with higher tier model...');
        const refinedResponse = await this.refineWithHigherTier(request, response);
        
        // 洗練化後も会話履歴に記録
        if (conversationId && refinedResponse.success) {
          try {
            await this.conversationManager.addTurn(conversationId, request, refinedResponse);
            console.log(`[LLMOrchestrator] 💾 Refined turn saved to conversation ${conversationId}`);
          } catch (convError) {
            console.warn(`[LLMOrchestrator] ⚠️ Failed to save refined conversation turn:`, convError);
          }
        }
        
        return refinedResponse;
      }

      // 🆕 会話履歴に記録（成功時のみ）
      if (conversationId && response.success) {
        try {
          await this.conversationManager.addTurn(conversationId, request, response);
          console.log(`[LLMOrchestrator] 💾 Turn saved to conversation ${conversationId}`);
        } catch (convError) {
          console.warn(`[LLMOrchestrator] ⚠️ Failed to save conversation turn:`, convError);
        }
      }
      
      console.log(`[LLMOrchestrator] ✅ Request completed successfully with ${selectedModel.id}`);
      return response;

    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Request failed:', error);
      
      const errorResponse: LLMResponse = {
        success: false,
        model_used: 'orchestrator_error',
        tier_used: -1,
        error: {
          code: 'ORCHESTRATOR_ERROR',
          message: error instanceof Error ? error.message : 'Unknown orchestrator error'
        },
        metadata: {
          model_id: 'orchestrator_error',
          provider: 'system',
          tokens_used: { input: 0, output: 0, total: 0 },
          generated_at: new Date().toISOString(),
          tier_used: -1,
          processing_time_ms: 0,
          estimated_complexity: 0
        },
        cost_info: {
          total_cost_usd: 0,
          input_cost_usd: 0,
          output_cost_usd: 0
        },
        performance_info: {
          latency_ms: Date.now() - startTime,
          processing_time_ms: Date.now() - startTime,
          fallback_used: false
        }
      };

      return errorResponse;
    }
  }

  /**
   * Claude Code主導の知的タスク分類
   * 従来の単純キーワードマッチングから、多次元的意図理解へ進化
   */
  private async classifyTaskIntelligently(request: LLMRequest): Promise<{taskType: TaskType, analysis: QueryAnalysis}> {
    // ユーザー明示的指定が最優先
    if (request.task_type && request.task_type !== 'auto') {
      console.log(`[LLMOrchestrator] 👤 User specified task type: ${request.task_type}`);
      
      // 明示的指定でも分析を実行（品質向上のため）
      const analysis = await this.queryAnalyzer.analyzeQuery(request.prompt, { userSpecified: true });
      return { taskType: request.task_type, analysis };
    }

    console.log(`[LLMOrchestrator] 🧠 Performing Claude Code intelligent analysis...`);
    
    // Claude Codeによる深層分析
    const analysis = await this.queryAnalyzer.analyzeQuery(request.prompt, request);
    
    // 分析結果に基づくタスクタイプ決定
    const taskType = this.determineTaskTypeFromAnalysis(analysis, request.prompt);
    
    console.log(`[LLMOrchestrator] 📊 Intelligence Analysis Result:`);
    console.log(`  🎯 Task Type: ${taskType}`);
    console.log(`  🔬 Complexity: ${analysis.complexity}`);
    console.log(`  🏷️  Domain: ${analysis.domain.join(', ')}`);
    console.log(`  🧮 Required Capabilities: ${analysis.requiredCapabilities.join(', ')}`);
    console.log(`  ⚡ Priority Balance: Accuracy=${(analysis.priorityBalance.accuracy*100).toFixed(0)}% Speed=${(analysis.priorityBalance.speed*100).toFixed(0)}% Cost=${(analysis.priorityBalance.cost*100).toFixed(0)}%`);
    console.log(`  🎨 Creativity Level: ${analysis.creativityLevel}`);
    console.log(`  💭 Reasoning Depth: ${analysis.reasoningDepth}`);
    console.log(`  ⏱️  Est. Processing: ${analysis.estimatedProcessingTime.toFixed(1)}s`);
    console.log(`  🎪 Confidence: ${(analysis.confidenceScore*100).toFixed(1)}%`);
    
    return { taskType, analysis };
  }

  /**
   * 分析結果からタスクタイプを決定する知的ロジック
   */
  private determineTaskTypeFromAnalysis(analysis: QueryAnalysis, prompt: string): TaskType {
    // GPT-5適用を積極的に判定（専門性・複雑度・品質要求の総合評価）
    const gpt5Indicators = [
      analysis.complexity === 'expert',
      analysis.reasoningDepth === 'deep',
      analysis.qualityRequirement === 'exceptional',
      analysis.creativityLevel === 'innovative',
      analysis.domain.length > 2, // 複数専門分野にまたがる
      analysis.priorityBalance.accuracy > 0.8, // 極高精度要求
      prompt.toLowerCase().includes('戦略') || prompt.toLowerCase().includes('strategic'),
      prompt.toLowerCase().includes('重要') || prompt.toLowerCase().includes('critical'),
      prompt.toLowerCase().includes('最高') || prompt.toLowerCase().includes('ultimate'),
      analysis.estimatedProcessingTime > 20 // 長時間処理予測
    ];
    
    const gpt5Score = gpt5Indicators.filter(Boolean).length;
    
    // GPT-5適用条件を緩和（2個以上の指標で適用）
    if (gpt5Score >= 2) {
      console.log(`[QueryAnalyzer] 🚀 GPT-5 selection criteria met (${gpt5Score}/10 indicators)`);
      return 'critical'; // GPT-5 Tier 4にルーティング
    }

    // 複雑度ベースの基本判定
    if (analysis.complexity === 'expert' || analysis.complexity === 'complex') {
      // 専門性が高い場合の詳細判定
      if (analysis.requiredCapabilities.includes('coding') || analysis.domain.includes('technology')) {
        return 'coding';
      }
      
      if (analysis.intentCategory === 'analysis' || analysis.reasoningDepth === 'deep') {
        return 'complex_analysis';
      }
      
      if (analysis.qualityRequirement === 'exceptional' || analysis.priorityBalance.accuracy > 0.7) {
        return 'premium';
      }
      
      return 'complex_analysis'; // デフォルト複雑タスク
    }

    // 中程度複雑度の場合
    if (analysis.complexity === 'moderate') {
      if (analysis.requiredCapabilities.includes('coding')) {
        return 'coding';
      }
      
      if (analysis.intentCategory === 'analysis' || analysis.domain.length > 1) {
        return 'complex_analysis';
      }
      
      return 'general';
    }

    // 創造性・品質要求による判定
    if (analysis.creativityLevel === 'creative' || analysis.creativityLevel === 'innovative') {
      if (analysis.qualityRequirement === 'exceptional') {
        return 'premium';
      }
      return 'complex_analysis';
    }

    // 意図カテゴリによる判定
    if (analysis.intentCategory === 'decision' && analysis.qualityRequirement === 'high') {
      return 'premium';
    }

    // 従来のキーワードフォールバック（互換性維持）
    const legacyTaskType = this.classifyTaskLegacy(prompt);
    if (legacyTaskType !== 'general') {
      console.log(`[LLMOrchestrator] 📝 Legacy keyword match: ${legacyTaskType}`);
      return legacyTaskType;
    }

    // デフォルト
    return 'general';
  }

  /**
   * 従来のキーワードベース分類（フォールバック用）
   */
  private classifyTaskLegacy(prompt: string): TaskType {
    const promptLower = prompt.toLowerCase();

    for (const [taskType, rules] of Object.entries(this.config.routing.task_classification)) {
      const matchCount = rules.keywords.filter(keyword => 
        promptLower.includes(keyword.toLowerCase())
      ).length;
      
      if (matchCount > 0) {
        return taskType as TaskType;
      }
    }

    return 'general';
  }

  /**
   * Claude Code主導の知的モデル選択
   * 分析結果を活用した動的適性評価に基づく最適モデル決定
   */
  private async selectBestModelIntelligently(
    request: LLMRequest, 
    taskType: TaskType, 
    analysis: QueryAnalysis
  ): Promise<ModelConfig> {
    console.log(`[LLMOrchestrator] 🧠 Performing intelligent model selection...`);

    // 🚫 Gemini Flash低精度対策: 強制Tier昇格条件
    const forcedEscalation = this.evaluateForcedTierEscalation(taskType, analysis, request);
    
    // 利用可能モデルの取得（最小Tier制限適用）
    const availableModels = Object.values(this.config.models)
      .filter(model => this.clients.has(model.id))
      .filter(model => model.tier >= forcedEscalation.minTier);

    console.log(`[LLMOrchestrator] 📊 Available models (Tier ${forcedEscalation.minTier}+): ${availableModels.map(m => `${m.id}(T${m.tier})`).join(', ')}`);

    // 強制モデル指定がある場合
    if (forcedEscalation.forcedModel) {
      const forcedModel = availableModels.find(m => m.id === forcedEscalation.forcedModel);
      if (forcedModel) {
        console.log(`[LLMOrchestrator] 🔥 FORCED ESCALATION: ${forcedModel.id} (${forcedEscalation.reasoning})`);
        return forcedModel;
      }
    }

    // 動的モデル適性評価
    const suitabilityScores = this.suitabilityAnalyzer.evaluateModelForTask(
      analysis,
      availableModels,
      new Map() // モデル能力マップ
    );

    // 🆕 Gemini Flash抑制ロジック
    if (forcedEscalation.suppressLowTier) {
      suitabilityScores.forEach(score => {
        const model = availableModels.find(m => m.id === score.modelId);
        if (model && (model.id.includes('flash') || model.tier < 2)) {
          score.suitabilityScore *= 0.2; // Flash系・低Tierは大幅減点
          console.log(`[LLMOrchestrator] ⬇️ Suppressing ${model.id} due to precision requirements`);
        }
      });
    }

    // 適性スコア順でソート
    suitabilityScores.sort((a, b) => b.suitabilityScore - a.suitabilityScore);

    console.log(`[LLMOrchestrator] 🏆 Model Suitability Rankings:`);
    suitabilityScores.forEach((score, index) => {
      console.log(`  ${index + 1}. ${score.modelId}: ${(score.suitabilityScore * 100).toFixed(1)}% (${score.reasoning})`);
      if (score.strengths.length > 0) {
        console.log(`     ✅ Strengths: ${score.strengths.join(', ')}`);
      }
      if (score.weaknesses.length > 0) {
        console.log(`     ⚠️  Weaknesses: ${score.weaknesses.join(', ')}`);
      }
    });

    // 最適モデル選択
    const bestModel = availableModels.find(model => 
      model.id === suitabilityScores[0].modelId
    );

    if (!bestModel) {
      console.log(`[LLMOrchestrator] ⚠️ Intelligent selection failed, falling back to legacy method`);
      return this.selectBestModelLegacy(request, taskType);
    }

    console.log(`[LLMOrchestrator] 🎯 Intelligently selected: ${bestModel.id} (Tier ${bestModel.tier}) with ${(suitabilityScores[0].suitabilityScore * 100).toFixed(1)}% suitability`);

    return bestModel;
  }

  /**
   * 従来のモデル選択ロジック（フォールバック用）
   */
  private selectBestModelLegacy(request: LLMRequest, taskType: TaskType): ModelConfig {
    console.log(`[LLMOrchestrator] ===== ENTERING selectBestModel =====`);
    console.log(`[LLMOrchestrator] 📝 Input task type: ${taskType}`);
    console.log(`[LLMOrchestrator] 👤 User preferred tier: ${request.preferred_tier}`);

    // ユーザーが特定のTierを指定している場合
    if (request.preferred_tier !== undefined) {
      const tierModels = Object.values(this.config.models)
        .filter(model => model.tier === request.preferred_tier)
        .filter(modelId => this.clients.has(modelId.id));
      
      console.log(`[LLMOrchestrator] User specified tier ${request.preferred_tier}, found ${tierModels.length} available models`);
      if (tierModels.length > 0) {
        // 複数モデルがある場合は能力ベースで選択
        if (tierModels.length === 1) {
          console.log(`[LLMOrchestrator] Selected: ${tierModels[0].id} (only option in tier)`);
          return tierModels[0];
        } else {
          const selectedModel = this.selectModelByCapabilities(tierModels, taskType, request.prompt);
          console.log(`[LLMOrchestrator] Selected: ${selectedModel.id} (user tier + capabilities)`);
          return selectedModel;
        }
      }
    }

    // タスクタイプに基づいた推奨Tierを取得
    console.log(`[LLMOrchestrator] 🔍 Looking up task rules for: '${taskType}'`);
    console.log(`[LLMOrchestrator] 🔍 Available task types: ${Object.keys(this.config.routing.task_classification).join(', ')}`);
    const taskRules = this.config.routing.task_classification[taskType];
    const defaultTier = this.config.routing.default_tier;
    const preferredTier = taskRules?.preferred_tier !== undefined ? taskRules.preferred_tier : defaultTier;

    console.log(`[LLMOrchestrator] 📋 Task rules for '${taskType}':`, JSON.stringify(taskRules, null, 2));
    console.log(`[LLMOrchestrator] 🎯 Default tier: ${defaultTier}`);
    console.log(`[LLMOrchestrator] 🎯 Final preferred tier: ${preferredTier}`);

    // 推奨Tierから利用可能なモデルを選択
    let candidateModels = Object.values(this.config.models)
      .filter(model => model.tier === preferredTier)
      .filter(model => this.clients.has(model.id));

    console.log(`[LLMOrchestrator] Tier ${preferredTier} models: ${candidateModels.map(m => m.id).join(', ')}`);
    console.log(`[LLMOrchestrator] Available clients: ${Array.from(this.clients.keys()).join(', ')}`);

    // 推奨Tierにモデルがない場合、フォールバック
    if (candidateModels.length === 0) {
      console.log(`[LLMOrchestrator] No models found in preferred tier ${preferredTier}, falling back...`);
      candidateModels = Object.values(this.config.models)
        .filter(model => this.clients.has(model.id))
        .sort((a, b) => a.tier - b.tier); // Tierの低い順（コスト効率重視）
      
      console.log(`[LLMOrchestrator] Fallback candidates: ${candidateModels.map(m => `${m.id}(T${m.tier})`).join(', ')}`);
    }

    if (candidateModels.length === 0) {
      throw new Error('No available models found');
    }

    // タスクタイプに基づいてベストモデルを選択
    const selectedModel = this.selectModelByCapabilities(candidateModels, taskType, request.prompt);
    console.log(`[LLMOrchestrator] Final selection: ${selectedModel.id} (Tier ${selectedModel.tier})`);
    return selectedModel;
  }

  private selectModelByCapabilities(models: ModelConfig[], taskType: TaskType, prompt: string): ModelConfig {
    if (models.length === 1) {
      return models[0];
    }

    // タスクタイプとcapabilityの対応マッピング
    const taskCapabilityMap: Record<string, string[]> = {
      'complex_analysis': ['complex_analysis', 'advanced_reasoning', 'architectural_design'],
      'coding': ['coding', 'code_generation', 'debugging', 'code_review'],
      'general': ['general_inquiry', 'fast_processing', 'validation'],
      'premium': ['premium_analysis', 'high_quality_generation', 'strategic_planning'],
      'critical': ['critical_decisions', 'ultimate_reasoning', 'strategic_planning']
    };

    const relevantCapabilities = taskCapabilityMap[taskType] || [];

    // 各モデルのスコア計算
    const modelScores = models.map(model => {
      let score = 0;

      // Capability マッチング
      if (model.capabilities) {
        const matches = relevantCapabilities.filter(cap => 
          model.capabilities!.includes(cap as any)
        ).length;
        score += matches * 10; // Capability マッチごとに10ポイント
      }

      // Priority keywords マッチング
      if (model.priority_keywords && prompt) {
        const promptLower = prompt.toLowerCase();
        const keywordMatches = model.priority_keywords.filter(keyword =>
          promptLower.includes(keyword.toLowerCase())
        ).length;
        score += keywordMatches * 5; // キーワードマッチごとに5ポイント
      }

      // レイテンシによる軽微な調整（低レイテンシが若干有利）
      score += Math.max(0, 10 - (model.latency_ms || 1000) / 100);

      return {
        model,
        score
      };
    });

    // スコア順でソートして最高スコアのモデルを選択
    modelScores.sort((a, b) => b.score - a.score);

    console.log(`[LLMOrchestrator] Model selection scores for task '${taskType}':`);
    modelScores.forEach(({ model, score }) => {
      console.log(`  ${model.id}: ${score.toFixed(1)} points`);
    });

    return modelScores[0].model;
  }

  private selectFallbackModel(currentModel: ModelConfig): ModelConfig | null {
    // より低いTierのモデルを探す
    const fallbackModels = Object.values(this.config.models)
      .filter(model => model.tier < currentModel.tier)
      .filter(model => this.clients.has(model.id))
      .sort((a, b) => b.tier - a.tier); // 高いTierから順に

    return fallbackModels.length > 0 ? fallbackModels[0] : null;
  }

  private async executeRequest(request: LLMRequest, modelConfig: ModelConfig, sessionId?: string): Promise<LLMResponse> {
    console.log(`[LLMOrchestrator] 🎯 executeRequest DEBUG - modelConfig.id: ${modelConfig.id}`);
    console.log(`[LLMOrchestrator] 🎯 executeRequest DEBUG - available clients: ${Array.from(this.clients.keys()).join(', ')}`);
    
    const client = this.clients.get(modelConfig.id);
    console.log(`[LLMOrchestrator] 🎯 executeRequest DEBUG - found client: ${client ? 'YES' : 'NO'}`);
    
    if (!client) {
      throw new Error(`Client not available for model: ${modelConfig.id}`);
    }

    // リクエスト前のコストチェック
    const inputTokens = Math.ceil(request.prompt.length / 4); // 概算
    
    // タスクタイプと入力長に基づく現実的な出力トークン推定
    let estimatedOutputTokens: number;
    if (request.task_type === 'coding') {
      // コーディングタスクは入力の2-3倍程度
      estimatedOutputTokens = Math.min(inputTokens * 2.5, 800);
    } else if (request.task_type === 'complex_analysis') {
      // 分析タスクは入力の1.5-2倍程度  
      estimatedOutputTokens = Math.min(inputTokens * 1.8, 600);
    } else if (request.prompt.length > 1000) {
      // 長い入力の場合は比例的に増加
      estimatedOutputTokens = Math.min(inputTokens * 1.2, 500);
    } else {
      // 短い入力の場合は固定的な推定
      estimatedOutputTokens = Math.min(inputTokens * 1.5 + 50, 300);
    }
    
    const estimatedTokens: Partial<TokenUsage> = {
      input: inputTokens,
      output: Math.ceil(estimatedOutputTokens)
    };

    let preCheckResult = null;
    if (this.costManagement) {
      preCheckResult = await this.costManagement.preRequestCheck(modelConfig.id, estimatedTokens);
      
      if (!preCheckResult.approved) {
        console.error(`[LLMOrchestrator] ❌ Request rejected by cost management: ${preCheckResult.reason}`);
        return {
          success: false,
          model_used: modelConfig.id,
          tier_used: modelConfig.tier,
          error: {
            code: 'COST_LIMIT_EXCEEDED',
            message: preCheckResult.reason || 'Request rejected due to cost constraints',
            provider_error: null,
            retry_count: 0
          },
          metadata: {
            model_id: modelConfig.id,
            provider: modelConfig.provider,
            tokens_used: { input: 0, output: 0, total: 0 },
            tier_used: modelConfig.tier,
            estimated_complexity: 1,
            processing_time_ms: 0,
            generated_at: new Date().toISOString()
          },
          cost_info: {
            total_cost_usd: 0,
            input_cost_usd: 0,
            output_cost_usd: 0
          },
          performance_info: {
            latency_ms: 0,
            processing_time_ms: 0,
            fallback_used: false
          }
        };
      }

      if (preCheckResult.warnings.length > 0) {
        console.warn(`[LLMOrchestrator] ⚠️ Cost warnings: ${preCheckResult.warnings.join(', ')}`);
      }
    }

    console.log(`[LLMOrchestrator] 🚀 Executing request with ${modelConfig.id}...`);
    if (preCheckResult) {
      console.log(`[LLMOrchestrator] 💰 Estimated cost: $${preCheckResult.estimated_cost.total_cost_usd.toFixed(6)}`);
    }
    
    const startTime = Date.now();
    let response: LLMResponse;
    let success = false;
    let error: Error | undefined;

    try {
      response = await client.generate(request.prompt, {
        max_tokens: modelConfig.max_tokens,
        temperature: 0.7,
      });
      success = response.success;
    } catch (err) {
      error = err as Error;
      response = {
        success: false,
        model_used: modelConfig.id,
        tier_used: modelConfig.tier,
        error: {
          code: 'GENERATION_ERROR',
          message: error.message,
          provider_error: error,
          retry_count: 0
        },
        metadata: {
          model_id: modelConfig.id,
          provider: modelConfig.provider,
          tokens_used: { input: estimatedTokens.input || 0, output: 0, total: estimatedTokens.input || 0 },
          tier_used: modelConfig.tier,
          estimated_complexity: 1,
          processing_time_ms: Date.now() - startTime,
          generated_at: new Date().toISOString()
        },
        cost_info: {
          total_cost_usd: 0,
          input_cost_usd: 0,
          output_cost_usd: 0
        },
        performance_info: {
          latency_ms: Date.now() - startTime,
          processing_time_ms: Date.now() - startTime,
          fallback_used: false
        }
      };
    }

    const latency = Date.now() - startTime;

    // リクエスト後のコスト処理
    if (this.costManagement && sessionId) {
      const actualTokens: TokenUsage = response.metadata?.tokens_used || {
        input: estimatedTokens.input || 0,
        output: success ? (estimatedTokens.output || 0) : 0,
        total: (estimatedTokens.input || 0) + (success ? (estimatedTokens.output || 0) : 0)
      };

      await this.costManagement.postRequestProcessing(
        sessionId,
        modelConfig.id,
        actualTokens,
        latency,
        success,
        error
      );
    }

    // メトリクス更新
    this.updateMetrics(modelConfig.tier, response);

    // Redisメトリクス更新
    const cost = response.cost_info?.total_cost_usd || 0;
    await this.updateRequestMetrics(modelConfig, latency, cost, success);

    console.log(`[LLMOrchestrator] ${success ? '✅' : '❌'} Request completed: ${modelConfig.id}, Latency: ${latency}ms`);

    return response;
  }

  private checkBudget(modelConfig: ModelConfig): boolean {
    const currentUtilization = this.monthlySpend / this.config.cost_management.monthly_budget_usd;
    
    if (currentUtilization >= this.config.cost_management.cost_alerts.critical_threshold) {
      return false;
    }
    
    if (currentUtilization >= this.config.cost_management.cost_alerts.warning_threshold) {
      console.warn(`[LLMOrchestrator] 💰 Warning: Budget utilization at ${(currentUtilization * 100).toFixed(1)}%`);
    }
    
    return true;
  }

  private shouldCascade(response: LLMResponse, model: ModelConfig): boolean {
    if (!this.config.collaboration.cascade_enabled) return false;
    
    // 品質閾値チェック
    const qualityThresholds = this.config.collaboration.quality_thresholds;
    
    if (!response.success) return true;
    if (!response.response_text || response.response_text.length < qualityThresholds.min_response_length) return true;
    if (response.metadata.confidence_score && response.metadata.confidence_score < qualityThresholds.min_confidence_score) return true;
    
    return false;
  }

  private shouldRefine(response: LLMResponse, model: ModelConfig): boolean {
    if (!this.config.collaboration.refinement_enabled) return false;
    if (model.tier >= 3) return false; // 最高Tierは洗練化しない
    if (!response.success) return false;
    
    // Tier0の場合は、コーディングタスクでのみ洗練化を検討
    if (model.tier === 0) {
      return response.response_text?.includes('```') || false; // コードブロックが含まれている場合
    }
    
    return false;
  }

  /**
   * 🆕 タスクタイプエスカレーション
   * 会話コンテキストに基づいてタスクの複雑度が上がった場合の処理
   */
  private escalateTaskType(currentTaskType: TaskType): TaskType {
    const escalationMap: Record<TaskType, TaskType> = {
      'general': 'complex_analysis',
      'coding': 'premium',
      'complex_analysis': 'premium',
      'premium': 'critical',
      'critical': 'critical', // 既に最高レベル
      'auto': 'complex_analysis',
      // その他のタスクタイプもマッピング
      'rag_search': 'complex_analysis',
      'document_query': 'premium',
      'semantic_search': 'complex_analysis',
      'vector_upsert': 'coding',
      'vector_delete': 'coding',
      'file_search': 'complex_analysis',
      'code_interpreter': 'premium',
      'general_assistant': 'complex_analysis',
      'code_execution': 'premium',
      'assistant_file_search': 'complex_analysis',
      'assistant_code_interpreter': 'premium',
      'assistant_chat': 'complex_analysis'
    };

    return escalationMap[currentTaskType] || currentTaskType;
  }

  /**
   * 🚫 Gemini Flash低精度対策: 強制Tierエスカレーション評価
   * 画一的な文字列マッチングではなく、多次元分析による知的判定
   */
  private evaluateForcedTierEscalation(
    taskType: TaskType, 
    analysis: QueryAnalysis, 
    request: LLMRequest
  ): {
    minTier: number;
    forcedModel?: string;
    suppressLowTier: boolean;
    reasoning: string;
  } {
    const prompt = request.prompt.toLowerCase();
    let escalationScore = 0;
    const reasons: string[] = [];

    // 1. 明示的な高品質要求タスクタイプ
    const premiumTasks: Record<TaskType, number> = {
      'premium': 2,
      'critical': 3,
      'complex_analysis': 2,
      'coding': 1, // コーディングも中程度の品質要求
      'general': 0,
      'auto': 0,
      'rag_search': 1,
      'document_query': 1,
      'semantic_search': 1,
      'vector_upsert': 0,
      'vector_delete': 0,
      'file_search': 1,
      'code_interpreter': 2,
      'general_assistant': 1,
      'code_execution': 2,
      'assistant_file_search': 2,
      'assistant_code_interpreter': 2,
      'assistant_chat': 1
    };

    const taskTypeTier = premiumTasks[taskType] || 0;
    if (taskTypeTier > 0) {
      escalationScore += taskTypeTier;
      reasons.push(`TaskType ${taskType} requires Tier ${taskTypeTier}+`);
    }

    // 2. 技術専門用語による品質要求検出（文字列マッチングではなく意味論的分析）
    const technicalDomains = {
      clustering: ['pacemaker', 'stonith', 'cluster', 'failover', 'ha', 'heartbeat'],
      database: ['postgresql', 'deadlock', 'transaction', 'index', 'query optimization', 'performance tuning'],
      containerization: ['docker', 'kubernetes', 'container', 'systemd', 'privileged'],
      automation: ['jenkins', 'ansible', 'ci/cd', 'pipeline', 'groovy', 'playbook'],
      networking: ['firewall', 'iptables', 'vlan', 'dns', 'routing', 'packet'],
      system_admin: ['apache', 'httpd', 'ssl', 'certificate', 'systemctl', 'journalctl']
    };

    let technicalDomainCount = 0;
    let criticalKeywordCount = 0;

    for (const [domain, keywords] of Object.entries(technicalDomains)) {
      const matchCount = keywords.filter(keyword => prompt.includes(keyword)).length;
      if (matchCount > 0) {
        technicalDomainCount++;
        criticalKeywordCount += matchCount;
      }
    }

    if (technicalDomainCount >= 2) {
      escalationScore += 2;
      reasons.push(`Multi-domain technical complexity detected (${technicalDomainCount} domains)`);
    } else if (technicalDomainCount >= 1) {
      escalationScore += 1;
      reasons.push(`Technical domain specialization required`);
    }

    // 3. 複雑度・品質分析に基づく判定
    if (analysis.complexity === 'expert' || analysis.complexity === 'complex') {
      escalationScore += 2;
      reasons.push(`High complexity analysis: ${analysis.complexity}`);
    }

    if (analysis.qualityRequirement === 'exceptional' || analysis.qualityRequirement === 'high') {
      escalationScore += 1;
      reasons.push(`Quality requirement: ${analysis.qualityRequirement}`);
    }

    if (analysis.reasoningDepth === 'deep') {
      escalationScore += 1;
      reasons.push(`Deep reasoning required`);
    }

    // 4. エラー解析・診断要求検出
    const diagnosticKeywords = [
      'error', 'fail', 'troubleshoot', 'debug', 'analyze', 'investigate',
      'エラー', '失敗', '問題', '解析', '調査', '診断'
    ];
    const hasDiagnostic = diagnosticKeywords.some(keyword => prompt.includes(keyword));
    if (hasDiagnostic) {
      escalationScore += 1;
      reasons.push('Diagnostic/troubleshooting request requires precision');
    }

    // 5. 最終判定
    let minTier = 1; // デフォルト
    let forcedModel: string | undefined;
    let suppressLowTier = false;

    if (escalationScore >= 5) {
      minTier = 3;
      forcedModel = 'gpt4o'; // 最高品質確約
      suppressLowTier = true;
      reasons.push('CRITICAL: Forced GPT-4o selection');
    } else if (escalationScore >= 3) {
      minTier = 2;
      suppressLowTier = true;
      reasons.push('HIGH: Tier 2+ required, Flash suppressed');
    } else if (escalationScore >= 2) {
      minTier = 2;
      reasons.push('MEDIUM: Tier 2+ preferred');
    } else if (taskType === 'premium' || taskType === 'critical') {
      // 明示的指定は必ず守る
      minTier = premiumTasks[taskType];
      suppressLowTier = true;
      reasons.push(`Explicit ${taskType} task type honored`);
    }

    const reasoning = reasons.join('; ');
    console.log(`[LLMOrchestrator] 🔬 Escalation Analysis: Score=${escalationScore}, MinTier=${minTier}, Reasoning=[${reasoning}]`);

    return {
      minTier,
      forcedModel,
      suppressLowTier,
      reasoning
    };
  }

  private async cascadeToHigherTier(
    request: LLMRequest, 
    failedModel: ModelConfig, 
    failedResponse: LLMResponse
  ): Promise<LLMResponse> {
    const higherTierModels = Object.values(this.config.models)
      .filter(model => model.tier > failedModel.tier)
      .filter(model => this.clients.has(model.id))
      .sort((a, b) => a.tier - b.tier); // 低いTierから順に

    if (higherTierModels.length === 0) {
      console.log('[LLMOrchestrator] No higher tier models available for cascade');
      return failedResponse; // 元のレスポンスを返す
    }

    const nextModel = higherTierModels[0];
    console.log(`[LLMOrchestrator] Cascading from Tier ${failedModel.tier} to Tier ${nextModel.tier}`);
    
    const cascadeResponse = await this.executeRequest(request, nextModel);
    cascadeResponse.performance_info.fallback_used = true;
    cascadeResponse.performance_info.tier_escalation = true;
    
    return cascadeResponse;
  }

  private async refineWithHigherTier(request: LLMRequest, baseResponse: LLMResponse): Promise<LLMResponse> {
    const higherTierModels = Object.values(this.config.models)
      .filter(model => model.tier > baseResponse.tier_used)
      .filter(model => this.clients.has(model.id))
      .sort((a, b) => a.tier - b.tier);

    if (higherTierModels.length === 0) {
      return baseResponse;
    }

    const refinementModel = higherTierModels[0];
    const refinementPrompt = `
Please review and improve the following response:

Original Prompt: ${request.prompt}

Response to Improve:
${baseResponse.response_text}

Please provide an improved version that:
1. Maintains accuracy and correctness
2. Improves clarity and structure
3. Adds helpful details where appropriate
4. Fixes any issues or errors

Improved Response:`;

    console.log(`[LLMOrchestrator] Refining with Tier ${refinementModel.tier} model`);
    const refinedResponse = await this.executeRequest({ prompt: refinementPrompt }, refinementModel);
    
    // 元のコスト情報と合計する
    refinedResponse.cost_info.total_cost_usd += baseResponse.cost_info.total_cost_usd;
    refinedResponse.performance_info.tier_escalation = true;
    
    return refinedResponse;
  }

  private updateMetrics(tier: number, response: LLMResponse): void {
    this.metrics.requests_per_tier[tier]++;
    
    if (response.success) {
      this.metrics.success_rate_per_tier[tier] = 
        (this.metrics.success_rate_per_tier[tier] + 1) / this.metrics.requests_per_tier[tier];
    }
    
    this.metrics.average_latency_per_tier[tier] = 
      (this.metrics.average_latency_per_tier[tier] + response.performance_info.latency_ms) / this.metrics.requests_per_tier[tier];
    
    this.metrics.cost_per_tier[tier] += response.cost_info.total_cost_usd;
    this.monthlySpend += response.cost_info.total_cost_usd;
    
    this.metrics.total_monthly_spend = this.monthlySpend;
    this.metrics.budget_utilization_percentage = 
      (this.monthlySpend / this.config.cost_management.monthly_budget_usd) * 100;
  }

  // 公開メソッド
  public async healthCheck(): Promise<{ healthy: boolean; details: Record<string, boolean> }> {
    console.log('[LLMOrchestrator] Performing health check on all clients...');
    
    const healthResults: Record<string, boolean> = {};
    
    for (const [modelId, client] of this.clients.entries()) {
      try {
        healthResults[modelId] = await client.isHealthy();
      } catch (error) {
        console.error(`[LLMOrchestrator] Health check failed for ${modelId}:`, error);
        healthResults[modelId] = false;
      }
    }
    
    const healthyCount = Object.values(healthResults).filter(Boolean).length;
    const totalCount = Object.keys(healthResults).length;
    
    console.log(`[LLMOrchestrator] Health check complete: ${healthyCount}/${totalCount} clients healthy`);
    
    return {
      healthy: healthyCount > 0, // 少なくとも1つのクライアントが健全であれば OK
      details: healthResults
    };
  }

  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  // Vector Storage等の新機能リクエストを判定
  private isCapabilityRequest(request: LLMRequest): boolean {
    const capabilityTaskTypes = [
      'rag_search', 'document_query', 'semantic_search', 
      'vector_upsert', 'vector_delete'
      // 将来的にfile_search, code_executionも追加
    ];
    
    return capabilityTaskTypes.includes(request.task_type || '');
  }

  // CapabilityProviderを使用してリクエストを処理
  private async processWithCapabilityProvider(request: LLMRequest): Promise<LLMResponse> {
    console.log(`[LLMOrchestrator] 🔧 Processing with capability provider: ${request.task_type}`);
    
    const startTime = Date.now();
    
    try {
      // 最適なCapabilityProviderを選択
      const { provider, routing } = this.capabilityRegistry.findBestProviderWithRouting(request);
      
      if (!provider) {
        throw new Error(`No suitable capability provider found for task type: ${request.task_type}`);
      }

      console.log(`[LLMOrchestrator] Selected capability provider: ${provider.name}`);
      console.log(`[LLMOrchestrator] Routing info: ${routing.selection_reason}`);

      // プロバイダーでリクエストを実行
      const response = await provider.execute(request);
      
      const latency = Date.now() - startTime;

      // メトリクスを更新
      this.capabilityRegistry.updateMetrics(
        provider.name,
        response.success,
        latency,
        response.cost_info.total_cost_usd
      );

      // レスポンスに付加情報を追加
      response.metadata = {
        ...response.metadata,
        routing_info: routing,
        capability_provider: provider.name
      };

      console.log(`[LLMOrchestrator] ✅ Capability request completed: ${provider.name}, Success: ${response.success}, Cost: $${response.cost_info.total_cost_usd.toFixed(6)}`);
      
      return response;

    } catch (error) {
      console.error('[LLMOrchestrator] ❌ Capability request failed:', error);
      
      const errorResponse: LLMResponse = {
        success: false,
        model_used: 'capability_error',
        tier_used: -1,
        error: {
          code: 'CAPABILITY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown capability error'
        },
        metadata: {
          model_id: 'capability_error',
          provider: 'system',
          tokens_used: { input: 0, output: 0, total: 0 },
          generated_at: new Date().toISOString(),
          tier_used: -1,
          processing_time_ms: 0,
          estimated_complexity: 0
        },
        cost_info: {
          total_cost_usd: 0,
          input_cost_usd: 0,
          output_cost_usd: 0
        },
        performance_info: {
          latency_ms: Date.now() - startTime,
          processing_time_ms: Date.now() - startTime,
          fallback_used: false
        }
      };

      return errorResponse;
    }
  }

  public getAvailableModels(): ModelConfig[] {
    return Object.values(this.config.models).filter(model => 
      this.clients.has(model.id)
    );
  }

  public resetMetrics(): void {
    this.initializeMetrics();
    this.monthlySpend = 0;
    this.requestCount = 0;
    console.log('[LLMOrchestrator] Metrics reset');
  }

  // 協調コーディング専用メソッド
  public async processCollaborativeCoding(request: DecompositionRequest): Promise<CodingSession> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`\n[LLMOrchestrator] 🤝 Starting collaborative coding session: ${sessionId}`);
    console.log(`[LLMOrchestrator] Original prompt: "${request.originalPrompt.substring(0, 150)}${request.originalPrompt.length > 150 ? '...' : ''}"`);
    
    const session: CodingSession = {
      sessionId,
      originalRequest: request.originalPrompt,
      decomposition: {} as DecompositionResult, // 一時的に空のオブジェクト
      subtasks: [],
      progress: {
        completed: 0,
        inProgress: 0,
        failed: 0,
        total: 0
      },
      metrics: {
        totalProcessingTime: 0,
        qwen3Usage: 0,
        claudeUsage: 0,
        totalCost: 0,
        qualityScore: 0
      },
      status: 'planning',
      startTime: new Date().toISOString()
    };

    this.activeSessions.set(sessionId, session);

    // コスト管理システムでセッション開始を登録
    if (this.costManagement) {
      await this.costManagement.tracker.startSession(sessionId, {
        user_id: request.context || 'system',
        project_id: 'collaborative-coding',
        prompt: request.originalPrompt.substring(0, 500)
      });
    }

    try {
      // Step 1: タスク分解
      console.log(`[LLMOrchestrator] Step 1: Task decomposition`);
      const decomposition = await this.taskDecomposer.decompose(request);
      session.decomposition = decomposition;
      session.subtasks = [...decomposition.subtasks];
      session.progress.total = decomposition.subtasks.length;

      // Step 2: 難易度再評価
      console.log(`[LLMOrchestrator] Step 2: Difficulty classification`);
      const classifiedSubtasks = await this.difficultyClassifier.classifyBatch(session.subtasks);
      session.subtasks = classifiedSubtasks;

      // Step 3: サブタスクの並列実行
      console.log(`[LLMOrchestrator] Step 3: Executing subtasks`);
      session.status = 'executing';
      await this.executeSubtasks(session);

      // Step 4: 全体的な品質チェックと統合
      console.log(`[LLMOrchestrator] Step 4: Final quality check and integration`);
      session.status = 'reviewing';
      await this.performFinalQualityCheck(session);

      session.status = 'completed';
      session.endTime = new Date().toISOString();
      
      // コスト管理システムでセッション終了を記録
      if (this.costManagement) {
        try {
          const finalSession = await this.costManagement.tracker.endSession(sessionId);
          console.log(`[LLMOrchestrator] 💰 Final session cost: $${finalSession.total_cost.total_cost_usd.toFixed(6)}`);
          console.log(`[LLMOrchestrator] 📊 Total requests: ${finalSession.total_requests}, Tokens: ${finalSession.total_tokens.total.toLocaleString()}`);
        } catch (error) {
          console.warn(`[LLMOrchestrator] ⚠️ Failed to finalize session cost tracking:`, error);
        }
      }
      
      console.log(`[LLMOrchestrator] 🎉 Collaborative coding session completed: ${sessionId}`);
      console.log(`[LLMOrchestrator] Final metrics: Cost=$${session.metrics.totalCost.toFixed(4)}, Quality=${session.metrics.qualityScore.toFixed(1)}`);
      
      return session;

    } catch (error) {
      console.error(`[LLMOrchestrator] ❌ Collaborative coding session failed:`, error);
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      throw error;
    }
  }

  private async executeSubtasks(session: CodingSession): Promise<void> {
    const easyTasks = session.subtasks.filter(t => t.difficulty === 'easy');
    const hardTasks = session.subtasks.filter(t => t.difficulty === 'hard');

    console.log(`[LLMOrchestrator] Executing ${easyTasks.length} easy tasks and ${hardTasks.length} hard tasks`);

    // 依存関係を考慮して実行順序を決定
    const executionOrder = this.calculateExecutionOrder(session.subtasks);

    for (const subtask of executionOrder) {
      console.log(`[LLMOrchestrator] Processing subtask: ${subtask.id} (${subtask.difficulty})`);
      subtask.status = 'in_progress';
      session.progress.inProgress++;

      try {
        const result = await this.executeSubtask(subtask, session);
        subtask.result = result;
        
        // 品質チェック
        const qualityReview = await this.qualityGate.review(subtask, result);
        
        if (qualityReview.requiresRevision && subtask.retryCount < this.collaborativeConfig.maxRetries) {
          console.log(`[LLMOrchestrator] Quality check failed, retrying subtask: ${subtask.id}`);
          subtask.status = 'retry';
          subtask.retryCount++;
          subtask.feedback = qualityReview.comments;
          
          // 再実行（必要に応じてClaude Codeへエスカレーション）
          const retryResult = await this.retrySubtask(subtask, session, qualityReview);
          subtask.result = retryResult;
        }

        if (qualityReview.passed || subtask.retryCount >= this.collaborativeConfig.maxRetries) {
          subtask.status = 'done';
          session.progress.completed++;
          session.progress.inProgress--;
        } else {
          subtask.status = 'failed';
          session.progress.failed++;
          session.progress.inProgress--;
        }

        // セッションメトリクス更新
        session.metrics.totalCost += result.metadata.tokens_used * 0.001; // 概算コスト
        if (result.metadata.model_used.includes('qwen')) {
          session.metrics.qwen3Usage++;
        } else {
          session.metrics.claudeUsage++;
        }

      } catch (error) {
        console.error(`[LLMOrchestrator] Subtask execution failed: ${subtask.id}`, error);
        subtask.status = 'failed';
        session.progress.failed++;
        session.progress.inProgress--;
      }
    }
  }

  private async executeSubtask(subtask: Subtask, session: CodingSession): Promise<CodeResult> {
    if (subtask.difficulty === 'easy') {
      // Qwen3 Coderで実行（設定ファイルから実際のIDを確認）
      const qwenModels = Object.entries(this.config.models).filter(([id, config]) => config.tier === 0);
      if (qwenModels.length > 0) {
        const [qwenId, qwenConfig] = qwenModels[0];
        const qwenClient = this.clients.get(qwenId);
        if (qwenClient) {
          console.log(`[LLMOrchestrator] 🚀 Delegating to Qwen3 Coder: ${subtask.id}`);
          const response = await qwenClient.generate(subtask.description);
          
          return {
            code: response.response_text || '',
            explanation: `Generated by Qwen3 Coder for: ${subtask.description}`,
            metadata: {
              model_used: qwenId,
              tier_used: 0,
              tokens_used: response.metadata.tokens_used?.total || 0,
              processing_time_ms: response.performance_info.processing_time_ms,
              confidence_score: response.metadata.confidence_score,
              estimated_complexity: 3 // Easy task baseline
            }
          };
        }
      }
    }
    
    // Claude Codeで実行（hardタスクまたはQwen3が利用不可の場合）
    console.log(`[LLMOrchestrator] 🧠 Executing with Claude Code: ${subtask.id}`);
    
    // 利用可能な最高Tierのクライアントを探す
    const availableClients = Array.from(this.clients.keys());
    console.log(`[LLMOrchestrator] Available clients: ${availableClients.join(', ')}`);
    
    if (availableClients.length > 0) {
      const clientId = availableClients[0]; // 最初の利用可能なクライアントを使用
      const client = this.clients.get(clientId)!;
      const response = await client.generate(subtask.description);
      
      return {
        code: response.response_text || '',
        explanation: `Generated by ${clientId} for: ${subtask.description}`,
        metadata: {
          model_used: clientId,
          tier_used: this.config.models[clientId]?.tier || 0,
          tokens_used: response.metadata.tokens_used?.total || 0,
          processing_time_ms: response.performance_info.processing_time_ms,
          confidence_score: response.metadata.confidence_score,
          estimated_complexity: subtask.difficulty === 'hard' ? 7 : 4
        }
      };
    }

    throw new Error(`No suitable client available for subtask: ${subtask.id}`);
  }

  private async retrySubtask(subtask: Subtask, session: CodingSession, qualityReview: any): Promise<CodeResult> {
    const shouldEscalate = this.collaborativeConfig.autoEscalateToClaudeAfterRetries && 
                          subtask.difficulty === 'easy' && 
                          subtask.retryCount >= 1;

    if (shouldEscalate) {
      console.log(`[LLMOrchestrator] 📈 Escalating to Claude Code: ${subtask.id}`);
      subtask.difficulty = 'hard'; // 難易度を一時的に変更
      return this.executeSubtask(subtask, session);
    } else {
      console.log(`[LLMOrchestrator] 🔄 Retrying with same model: ${subtask.id}`);
      const improvedPrompt = `${subtask.description}

Previous attempt had these issues:
${qualityReview.comments}

Please address these issues and provide an improved implementation.`;
      
      subtask.description = improvedPrompt;
      return this.executeSubtask(subtask, session);
    }
  }

  private calculateExecutionOrder(subtasks: Subtask[]): Subtask[] {
    // トポロジカルソートで依存関係を考慮した実行順序を決定
    const visited = new Set<string>();
    const result: Subtask[] = [];
    
    const visit = (task: Subtask) => {
      if (visited.has(task.id)) return;
      
      visited.add(task.id);
      
      // 依存関係のあるタスクを先に実行
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const depTask = subtasks.find(t => t.id === depId);
          if (depTask) {
            visit(depTask);
          }
        }
      }
      
      result.push(task);
    };
    
    for (const task of subtasks) {
      visit(task);
    }
    
    return result;
  }

  private async performFinalQualityCheck(session: CodingSession): Promise<void> {
    console.log(`[LLMOrchestrator] Performing final quality check for session: ${session.sessionId}`);
    
    const completedTasks = session.subtasks.filter(t => t.status === 'done' && t.result);
    let totalQualityScore = 0;
    
    for (const task of completedTasks) {
      if (task.result) {
        const review = await this.qualityGate.review(task, task.result);
        totalQualityScore += review.score;
      }
    }
    
    session.metrics.qualityScore = completedTasks.length > 0 ? totalQualityScore / completedTasks.length : 0;
  }

  public getActiveSession(sessionId: string): CodingSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  public listActiveSessions(): CodingSession[] {
    return Array.from(this.activeSessions.values());
  }

  // ヘルパーメソッド
  private shouldUseCollaborativeCoding(request: LLMRequest): boolean {
    // タスクタイプが明示的に指定されている場合はそれを尊重
    if (request.task_type) {
      // 分析系タスクは協調コーディングを使わない
      const analysisTaskTypes = ['complex_analysis', 'general', 'premium', 'critical'];
      if (analysisTaskTypes.includes(request.task_type)) {
        return false;
      }
      // コーディング系タスクのみ協調コーディングを使用
      if (request.task_type === 'coding') {
        return true;
      }
    }

    const prompt = request.prompt.toLowerCase();
    
    // 分析系のキーワードが含まれている場合は協調コーディングを使わない
    const analysisKeywords = [
      'analysis', 'analyze', 'explain', 'describe', 'discuss', 'theory', 'theorem',
      'mathematical', 'proof', 'demonstrate', 'show', 'calculate', 'derive',
      '分析', '解析', '説明', '解説', '考察', '理論', '定理', '証明', 
      '数学', '計算', '導出', '検討', '研究'
    ];
    
    const hasAnalysisKeywords = analysisKeywords.some(keyword => prompt.includes(keyword));
    if (hasAnalysisKeywords) {
      return false;
    }
    
    // コーディングタスクの検出キーワード
    const codingKeywords = [
      'implement', 'create', 'build', 'develop', 'code', 'function', 'class', 
      'api', 'endpoint', 'component', 'module', 'service', 'algorithm',
      '実装', '作成', '開発', '構築', 'コード', '関数', 'クラス', 'API',
      'コンポーネント', 'モジュール', 'サービス', 'アルゴリズム'
    ];
    
    const hasCodeKeywords = codingKeywords.some(keyword => prompt.includes(keyword));
    const hasCodeBlocks = prompt.includes('```') || prompt.includes('function') || prompt.includes('class ');
    
    // 長いプロンプトも、分析系でなくコーディング要素がある場合のみ協調コーディングを使用
    const isLongCodingTask = request.prompt.length > 400 && hasCodeKeywords;
    
    return hasCodeKeywords || hasCodeBlocks || isLongCodingTask;
  }

  private extractTargetLanguage(prompt: string): string {
    const prompt_lower = prompt.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'typescript': 'typescript',
      'javascript': 'javascript', 
      'python': 'python',
      'java': 'java',
      'go': 'go',
      'rust': 'rust',
      'cpp': 'cpp',
      'c++': 'cpp'
    };
    
    for (const [keyword, language] of Object.entries(languageMap)) {
      if (prompt_lower.includes(keyword)) {
        return language;
      }
    }
    
    return 'typescript'; // デフォルト
  }

  private convertSessionToResponse(session: CodingSession, startTime: number): LLMResponse {
    const completedTasks = session.subtasks.filter(t => t.status === 'done');
    const combinedCode = completedTasks.map(t => t.result?.code || '').join('\n\n');
    const combinedExplanation = completedTasks.map(t => 
      `${t.id}: ${t.result?.explanation || t.description}`
    ).join('\n');

    return {
      success: session.status === 'completed',
      model_used: 'collaborative_pipeline',
      tier_used: -1, // 複数モデル使用
      response_text: `${combinedExplanation}\n\n--- Generated Code ---\n${combinedCode}`,
      metadata: {
        model_id: 'collaborative_pipeline',
        provider: 'hybrid',
        tokens_used: {
          input: session.subtasks.reduce((sum, t) => sum + (t.result?.metadata.tokens_used || 0), 0),
          output: session.subtasks.reduce((sum, t) => sum + (t.result?.metadata.tokens_used || 0), 0),
          total: session.subtasks.reduce((sum, t) => sum + (t.result?.metadata.tokens_used || 0), 0)
        },
        generated_at: new Date().toISOString(),
        confidence_score: session.metrics.qualityScore / 100,
        session_id: session.sessionId,
        subtasks_completed: completedTasks.length,
        qwen3_usage: session.metrics.qwen3Usage,
        claude_usage: session.metrics.claudeUsage,
        tier_used: -1,
        processing_time_ms: Date.now() - startTime,
        estimated_complexity: session.subtasks.length
      },
      cost_info: {
        total_cost_usd: session.metrics.totalCost,
        input_cost_usd: session.metrics.totalCost * 0.6,
        output_cost_usd: session.metrics.totalCost * 0.4
      },
      performance_info: {
        latency_ms: Date.now() - startTime,
        processing_time_ms: session.metrics.totalProcessingTime,
        fallback_used: false,
        collaborative_session: true
      }
    };
  }

  // ============================================
  // Redis統合ログメソッド
  // ============================================
  
  /**
   * クエリ分析結果をRedisにトレースログとして記録
   */
  private async logQueryAnalysis(
    requestId: string, 
    request: LLMRequest, 
    analysis: QueryAnalysis, 
    selectedModel: ModelConfig, 
    taskType: TaskType
  ): Promise<void> {
    if (!this.redisLogger) return;

    try {
      const analysisTime = Date.now();
      
      // 代替モデル候補を取得
      const alternativeModels = Object.values(this.config.models)
        .filter(model => model.id !== selectedModel.id)
        .sort((a, b) => this.calculateModelScore(analysis, b) - this.calculateModelScore(analysis, a))
        .slice(0, 3)
        .map(model => model.id);

      const queryAnalysisLog: QueryAnalysisLog = {
        requestId,
        timestamp: analysisTime,
        complexity: analysis.complexity,
        reasoning_depth: analysis.reasoningDepth,
        creativity_level: analysis.creativityLevel,
        routing_decision: taskType,
        selected_model: selectedModel.id,
        selected_tier: selectedModel.tier,
        confidence_score: this.calculateConfidenceScore(analysis, selectedModel),
        alternative_models: alternativeModels,
        analysis_time_ms: 0, // 後で計算
        prompt_length: request.prompt.length,
        estimated_cost: this.estimateRequestCost(selectedModel, request.prompt.length),
        priority_balance: analysis.priorityBalance
      };

      await this.redisLogger.logQueryAnalysis(queryAnalysisLog);
      
      console.log(`[LLMOrchestrator] 📊 Query analysis logged to Redis: ${requestId}`);
    } catch (error) {
      console.warn('[LLMOrchestrator] Failed to log query analysis:', error);
    }
  }

  /**
   * 分析結果に基づくモデルスコア計算（多次元評価）
   */
  private calculateModelScore(analysis: QueryAnalysis, model: ModelConfig): number {
    let score = 0;
    
    // 1. 複雑度適合度評価 (0-3点)
    const complexityMapping = {
      'trivial': { tier0: 3, tier1: 2, tier2: 1, tier3: 0 },
      'simple': { tier0: 2, tier1: 3, tier2: 2, tier3: 1 },  
      'moderate': { tier0: 1, tier1: 2, tier2: 3, tier3: 2 },
      'complex': { tier0: 0, tier1: 1, tier2: 2, tier3: 3 },
      'expert': { tier0: 0, tier1: 0, tier2: 1, tier3: 3 }
    } as const;
    
    const tierKey = `tier${model.tier}` as keyof typeof complexityMapping['trivial'];
    const complexityScore = complexityMapping[analysis.complexity]?.[tierKey] || 0;
    score += complexityScore;
    
    // 2. 推論深度適合度評価 (0-2点)
    const reasoningScores = {
      'shallow': { tier0: 2, tier1: 1, tier2: 0, tier3: 0 },
      'moderate': { tier0: 1, tier1: 2, tier2: 2, tier3: 1 },
      'deep': { tier0: 0, tier1: 1, tier2: 2, tier3: 2 }
    } as const;
    
    const reasoningScore = reasoningScores[analysis.reasoningDepth]?.[tierKey] || 0;
    score += reasoningScore;
    
    // 3. 創造性レベル適合度評価 (0-2点)
    const creativityScores = {
      'factual': { tier0: 2, tier1: 2, tier2: 1, tier3: 1 },
      'analytical': { tier0: 1, tier1: 2, tier2: 2, tier3: 2 },
      'creative': { tier0: 0, tier1: 1, tier2: 2, tier3: 2 },
      'innovative': { tier0: 0, tier1: 0, tier2: 1, tier3: 2 }
    } as const;
    
    const creativityScore = creativityScores[analysis.creativityLevel]?.[tierKey] || 0;
    score += creativityScore;
    
    // 4. コスト効率性評価 (0-2点、重み付け)
    const costEfficiency = [2, 1.5, 1, 0.5][model.tier] || 0; // tier0が最高効率
    const costScore = costEfficiency * analysis.priorityBalance.cost;
    score += costScore;
    
    // 5. 速度効率性評価 (0-2点、重み付け)  
    const speedEfficiency = [2, 1.5, 1, 0.5][model.tier] || 0; // tier0が最高速度
    const speedScore = speedEfficiency * analysis.priorityBalance.speed;
    score += speedScore;
    
    // 6. 精度重要度評価 (0-2点、重み付け)
    const accuracyBonus = [0.5, 1, 1.5, 2][model.tier] || 0; // tier3が最高精度
    const accuracyScore = accuracyBonus * analysis.priorityBalance.accuracy;
    score += accuracyScore;
    
    // 7. ドメイン特化ボーナス (0-1点)
    const domainBonus = this.calculateDomainBonus(analysis.domain, model);
    score += domainBonus;
    
    return Math.max(0, score); // 負数回避
  }

  /**
   * ドメイン特化ボーナス計算
   */
  private calculateDomainBonus(domains: string[], model: ModelConfig): number {
    let bonus = 0;
    
    // ドメイン固有のモデル適性評価
    for (const domain of domains) {
      switch (domain.toLowerCase()) {
        case 'coding':
        case 'programming':
        case 'software':
          // Qwen3 Coderは特にコーディングに優秀
          if (model.id.includes('qwen') && model.id.includes('coder')) bonus += 0.5;
          if (model.tier === 0) bonus += 0.3; // tier0は一般的にコーディングに適している
          break;
          
        case 'strategy':
        case 'business':  
        case 'analysis':
          // GPT-4o, Claude Sonnetは戦略分析に優秀
          if (model.id.includes('gpt-4o') || model.id.includes('claude')) bonus += 0.5;
          if (model.tier >= 2) bonus += 0.3; // 高tierは分析に適している
          break;
          
        case 'creative':
        case 'writing':
        case 'content':
          // Claude, GPTは創造的タスクに優秀
          if (model.id.includes('claude') || model.id.includes('gpt')) bonus += 0.4;
          break;
          
        case 'math':
        case 'calculation':
        case 'logic':
          // 数学特化モデルがある場合
          if (model.id.includes('math') || model.id.includes('reasoning')) bonus += 0.5;
          break;
          
        default:
          // 汎用ドメインでは中間tierが適している
          if (model.tier === 1 || model.tier === 2) bonus += 0.1;
      }
    }
    
    return Math.min(bonus, 1.0); // 最大1.0点
  }

  /**
   * モデル選択の信頼度スコア計算
   */
  private calculateConfidenceScore(analysis: QueryAnalysis, selectedModel: ModelConfig): number {
    const modelScore = this.calculateModelScore(analysis, selectedModel);
    const maxPossibleScore = 12; // 最大スコア（3+2+2+2+2+1 = 12点）
    return Math.min(modelScore / maxPossibleScore, 1.0);
  }

  /**
   * リクエストコスト推定
   */
  private estimateRequestCost(model: ModelConfig, promptLength: number): number {
    const estimatedTokens = Math.ceil(promptLength / 4) + 100; // 入力+出力の概算
    const inputCost = (estimatedTokens * 0.7) * (model.cost_per_1k_tokens.input / 1000);
    const outputCost = (estimatedTokens * 0.3) * (model.cost_per_1k_tokens.output / 1000);
    return inputCost + outputCost;
  }

  /**
   * リクエスト完了後のメトリクス更新
   */
  private async updateRequestMetrics(
    selectedModel: ModelConfig,
    latency: number,
    cost: number,
    success: boolean,
    requestId?: string
  ): Promise<void> {
    if (!this.redisLogger) return;

    try {
      // モデルメトリクス更新
      await this.redisLogger.updateModelMetrics(selectedModel.id, latency, cost, success);
      
      // エラー時のトラッキング
      if (!success) {
        await this.redisLogger.trackError(
          'request_execution_failed',
          `Request failed for model ${selectedModel.id}`,
          { requestId, model: selectedModel.id, latency, cost }
        );
      }
      
      console.log(`[LLMOrchestrator] 📈 Metrics updated for ${selectedModel.id}`);
    } catch (error) {
      console.warn('[LLMOrchestrator] Failed to update request metrics:', error);
    }
  }

  /**
   * 日次コスト更新スケジューラー開始
   */
  private startDailyCostScheduler(): void {
    console.log('[LLMOrchestrator] Starting daily cost table scheduler...');
    
    // 毎日午前0:05にコストテーブル更新
    const scheduleNextUpdate = () => {
      const now = new Date();
      const nextUpdate = new Date(now);
      nextUpdate.setHours(0, 5, 0, 0); // 午前0:05
      
      // 今日の0:05を過ぎていたら翌日に設定
      if (nextUpdate <= now) {
        nextUpdate.setDate(nextUpdate.getDate() + 1);
      }
      
      const timeUntilUpdate = nextUpdate.getTime() - now.getTime();
      
      console.log(`[LLMOrchestrator] 📅 Next daily cost update scheduled: ${nextUpdate.toISOString()}`);
      
      setTimeout(async () => {
        console.log('[LLMOrchestrator] 🕒 Daily cost table update triggered');
        
        if (this.redisLogger) {
          try {
            await this.redisLogger.updateDailyCosts();
            console.log('[LLMOrchestrator] ✅ Daily cost table updated successfully');
          } catch (error) {
            console.error('[LLMOrchestrator] ❌ Daily cost table update failed:', error);
          }
        }
        
        // 次の更新をスケジュール
        scheduleNextUpdate();
      }, timeUntilUpdate);
    };
    
    scheduleNextUpdate();
    
    // 起動時にも即座に更新
    setTimeout(async () => {
      if (this.redisLogger) {
        try {
          await this.redisLogger.updateDailyCosts();
          console.log('[LLMOrchestrator] ✅ Initial daily cost table updated');
        } catch (error) {
          console.warn('[LLMOrchestrator] ⚠️ Initial daily cost table update failed:', error);
        }
      }
    }, 5000); // 5秒後に実行（システム初期化後）
  }

  /**
   * リアルタイムメトリクス取得（外部API用）
   */
  async getRealTimeMetrics(): Promise<any> {
    if (!this.redisLogger) {
      return { error: 'Redis Logger not available' };
    }
    
    return await this.redisLogger.getRealTimeMetrics();
  }

  /**
   * クエリ分析履歴取得（外部API用）
   */
  async getQueryAnalysisHistory(date: string, limit: number = 100): Promise<any> {
    if (!this.redisLogger) {
      return [];
    }
    
    return await this.redisLogger.getQueryAnalysisHistory(date, limit);
  }

  /**
   * 日次コストレポート取得（外部API用）
   */
  async getDailyCostReport(date: string): Promise<any> {
    if (!this.redisLogger) {
      return { error: 'Redis Logger not available' };
    }
    
    const metrics = await this.redisLogger.getRealTimeMetrics();
    return metrics.dailyCosts;
  }

  /**
   * Redis統計情報取得（Upstash対応）
   */
  async getRedisStats(): Promise<any> {
    if (!this.redisLogger) {
      return { 
        error: 'Redis Logger not available',
        service_type: 'none',
        connection_status: 'disabled'
      };
    }

    try {
      // UpstashRedisLoggerかどうかを確認
      if (this.redisLogger instanceof UpstashRedisLogger) {
        return await this.redisLogger.getUpstashStats();
      } else {
        // ローカルRedisの場合
        return {
          connection_status: 'connected',
          service_type: 'local_redis',
          features: [
            'local_storage',
            'standard_redis_api',
            'basic_metrics'
          ]
        };
      }
    } catch (error) {
      return {
        error: 'Failed to get Redis stats',
        connection_status: 'error',
        service_type: 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============================================
  // IT Troubleshooting 統合メソッド
  // ============================================

  /**
   * ログ解析リクエストを処理
   */
  async processLogAnalysis(request: LogAnalysisRequest): Promise<any> {
    console.log('[LLMOrchestrator] 🔍 Processing log analysis request...');
    return await this.logAnalysisService.analyzeLog(request);
  }

  /**
   * 高度なログ解析を実行
   */
  async processAdvancedLogAnalysis(rawLogs: string, context: LogAnalysisContext): Promise<any> {
    console.log('[LLMOrchestrator] 🔧 Processing advanced log analysis...');
    return await this.advancedLogAnalyzer.analyzeUserLogs(rawLogs, context);
  }

  /**
   * 対話型トラブルシューティングセッションを開始
   */
  async startTroubleshootingSession(problemDescription: string, userId?: string): Promise<any> {
    console.log('[LLMOrchestrator] 🛠️ Starting troubleshooting session...');
    return await this.interactiveTroubleshooter.startTroubleshootingSession(problemDescription, userId);
  }

  /**
   * トラブルシューティングセッションに回答
   */
  async respondToTroubleshootingSession(sessionId: string, userResponse: string): Promise<any> {
    console.log('[LLMOrchestrator] 💬 Responding to troubleshooting session...');
    
    // セッション状態を取得して適切な処理を判定
    const session = this.interactiveTroubleshooter.getSessionStatus(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 現在はシンプルな診断実行を行う
    // TODO: 将来的にはより詳細な対話処理を実装
    return await this.interactiveTroubleshooter.performDiagnosis(sessionId);
  }

  /**
   * コマンドの安全性を評価
   */
  async assessCommandSafety(command: string, context: any): Promise<any> {
    console.log('[LLMOrchestrator] 🛡️ Assessing command safety...');
    return await this.safeExecutionManager.assessCommandSafety(command);
  }

  /**
   * IT統合システム統計情報取得
   */
  getITSystemStats(): any {
    return {
      troubleshooting_services: {
        log_analysis: !!this.logAnalysisService,
        interactive_troubleshooter: !!this.interactiveTroubleshooter,
        advanced_log_analyzer: !!this.advancedLogAnalyzer,
        safe_execution_manager: !!this.safeExecutionManager
      },
      llm_orchestration: {
        total_models: this.clients.size,
        tiers_available: [0, 1, 2, 3],
        collaborative_coding: true,
        cost_management: !!this.costManagement
      },
      integration_status: 'fully_integrated'
    };
  }

  // ============================================
  // CLI インターフェース管理メソッド - REMOVED
  // All CLI functionality moved to ToolOrchestratorService
  // ============================================
  
  // processCLIRequest, selectOptimalCLI, startCLISession, 
  // getCLIStats, switchToGeminiCLI methods removed
  // Use ToolOrchestratorService for all CLI operations
}