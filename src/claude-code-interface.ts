/**
 * Claude Code環境用 5層ハイブリッドLLMオーケストレーター
 * 
 * WebアプリケーションのHTTPレイヤーを除去し、
 * Claude Code環境で直接使用可能なTypeScriptモジュールとして提供
 */

import { LLMOrchestrator } from './orchestrator/LLMOrchestrator';
import { LLMRequest, LLMResponse } from './types';
import dotenv from 'dotenv';

// 環境変数の自動読み込み
dotenv.config();

/**
 * Claude Code用のオーケストレーター設定
 */
export interface ClaudeCodeConfig {
  /** 月間予算上限（USD） */
  monthlyBudget?: number;
  /** デバッグログを有効にするか */
  enableDebugLogs?: boolean;
  /** 使用するモデルプリセット */
  modelPreset?: 'cost_optimized' | 'performance_optimized' | 'balanced';
}

/**
 * Claude Code用の簡素化されたリクエスト
 */
export interface ClaudeCodeRequest {
  /** メインのプロンプト */
  prompt: string;
  /** タスクの種類（自動判定される場合は省略可能） */
  taskType?: 'coding' | 'general' | 'complex_analysis' | 'premium' | 'auto';
  /** 特定のTierを強制指定（通常は省略） */
  preferredTier?: 0 | 1 | 2 | 3;
  /** 追加のコンテキスト情報 */
  context?: Record<string, any>;
}

/**
 * Claude Code用の簡素化されたレスポンス
 */
export interface ClaudeCodeResponse {
  /** 生成されたテキスト */
  text: string;
  /** 使用されたモデル名 */
  model: string;
  /** 使用されたTier */
  tier: number;
  /** 処理時間（ミリ秒） */
  processingTime: number;
  /** コスト情報 */
  cost: {
    total: number;
    input: number;
    output: number;
  };
  /** エラー情報（ある場合） */
  error?: string;
}

/**
 * 5層ハイブリッドLLMオーケストレーター（Claude Code用）
 * 
 * @example
 * ```typescript
 * import { HybridLLM } from './src/claude-code-interface';
 * 
 * const llm = new HybridLLM();
 * 
 * const response = await llm.generate({
 *   prompt: "Pythonでバイナリサーチを実装して",
 *   taskType: "coding"
 * });
 * 
 * console.log(response.text);
 * ```
 */
export class HybridLLM {
  private orchestrator!: LLMOrchestrator; // 非同期初期化のため!を使用
  private config: ClaudeCodeConfig;
  private initPromise: Promise<void>;

  /**
   * オーケストレーターを初期化
   * 
   * @param config オプショナルな設定
   */
  constructor(config: ClaudeCodeConfig = {}) {
    this.config = {
      monthlyBudget: 70,
      enableDebugLogs: false,
      modelPreset: 'balanced',
      ...config
    };

    // 非同期初期化
    this.initPromise = this.initialize();
  }

  /**
   * 内部初期化処理
   */
  private async initialize(): Promise<void> {
    try {
      this.orchestrator = new LLMOrchestrator();
      
      if (this.config.enableDebugLogs) {
        console.log('🚀 Claude Code用LLMオーケストレーター初期化完了');
        console.log(`💰 月間予算: $${this.config.monthlyBudget}`);
        console.log(`🎯 プリセット: ${this.config.modelPreset}`);
      }
    } catch (error) {
      throw new Error(`オーケストレーターの初期化に失敗: ${error}`);
    }
  }

