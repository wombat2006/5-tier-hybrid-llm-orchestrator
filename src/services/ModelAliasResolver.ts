import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * ModelAliasResolver - LLMモデル名エイリアス解決システム
 * バージョンアップに柔軟に対応するためのエイリアス管理
 */

export interface ModelAlias {
  stable: string;
  latest: string;
  preview: string;
  legacy: string;
  [key: string]: string;
}

export interface ProviderDefaults {
  default_alias: string;
  fallback_model: string;
  official_aliases?: boolean;  // 公式エイリアス対応フラグ
}

export interface VersionManagement {
  auto_update: {
    enabled: boolean;
    check_interval_hours: number;
    update_policy: 'manual' | 'stable' | 'latest';
  };
  version_check: {
    enabled: boolean;
    warn_on_deprecated: boolean;
    log_version_info: boolean;
  };
  fallback: {
    enabled: boolean;
    max_retries: number;
    fallback_chain: string[];
  };
}

export interface AliasConfig {
  aliases: Record<string, ModelAlias>;
  provider_defaults: Record<string, ProviderDefaults>;
  version_management: VersionManagement;
  usage_examples?: any;
  migration_notes?: any;
}

export class ModelAliasResolver {
  private static instance: ModelAliasResolver;
  private config: AliasConfig | null = null;
  private aliasCache: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): ModelAliasResolver {
    if (!ModelAliasResolver.instance) {
      ModelAliasResolver.instance = new ModelAliasResolver();
    }
    return ModelAliasResolver.instance;
  }

  /**
   * エイリアス設定を読み込み
   */
  public loadConfig(configPath?: string): void {
    const configFile = configPath || path.join(process.cwd(), 'config', 'model-aliases.yaml');
    
    try {
      if (!fs.existsSync(configFile)) {
        console.warn(`[ModelAliasResolver] Config file not found: ${configFile}`);
        this.createDefaultConfig(configFile);
      }

      const configContent = fs.readFileSync(configFile, 'utf8');
      this.config = yaml.load(configContent) as AliasConfig;
      console.log('[ModelAliasResolver] ✅ Alias configuration loaded successfully');
      
      this.validateConfig();
      this.buildAliasCache();
      
    } catch (error) {
      console.error('[ModelAliasResolver] ❌ Failed to load config:', error);
      throw new Error(`Failed to load model alias configuration: ${error}`);
    }
  }

  /**
   * モデル名エイリアスを解決
   * @param modelAlias - エイリアス形式のモデル名 (例: "claude:stable", "gpt:latest")
   * @returns 実際のモデル名
   */
  public resolveAlias(modelAlias: string): string {
    if (!this.config) {
      console.warn('[ModelAliasResolver] Configuration not loaded, using original model name');
      return modelAlias;
    }

    // キャッシュチェック
    if (this.aliasCache.has(modelAlias)) {
      return this.aliasCache.get(modelAlias)!;
    }

    try {
      const resolved = this.resolveAliasInternal(modelAlias);
      this.aliasCache.set(modelAlias, resolved);
      
      // 公式エイリアス対応の判定とログ
      const [provider] = modelAlias.split(':', 2);
      const providerConfig = this.config.provider_defaults[provider];
      
      if (this.config.version_management.version_check.log_version_info) {
        const aliasType = providerConfig?.official_aliases ? '公式' : 'カスタム';
        console.log(`[ModelAliasResolver] 🔄 Resolved ${aliasType} alias: ${modelAlias} → ${resolved}`);
      }
      
      return resolved;
    } catch (error) {
      console.error(`[ModelAliasResolver] ❌ Failed to resolve alias: ${modelAlias}`, error);
      return modelAlias; // フォールバック：元の名前をそのまま返す
    }
  }

  /**
   * 内部エイリアス解決処理
   */
  private resolveAliasInternal(modelAlias: string): string {
    // エイリアス形式チェック (provider:alias)
    if (!modelAlias.includes(':')) {
      // エイリアス形式でない場合はそのまま返す
      return modelAlias;
    }

    const [providerKey, aliasKey] = modelAlias.split(':', 2);
    
    // プロバイダー存在チェック
    if (!this.config!.aliases[providerKey]) {
      console.warn(`[ModelAliasResolver] Unknown provider: ${providerKey}`);
      return modelAlias;
    }

    const providerAliases = this.config!.aliases[providerKey];
    
    // エイリアス存在チェック
    if (!providerAliases[aliasKey]) {
      // デフォルトエイリアス使用を試行
      const defaultAlias = this.config!.provider_defaults[providerKey]?.default_alias || 'stable';
      if (providerAliases[defaultAlias]) {
        console.warn(`[ModelAliasResolver] Unknown alias ${aliasKey}, using default: ${defaultAlias}`);
        return providerAliases[defaultAlias];
      }
      
      // フォールバック
      return this.config!.provider_defaults[providerKey]?.fallback_model || modelAlias;
    }

    return providerAliases[aliasKey];
  }

  /**
   * 利用可能なエイリアス一覧を取得
   */
  public getAvailableAliases(): Record<string, string[]> {
    if (!this.config) {
      return {};
    }

    const result: Record<string, string[]> = {};
    for (const [provider, aliases] of Object.entries(this.config.aliases)) {
      result[provider] = Object.keys(aliases);
    }
    return result;
  }

  /**
   * プロバイダーの推奨モデル取得
   */
  public getRecommendedModel(provider: string, preference: 'stable' | 'latest' | 'preview' = 'stable'): string {
    if (!this.config?.aliases[provider]) {
      console.warn(`[ModelAliasResolver] Unknown provider: ${provider}`);
      return '';
    }

    return this.resolveAlias(`${provider}:${preference}`);
  }

  /**
   * モデル廃止チェック（2025年公式情報更新）
   */
  public checkDeprecation(modelName: string): { deprecated: boolean; replacement?: string; message?: string } {
    // 2025年公式廃止情報に基づくチェック
    const deprecatedModels = {
      // Anthropic 公式廃止予定
      'claude-3-5-sonnet-20240620': {
        replacement: 'claude:sonnet4',
        message: 'Claude 3.5 Sonnet (20240620) will be retired on 2025-10-22. Migrate to Claude Sonnet 4.'
      },
      'claude-3-5-sonnet-20241022': {
        replacement: 'claude:sonnet4',
        message: 'Claude 3.5 Sonnet (20241022) will be retired on 2025-10-22. Migrate to Claude Sonnet 4.'
      },
      'claude-3-opus-20240229': {
        replacement: 'claude:opus4',
        message: 'Claude 3 Opus is superseded by Claude Opus 4.1. Upgrade for better performance.'
      },
      // OpenAI 公式廃止予定
      'gpt-4.5-preview': {
        replacement: 'gpt:4.1',
        message: 'GPT-4.5 Preview will be turned off on 2025-07-14. Use GPT-4.1 for better performance.'
      },
      'gpt-4-turbo-2024-04-09': {
        replacement: 'gpt:4.1',
        message: 'GPT-4 Turbo is superseded by GPT-4.1. Upgrade for improved performance and lower costs.'
      },
      // Google レガシーモデル
      'gemini-1.0-pro': {
        replacement: 'gemini:2.5-pro',
        message: 'Gemini 1.0 Pro is legacy. Upgrade to Gemini 2.5 Pro for latest capabilities.'
      }
    };

    if (deprecatedModels[modelName as keyof typeof deprecatedModels]) {
      const info = deprecatedModels[modelName as keyof typeof deprecatedModels];
      if (this.config?.version_management.version_check.warn_on_deprecated) {
        console.warn(`[ModelAliasResolver] ⚠️ DEPRECATED: ${info.message}`);
      }
      return { deprecated: true, ...info };
    }

    return { deprecated: false };
  }

  /**
   * バージョンアップ支援（2025年最新モデル情報）
   */
  public suggestUpgrade(currentModel: string): { hasUpgrade: boolean; suggested?: string; benefits?: string[] } {
    const upgradePaths = {
      // Anthropic アップグレード
      'claude-3-5-sonnet-20241022': {
        suggested: 'claude:sonnet4',
        benefits: ['64K出力トークン', 'SWE-bench 72.7%性能', 'Extended thinking機能', '同価格でより高性能']
      },
      'claude-3-5-sonnet-20240620': {
        suggested: 'claude:sonnet4',
        benefits: ['大幅性能向上', '64K出力対応', 'Extended thinking', '2025年10月22日までに移行必要']
      },
      'claude-3-opus-20240229': {
        suggested: 'claude:opus4',
        benefits: ['Claude Opus 4.1の最高性能', '複雑推論能力向上', '高度なコーディング能力']
      },
      // OpenAI アップグレード  
      'gpt-4o-2024-08-06': {
        suggested: 'gpt:4.1',
        benefits: ['GPT-4.1の最新性能', '100万トークンコンテキスト', '長文理解能力向上', 'コスト効率改善']
      },
      'gpt-4-turbo-2024-04-09': {
        suggested: 'gpt:4.1',
        benefits: ['大幅な性能向上', 'レイテンシ半減', '83%コスト削減', '知識カットオフ2024年6月']
      },
      'gpt-4o-mini': {
        suggested: 'gpt:4.1-mini',
        benefits: ['GPT-4.1-miniの高性能', 'コスト効率最適化', '小型モデルで最高性能']
      },
      // Google アップグレード
      'gemini-1.5-pro-002': {
        suggested: 'gemini:2.5-pro',
        benefits: ['Gemini 2.5 Proの最新機能', 'Adaptive thinking', '安定版リリース']
      },
      'gemini-1.0-pro': {
        suggested: 'gemini:2.5-pro',
        benefits: ['200万トークン対応', '大幅性能向上', '最新安定版', 'マルチモーダル強化']
      },
      'gemini-2.0-flash-exp': {
        suggested: 'gemini:2.0-flash',
        benefits: ['実験版から安定版へ', '高いレート制限', '簡素化された価格設定']
      }
    };

    if (upgradePaths[currentModel as keyof typeof upgradePaths]) {
      return { hasUpgrade: true, ...upgradePaths[currentModel as keyof typeof upgradePaths] };
    }

    return { hasUpgrade: false };
  }

  /**
   * フォールバックチェーン実行
   */
  public getFallbackChain(originalAlias: string): string[] {
    if (!this.config?.version_management.fallback.enabled) {
      return [originalAlias];
    }

    const chain = [originalAlias];
    const [provider] = originalAlias.split(':', 2);
    
    for (const fallbackType of this.config.version_management.fallback.fallback_chain) {
      const fallbackAlias = `${provider}:${fallbackType}`;
      if (fallbackAlias !== originalAlias) {
        chain.push(fallbackAlias);
      }
    }

    return chain;
  }

  /**
   * 設定妥当性検証
   */
  private validateConfig(): void {
    if (!this.config) {
      throw new Error('Configuration is null');
    }

    const requiredSections = ['aliases', 'provider_defaults', 'version_management'];
    for (const section of requiredSections) {
      if (!this.config[section as keyof AliasConfig]) {
        console.warn(`[ModelAliasResolver] Missing section: ${section}`);
      }
    }

    console.log('[ModelAliasResolver] ✅ Configuration validation passed');
  }

  /**
   * エイリアスキャッシュを構築
   */
  private buildAliasCache(): void {
    if (!this.config) return;

    this.aliasCache.clear();
    
    // よく使われるエイリアスを事前キャッシュ
    const commonAliases = ['stable', 'latest', 'preview', 'legacy'];
    
    for (const [provider, aliases] of Object.entries(this.config.aliases)) {
      for (const aliasType of commonAliases) {
        if (aliases[aliasType]) {
          const key = `${provider}:${aliasType}`;
          this.aliasCache.set(key, aliases[aliasType]);
        }
      }
    }

    console.log(`[ModelAliasResolver] ✅ Built alias cache for ${this.aliasCache.size} entries`);
  }

  /**
   * デフォルト設定ファイル作成
   */
  private createDefaultConfig(configPath: string): void {
    const defaultConfig = `# 自動生成されたデフォルトエイリアス設定（2025年公式エイリアス対応）
aliases:
  claude:
    stable: "claude-sonnet-4-20250514"     # 公式安定版
    latest: "claude-sonnet-4-20250514"     # 公式最新版
    sonnet4: "claude-sonnet-4-20250514"    # Claude Sonnet 4
    opus4: "claude-opus-4-20250514"        # Claude Opus 4.1
    legacy: "claude-3-5-sonnet-20241022"   # レガシー（廃止予定: 2025-10-22）
  gpt:
    stable: "gpt-4.1"                      # 公式安定版（エイリアス）
    latest: "gpt-4.1"                      # 公式最新版（エイリアス）
    "4.1": "gpt-4.1"                      # GPT-4.1（公式エイリアス）
    "4.1-mini": "gpt-4.1-mini"           # GPT-4.1 Mini（公式エイリアス）
    "4o": "gpt-4o"                        # GPT-4o（公式エイリアス）
    legacy: "gpt-4-turbo"                  # レガシー
  gemini:
    stable: "gemini-2.5-pro"               # 公式安定版（エイリアス）
    latest: "gemini-2.5-pro"               # 公式最新版（エイリアス）
    "2.5-pro": "gemini-2.5-pro"           # Gemini 2.5 Pro（公式エイリアス）
    "2.5-flash": "gemini-2.5-flash"       # Gemini 2.5 Flash（公式エイリアス）
    legacy: "gemini-1.0-pro"               # レガシー

provider_defaults:
  anthropic:
    default_alias: "stable"
    fallback_model: "claude-sonnet-4-20250514"
    official_aliases: true                  # 公式エイリアス対応
  openai:
    default_alias: "stable" 
    fallback_model: "gpt-4.1"
    official_aliases: true                  # 公式エイリアス対応
  google:
    default_alias: "stable"
    fallback_model: "gemini-2.5-pro"
    official_aliases: true                  # 公式エイリアス対応

version_management:
  auto_update:
    enabled: false
    check_interval_hours: 24
    update_policy: "manual"
  version_check:
    enabled: true
    warn_on_deprecated: true
    log_version_info: true
  fallback:
    enabled: true
    max_retries: 3
    fallback_chain: ["stable", "legacy", "latest"]`;

    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, defaultConfig);
    console.log(`[ModelAliasResolver] ✅ Created default config: ${configPath}`);
  }

  /**
   * 設定リロード
   */
  public reloadConfig(): void {
    this.aliasCache.clear();
    this.loadConfig();
  }

  /**
   * ランタイム統計取得（公式エイリアス情報を含む）
   */
  public getStats(): {
    cached_aliases: number;
    providers: number;
    total_aliases: number;
    official_alias_providers: number;
  } {
    if (!this.config) {
      return { cached_aliases: 0, providers: 0, total_aliases: 0, official_alias_providers: 0 };
    }

    const providers = Object.keys(this.config.aliases).length;
    const totalAliases = Object.values(this.config.aliases)
      .reduce((sum, aliases) => sum + Object.keys(aliases).length, 0);
    
    // 公式エイリアス対応プロバイダー数
    const officialAliasProviders = Object.values(this.config.provider_defaults)
      .filter(provider => provider.official_aliases === true).length;

    return {
      cached_aliases: this.aliasCache.size,
      providers,
      total_aliases: totalAliases,
      official_alias_providers: officialAliasProviders
    };
  }
}