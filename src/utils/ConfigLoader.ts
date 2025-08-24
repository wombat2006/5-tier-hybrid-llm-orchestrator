import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { SystemConfig } from '../types';

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: SystemConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(configPath?: string): SystemConfig {
    if (this.config) {
      return this.config;
    }

    const defaultConfigPath = path.join(__dirname, '../../config/models.yaml');
    const finalConfigPath = configPath || defaultConfigPath;

    try {
      console.log(`[ConfigLoader] Loading configuration from: ${finalConfigPath}`);
      
      if (!fs.existsSync(finalConfigPath)) {
        throw new Error(`Configuration file not found: ${finalConfigPath}`);
      }

      const configFile = fs.readFileSync(finalConfigPath, 'utf8');
      const parsedConfig = yaml.load(configFile) as SystemConfig;

      // 設定ファイルの基本検証
      this.validateConfig(parsedConfig);

      this.config = parsedConfig;
      
      console.log(`[ConfigLoader] Configuration loaded successfully`);
      console.log(`[ConfigLoader] Models configured: ${Object.keys(parsedConfig.models).length}`);
      
      // 各Tierのモデル数を表示
      const tierCounts: Record<number, number> = {};
      Object.values(parsedConfig.models).forEach(model => {
        tierCounts[model.tier] = (tierCounts[model.tier] || 0) + 1;
      });
      
      Object.entries(tierCounts).forEach(([tier, count]) => {
        console.log(`[ConfigLoader] Tier ${tier}: ${count} models`);
      });

      // タスク分類設定の表示
      if (parsedConfig.routing && parsedConfig.routing.task_classification) {
        console.log(`[ConfigLoader] Task routing configuration:`);
        Object.entries(parsedConfig.routing.task_classification).forEach(([taskType, rules]) => {
          console.log(`  ${taskType}: preferred_tier=${rules.preferred_tier}, keywords=${rules.keywords?.length || 0}`);
        });
      }

      return this.config;

    } catch (error) {
      console.error(`[ConfigLoader] Failed to load configuration:`, error);
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateConfig(config: any): void {
    // 必須フィールドの検証
    if (!config.models || typeof config.models !== 'object') {
      throw new Error('Configuration must contain a "models" object');
    }

    if (!config.routing || typeof config.routing !== 'object') {
      throw new Error('Configuration must contain a "routing" object');
    }

    if (!config.collaboration || typeof config.collaboration !== 'object') {
      throw new Error('Configuration must contain a "collaboration" object');
    }

    if (!config.cost_management || typeof config.cost_management !== 'object') {
      throw new Error('Configuration must contain a "cost_management" object');
    }

    // モデル設定の検証
    const modelEntries = Object.entries(config.models);
    if (modelEntries.length === 0) {
      throw new Error('At least one model must be configured');
    }

    modelEntries.forEach(([modelId, modelConfig]: [string, any]) => {
      this.validateModelConfig(modelId, modelConfig);
    });

    // Tier検証 - 各Tierに少なくとも1つのモデルが存在することを確認
    const availableTiers = new Set<number>();
    Object.values(config.models).forEach((model: any) => {
      availableTiers.add(model.tier);
    });

    if (availableTiers.size === 0) {
      throw new Error('No valid tiers found in model configuration');
    }

    console.log(`[ConfigLoader] Validation passed - Available tiers: ${Array.from(availableTiers).sort().join(', ')}`);
  }

  private validateModelConfig(modelId: string, config: any): void {
    const requiredFields = ['id', 'name', 'provider', 'tier', 'cost_per_1k_tokens', 'capabilities', 'priority_keywords', 'api_client'];
    
    for (const field of requiredFields) {
      if (!(field in config)) {
        throw new Error(`Model "${modelId}" is missing required field: "${field}"`);
      }
    }

    // Tierの検証（Tier 4を追加）
    if (![0, 1, 2, 3, 4].includes(config.tier)) {
      throw new Error(`Model "${modelId}" has invalid tier: ${config.tier}. Must be 0, 1, 2, 3, or 4`);
    }

    // プロバイダーの検証
    const validProviders = ['alibaba_cloud', 'google', 'anthropic', 'openai', 'openrouter'];
    if (!validProviders.includes(config.provider)) {
      throw new Error(`Model "${modelId}" has invalid provider: ${config.provider}`);
    }

    // コスト設定の検証
    if (typeof config.cost_per_1k_tokens.input !== 'number' || typeof config.cost_per_1k_tokens.output !== 'number') {
      throw new Error(`Model "${modelId}" has invalid cost configuration`);
    }

    // 機能の検証
    if (!Array.isArray(config.capabilities) || config.capabilities.length === 0) {
      throw new Error(`Model "${modelId}" must have at least one capability`);
    }

    // キーワードの検証
    if (!Array.isArray(config.priority_keywords) || config.priority_keywords.length === 0) {
      throw new Error(`Model "${modelId}" must have at least one priority keyword`);
    }
  }

  public getModelConfig(modelId: string) {
    const config = this.getConfig();
    const modelConfig = config.models[modelId];
    
    if (!modelConfig) {
      throw new Error(`Model configuration not found: ${modelId}`);
    }
    
    return modelConfig;
  }

  public getModelsByTier(tier: number) {
    const config = this.getConfig();
    return Object.values(config.models).filter(model => model.tier === tier);
  }

  public getModelsByCapability(capability: string) {
    const config = this.getConfig();
    return Object.values(config.models).filter(model => 
      model.capabilities.includes(capability)
    );
  }

  public getConfig(): SystemConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  public reloadConfig(configPath?: string): SystemConfig {
    this.config = null;
    return this.loadConfig(configPath);
  }

  // 環境変数検証
  public validateEnvironmentVariables(): { valid: boolean; missingVars: string[]; warnings: string[] } {
    const config = this.getConfig();
    const missingVars: string[] = [];
    const warnings: string[] = [];

    // 各プロバイダーごとに必要な環境変数をチェック
    const providerEnvVars: Record<string, string[]> = {
      alibaba_cloud: ['ALIBABA_ACCESS_KEY_ID', 'ALIBABA_ACCESS_KEY_SECRET'],
      google: ['GOOGLE_API_KEY'],
      anthropic: ['ANTHROPIC_API_KEY'],
      openai: ['OPENAI_API_KEY']
    };

    // 設定されているプロバイダーを特定
    const usedProviders = new Set<string>();
    Object.values(config.models).forEach(model => {
      usedProviders.add(model.provider);
    });

    // 各プロバイダーの環境変数をチェック
    usedProviders.forEach(provider => {
      const requiredVars = providerEnvVars[provider] || [];
      requiredVars.forEach(envVar => {
        if (!process.env[envVar]) {
          missingVars.push(`${envVar} (required for ${provider})`);
        }
      });
    });

    // オプショナルな環境変数の警告
    const optionalVars = [
      'OPENWEATHER_API_KEY',
      'ALPHA_VANTAGE_API_KEY', 
      'NEWS_API_KEY'
    ];

    optionalVars.forEach(envVar => {
      if (!process.env[envVar]) {
        warnings.push(`${envVar} is not set (external APIs will be unavailable)`);
      }
    });

    return {
      valid: missingVars.length === 0,
      missingVars,
      warnings
    };
  }
}