  /**
   * メイン生成API - Claude Code環境で最も使用頻度の高いメソッド
   * 
   * @param request リクエストパラメータ
   * @returns Promise<ClaudeCodeResponse>
   */
  async generate(request: ClaudeCodeRequest): Promise<ClaudeCodeResponse> {
    await this.initPromise;

    const startTime = Date.now();
    
    try {
      // リクエストの変換
      const taskType = request.taskType || 'auto';
      const orchestratorRequest: LLMRequest = {
        prompt: request.prompt,
        task_type: taskType,
        preferred_tier: request.preferredTier,
        user_metadata: {
          session_id: 'claude-code',
          task_type: taskType as any,
          ...request.context
        }
      };

      if (this.config.enableDebugLogs) {
        console.log(`📥 リクエスト: ${request.prompt.substring(0, 50)}...`);
        console.log(`🎯 タスクタイプ: ${orchestratorRequest.task_type}`);
      }

      // オーケストレーターで処理
      const orchestratorResponse = await this.orchestrator.process(orchestratorRequest);

      const processingTime = Date.now() - startTime;

      // レスポンスの変換
      const response: ClaudeCodeResponse = {
        text: orchestratorResponse.response_text || '',
        model: orchestratorResponse.model_used,
        tier: orchestratorResponse.tier_used,
        processingTime,
        cost: {
          total: orchestratorResponse.cost_info.total_cost_usd,
          input: orchestratorResponse.cost_info.input_cost_usd,
          output: orchestratorResponse.cost_info.output_cost_usd,
        },
        error: orchestratorResponse.error?.message
      };

      if (this.config.enableDebugLogs) {
        console.log(`📤 応答完了: ${response.model} (Tier ${response.tier})`);
        console.log(`💰 コスト: $${response.cost.total.toFixed(4)}`);
        console.log(`⏱️  処理時間: ${processingTime}ms`);
      }

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      return {
        text: '',
        model: 'error',
        tier: -1,
        processingTime,
        cost: { total: 0, input: 0, output: 0 },
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * コーディング専用ショートカット（Tier 0強制）
   * 
   * @param task コーディングタスクの説明
   * @param language プログラミング言語
   * @param includeTests テストを含めるか
   */
  async generateCode(
    task: string, 
    language: string = 'python', 
    includeTests: boolean = false
  ): Promise<ClaudeCodeResponse> {
    const prompt = includeTests 
      ? `${language}で以下のタスクを実装し、テストも含めてください: ${task}`
      : `${language}で以下のタスクを実装してください: ${task}`;

    return this.generate({
      prompt,
      taskType: 'coding',
      preferredTier: 0, // Qwen3 Coder強制
      context: { language, includeTests }
    });
  }

  /**
   * システムの健康状態チェック
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    await this.initPromise;
    return this.orchestrator.healthCheck();
  }

  /**
   * 利用可能なモデル一覧取得
   */
  getAvailableModels() {
    return this.orchestrator.getAvailableModels();
  }

  /**
   * 使用統計取得
   */
  getMetrics() {
    return this.orchestrator.getMetrics();
  }

  /**
   * 統計リセット（開発・テスト用）
   */
  resetMetrics(): void {
    this.orchestrator.resetMetrics();
  }

  /**
   * バッチ処理 - 複数のプロンプトを並列処理
   * 
   * @param requests 複数のリクエスト
   * @param maxConcurrency 最大並列数
   */
  async generateBatch(
    requests: ClaudeCodeRequest[], 
    maxConcurrency: number = 3
  ): Promise<ClaudeCodeResponse[]> {
    const chunks: ClaudeCodeRequest[][] = [];
    for (let i = 0; i < requests.length; i += maxConcurrency) {
      chunks.push(requests.slice(i, i + maxConcurrency));
    }

    const results: ClaudeCodeResponse[] = [];
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(request => this.generate(request))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * ストリーミング風の逐次処理（将来拡張用）
   * 現在は通常の生成を返すが、将来的にストリーミング対応予定
   */
  async *generateStream(request: ClaudeCodeRequest): AsyncGenerator<{ chunk: string; done: boolean }> {
    const response = await this.generate(request);
    yield { chunk: response.text, done: true };
  }
}

/**
 * デフォルトインスタンス（即座に使用可能）
 * 
 * @example
 * ```typescript
 * import { defaultLLM } from './src/claude-code-interface';
 * 
 * const response = await defaultLLM.generate({
 *   prompt: "量子コンピューティングについて説明して"
 * });
 * ```
 */
export const defaultLLM = new HybridLLM();

/**
 * 便利なヘルパー関数群
 */

/**
 * 最もシンプルな生成関数
 * 
 * @param prompt プロンプト
 * @returns 生成されたテキスト
 */
export async function ask(prompt: string): Promise<string> {
  const response = await defaultLLM.generate({ prompt });
  return response.text;
}

/**
 * コード生成専用ヘルパー
 * 
 * @param task タスク説明
 * @param language 言語（デフォルト: 'python'）
 * @returns 生成されたコード
 */
export async function code(task: string, language: string = 'python'): Promise<string> {
  const response = await defaultLLM.generateCode(task, language);
  return response.text;
}

/**
 * 設定付きカスタムインスタンス作成
 * 
 * @param config 設定
 * @returns 新しいHybridLLMインスタンス
 */
export function createLLM(config: ClaudeCodeConfig): HybridLLM {
  return new HybridLLM(config);
}