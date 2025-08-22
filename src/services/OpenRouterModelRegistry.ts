import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ModelConfig } from '../types';
import { OpenRouterModelInfo, UniversalOpenRouterClient } from '../clients/UniversalOpenRouterClient';
import { MockUniversalOpenRouterClient } from '../clients/MockUniversalOpenRouterClient';

/**
 * OpenRouterModelRegistry - OpenRouterモデルの動的管理
 * 設定ファイルからモデル情報を読み込み、動的にクライアントを生成
 */

export interface OpenRouterModelDefinition {
  openrouter_id: string;
  name: string;
  provider_family: string;
  tier: 0 | 1 | 2 | 3;
  pricing: {
    prompt: number;
    completion: number;
  };
  context_length: number;
  capabilities: string[];
  specialties?: string[];
  rate_limits?: {
    requests_per_minute: number;
    daily_limit: number;
  };
  description: string;
}

export interface OpenRouterConfig {
  coding_models: Record<string, OpenRouterModelDefinition>;
  general_models: Record<string, OpenRouterModelDefinition>;
  reasoning_models: Record<string, OpenRouterModelDefinition>;
  premium_models: Record<string, OpenRouterModelDefinition>;
  specialized_models: Record<string, OpenRouterModelDefinition>;
  free_models: Record<string, OpenRouterModelDefinition>;
  presets: Record<string, Record<string, string>>;
  defaults: {
    timeout_ms: number;
    retry_count: number;
    fallback_enabled: boolean;
    cost_tracking: boolean;
  };
}

export class OpenRouterModelRegistry {
  private static instance: OpenRouterModelRegistry;
  private config: OpenRouterConfig | null = null;
  private modelCache: Map<string, ModelConfig> = new Map();
  private clientCache: Map<string, UniversalOpenRouterClient | MockUniversalOpenRouterClient> = new Map();

  private constructor() {}

  public static getInstance(): OpenRouterModelRegistry {
    if (!OpenRouterModelRegistry.instance) {
      OpenRouterModelRegistry.instance = new OpenRouterModelRegistry();
    }
    return OpenRouterModelRegistry.instance;
  }

  /**
   * OpenRouterモデル設定を読み込み
   */
  public loadConfig(configPath?: string): void {
    const configFile = configPath || path.join(process.cwd(), 'config', 'openrouter-models.yaml');
    
    try {
      if (!fs.existsSync(configFile)) {
        console.warn(`[OpenRouterModelRegistry] Config file not found: ${configFile}`);
        this.createDefaultConfig(configFile);
      }

      const configContent = fs.readFileSync(configFile, 'utf8');
      this.config = yaml.load(configContent) as OpenRouterConfig;
      console.log('[OpenRouterModelRegistry] ✅ Configuration loaded successfully');
      
      this.validateConfig();
      this.buildModelCache();
      
    } catch (error) {
      console.error('[OpenRouterModelRegistry] ❌ Failed to load config:', error);
      throw new Error(`Failed to load OpenRouter model configuration: ${error}`);
    }
  }

  /**
   * 利用可能なモデル一覧を取得
   */
  public getAvailableModels(): ModelConfig[] {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }

    return Array.from(this.modelCache.values());
  }

  /**
   * Tierごとのモデル一覧を取得
   */
  public getModelsByTier(tier: 0 | 1 | 2 | 3): ModelConfig[] {
    return this.getAvailableModels().filter(model => model.tier === tier);
  }

  /**
   * 特定のモデルを取得
   */
  public getModel(modelId: string): ModelConfig | undefined {
    return this.modelCache.get(modelId);
  }

  /**
   * UniversalOpenRouterClientを取得（キャッシュ付き）
   * APIキーがない場合はMockクライアントを返す
   */
  public getClient(modelId: string): UniversalOpenRouterClient | MockUniversalOpenRouterClient | null {
    if (this.clientCache.has(modelId)) {
      return this.clientCache.get(modelId)!;
    }

    const modelConfig = this.getModel(modelId);
    if (!modelConfig) {
      console.error(`[OpenRouterModelRegistry] Model not found: ${modelId}`);
      return null;
    }

    try {
      const openRouterModelInfo = this.buildOpenRouterModelInfo(modelId);
      
      // APIキーの存在確認
      const apiKey = process.env.OPENROUTER_API_KEY;
      const hasValidApiKey = apiKey && 
                           !apiKey.includes('test') && 
                           !apiKey.includes('development') &&
                           !apiKey.includes('your_') &&
                           apiKey.startsWith('sk-or-v1-');

      let client;
      if (hasValidApiKey) {
        // 実際のOpenRouterクライアント
        client = new UniversalOpenRouterClient(modelConfig, openRouterModelInfo);
        console.log(`[OpenRouterModelRegistry] ✅ Real OpenRouter client created for: ${modelId}`);
      } else {
        // モッククライアント
        const { MockUniversalOpenRouterClient } = require('../clients/MockUniversalOpenRouterClient');
        client = new MockUniversalOpenRouterClient(modelConfig, openRouterModelInfo);
        console.log(`[OpenRouterModelRegistry] 🔄 Mock client created for: ${modelId} (no valid API key)`);
      }
      
      this.clientCache.set(modelId, client);
      return client;
    } catch (error) {
      console.error(`[OpenRouterModelRegistry] ❌ Failed to create client for ${modelId}:`, error);
      
      // フォールバックとしてMockクライアントを試行
      try {
        const openRouterModelInfo = this.buildOpenRouterModelInfo(modelId);
        const { MockUniversalOpenRouterClient } = require('../clients/MockUniversalOpenRouterClient');
        const mockClient = new MockUniversalOpenRouterClient(modelConfig, openRouterModelInfo);
        
        this.clientCache.set(modelId, mockClient);
        console.log(`[OpenRouterModelRegistry] 🔄 Fallback to mock client for: ${modelId}`);
        return mockClient;
      } catch (fallbackError) {
        console.error(`[OpenRouterModelRegistry] ❌ Mock client fallback also failed:`, fallbackError);
        return null;
      }
    }
  }

  /**
   * プリセット設定を適用
   */
  public applyPreset(presetName: string): Record<number, string> {
    if (!this.config?.presets[presetName]) {
      throw new Error(`Preset not found: ${presetName}`);
    }

    const preset = this.config.presets[presetName];
    const result: Record<number, string> = {};

    for (const [tierKey, modelId] of Object.entries(preset)) {
      const tierNumber = parseInt(tierKey.replace('tier', ''));
      if (!isNaN(tierNumber) && tierNumber >= 0 && tierNumber <= 3) {
        result[tierNumber] = modelId;
      }
    }

    console.log(`[OpenRouterModelRegistry] ✅ Applied preset: ${presetName}`, result);
    return result;
  }

  /**
   * 新しいモデルを動的に追加
   */
  public addModel(
    category: keyof OpenRouterConfig,
    modelId: string, 
    definition: OpenRouterModelDefinition
  ): void {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    // 設定に追加
    if (!this.config[category] || typeof this.config[category] !== 'object') {
      console.warn(`[OpenRouterModelRegistry] Invalid category: ${category}`);
      return;
    }

    (this.config[category] as Record<string, OpenRouterModelDefinition>)[modelId] = definition;
    
    // キャッシュに追加
    const modelConfig = this.convertToModelConfig(modelId, definition);
    this.modelCache.set(modelId, modelConfig);
    
    console.log(`[OpenRouterModelRegistry] ✅ Added new model: ${modelId} to category: ${category}`);
  }

  /**
   * コスト効率の良いモデルを検索
   */
  public findCostEffectiveModel(tier: 0 | 1 | 2 | 3, maxCostPerMTokens?: number): ModelConfig | null {
    const tierModels = this.getModelsByTier(tier);
    
    let bestModel: ModelConfig | null = null;
    let lowestCost = maxCostPerMTokens || Infinity;

    for (const model of tierModels) {
      const avgCost = (model.cost_per_1k_tokens.input + model.cost_per_1k_tokens.output) / 2;
      if (avgCost < lowestCost) {
        lowestCost = avgCost;
        bestModel = model;
      }
    }

    return bestModel;
  }

  /**
   * 特定機能を持つモデルを検索
   */
  public findModelsByCapability(capability: string): ModelConfig[] {
    return this.getAvailableModels().filter(model => 
      model.capabilities.includes(capability)
    );
  }

  /**
   * 設定の妥当性検証
   */
  private validateConfig(): void {
    if (!this.config) {
      throw new Error('Configuration is null');
    }

    const requiredSections = ['coding_models', 'general_models', 'reasoning_models', 'premium_models'];
    for (const section of requiredSections) {
      if (!this.config[section as keyof OpenRouterConfig]) {
        console.warn(`[OpenRouterModelRegistry] Missing section: ${section}`);
      }
    }

    console.log('[OpenRouterModelRegistry] ✅ Configuration validation passed');
  }

  /**
   * ModelConfigキャッシュを構築
   */
  private buildModelCache(): void {
    if (!this.config) return;

    this.modelCache.clear();
    
    const categories = ['coding_models', 'general_models', 'reasoning_models', 'premium_models', 'specialized_models', 'free_models'];
    
    for (const category of categories) {
      const models = this.config[category as keyof OpenRouterConfig] as Record<string, OpenRouterModelDefinition>;
      if (models) {
        for (const [modelId, definition] of Object.entries(models)) {
          const modelConfig = this.convertToModelConfig(modelId, definition);
          this.modelCache.set(modelId, modelConfig);
        }
      }
    }

    console.log(`[OpenRouterModelRegistry] ✅ Built cache for ${this.modelCache.size} models`);
  }

  /**
   * OpenRouterModelDefinitionをModelConfigに変換
   */
  private convertToModelConfig(modelId: string, definition: OpenRouterModelDefinition): ModelConfig {
    return {
      id: modelId,
      name: definition.openrouter_id,
      provider: 'openrouter',
      tier: definition.tier,
      cost_per_1k_tokens: {
        input: definition.pricing.prompt / 1000,  // per 1M tokens -> per 1K tokens
        output: definition.pricing.completion / 1000
      },
      latency_ms: this.estimateLatency(definition),
      max_tokens: Math.min(definition.context_length, 4096), // 出力トークン制限
      capabilities: definition.capabilities,
      languages: definition.specialties || [],
      priority_keywords: this.generateKeywords(definition),
      api_client: 'UniversalOpenRouterClient'
    };
  }

  /**
   * OpenRouterModelInfoを構築
   */
  private buildOpenRouterModelInfo(modelId: string): OpenRouterModelInfo | undefined {
    const definition = this.findDefinitionById(modelId);
    if (!definition) return undefined;

    return {
      id: definition.openrouter_id,
      name: definition.name,
      description: definition.description,
      context_length: definition.context_length,
      pricing: definition.pricing,
      capabilities: definition.capabilities,
      provider: definition.provider_family
    };
  }

  /**
   * モデル定義をIDで検索
   */
  private findDefinitionById(modelId: string): OpenRouterModelDefinition | undefined {
    if (!this.config) return undefined;

    const categories = ['coding_models', 'general_models', 'reasoning_models', 'premium_models', 'specialized_models', 'free_models'];
    
    for (const category of categories) {
      const models = this.config[category as keyof OpenRouterConfig] as Record<string, OpenRouterModelDefinition>;
      if (models && models[modelId]) {
        return models[modelId];
      }
    }

    return undefined;
  }

  /**
   * レスポンス時間を推定
   */
  private estimateLatency(definition: OpenRouterModelDefinition): number {
    // プロバイダーとモデルサイズに基づく推定
    const baseLatency = {
      'qwen': 300,
      'anthropic': 800,
      'openai': 600,
      'google': 500,
      'meta': 350,
      'gryphe': 400
    };

    return baseLatency[definition.provider_family as keyof typeof baseLatency] || 500;
  }

  /**
   * 優先度キーワードを生成
   */
  private generateKeywords(definition: OpenRouterModelDefinition): string[] {
    const keywords: string[] = [];
    
    // 機能ベースのキーワード
    for (const capability of definition.capabilities) {
      switch (capability) {
        case 'coding':
          keywords.push('code', 'コード', 'function', '関数', 'プログラム');
          break;
        case 'reasoning':
          keywords.push('analyze', '分析', 'think', '考える', 'logic');
          break;
        case 'mathematics':
          keywords.push('math', '数学', 'calculate', '計算', 'solve');
          break;
        case 'creative_writing':
          keywords.push('write', '書く', 'story', '物語', 'creative');
          break;
      }
    }

    return [...new Set(keywords)]; // 重複除去
  }

  /**
   * デフォルト設定ファイルを作成
   */
  private createDefaultConfig(configPath: string): void {
    const defaultConfig = `# デフォルトOpenRouter設定
coding_models:
  qwen3_coder_free:
    openrouter_id: "qwen/qwen-3-coder-32b-instruct:free"
    name: "Qwen3-Coder (Free)"
    provider_family: "qwen"
    tier: 0
    pricing: {prompt: 0, completion: 0}
    context_length: 262144
    capabilities: [coding, debugging]
    description: "無料コーディングモデル"

general_models:
  llama3_free:
    openrouter_id: "meta-llama/llama-3-8b-instruct:free"
    name: "Llama 3 8B (Free)"
    provider_family: "meta"
    tier: 1
    pricing: {prompt: 0, completion: 0}
    context_length: 8192
    capabilities: [general_tasks]
    description: "無料汎用モデル"

reasoning_models: {}
premium_models: {}
specialized_models: {}
free_models: {}

presets:
  free_tier:
    tier0: "qwen3_coder_free"
    tier1: "llama3_free"

defaults:
  timeout_ms: 30000
  retry_count: 3
  fallback_enabled: true
  cost_tracking: true`;

    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, defaultConfig);
    console.log(`[OpenRouterModelRegistry] ✅ Created default config: ${configPath}`);
  }
}