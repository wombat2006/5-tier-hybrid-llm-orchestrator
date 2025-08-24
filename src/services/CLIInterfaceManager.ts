import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * CLIInterfaceManager - マルチCLI対応インターフェース管理システム
 * Claude Code、Gemini CLI、context7、chipherの統合管理
 */

export interface CLIConfig {
  claude_code: {
    enabled: boolean;
    command: string;
    args: string[];
    auth_required: boolean;
  };
  gemini_cli: {
    enabled: boolean;
    command: string;
    args: string[];
    model?: string;
    sandbox?: boolean;
    auth_required: boolean;
  };
  context7: {
    enabled: boolean;
    command: string;
    args: string[];
    auth_required: boolean;
  };
  chipher: {
    enabled: boolean;
    command: string;
    args: string[];
    auth_required: boolean;
  };
}

export interface CLIRequest {
  interface_type: 'claude_code' | 'gemini_cli' | 'context7' | 'chipher';
  prompt: string;
  options?: {
    model?: string;
    sandbox?: boolean;
    interactive?: boolean;
    yolo?: boolean;
    all_files?: boolean;
    debug?: boolean;
  };
  context?: {
    files?: string[];
    working_dir?: string;
  };
}

export interface CLIResponse {
  success: boolean;
  interface_used: string;
  response_text: string;
  metadata: {
    command_used: string;
    execution_time_ms: number;
    exit_code: number;
    working_directory: string;
    files_processed?: string[];
  };
  error?: {
    code: string;
    message: string;
    stderr?: string;
  };
}

export class CLIInterfaceManager {
  private static instance: CLIInterfaceManager;
  private config: CLIConfig;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  
  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): CLIInterfaceManager {
    if (!CLIInterfaceManager.instance) {
      CLIInterfaceManager.instance = new CLIInterfaceManager();
    }
    return CLIInterfaceManager.instance;
  }

  /**
   * CLI設定を読み込み
   */
  private loadConfig(): CLIConfig {
    const configPath = path.join(process.cwd(), 'config', 'cli-interfaces.yaml');
    
    // デフォルト設定
    const defaultConfig: CLIConfig = {
      claude_code: {
        enabled: true,
        command: 'claude',
        args: [],
        auth_required: true
      },
      gemini_cli: {
        enabled: true,
        command: 'gemini',
        args: [],
        model: 'gemini-2.5-pro',
        sandbox: false,
        auth_required: true
      },
      context7: {
        enabled: true, // c7コマンドでインストール済み
        command: 'c7',
        args: [],
        auth_required: true
      },
      chipher: {
        enabled: false, // 未インストールのため
        command: 'chipher', 
        args: [],
        auth_required: true
      }
    };

    try {
      if (fs.existsSync(configPath)) {
        const yaml = require('js-yaml');
        const configContent = fs.readFileSync(configPath, 'utf8');
        return { ...defaultConfig, ...yaml.load(configContent) };
      }
    } catch (error) {
      console.warn('[CLIInterfaceManager] Failed to load config, using defaults:', error);
    }

    return defaultConfig;
  }

  /**
   * 利用可能なCLIインターフェースを確認
   */
  public async checkAvailability(): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};
    
    for (const [cliName, cliConfig] of Object.entries(this.config)) {
      if (!cliConfig.enabled) {
        availability[cliName] = false;
        continue;
      }

      try {
        const result = await this.execCommand(cliConfig.command, ['--help'], { timeout: 5000 });
        availability[cliName] = result.exitCode === 0;
      } catch (error) {
        availability[cliName] = false;
      }
    }

    return availability;
  }

  /**
   * CLIリクエスト実行
   */
  public async execute(request: CLIRequest): Promise<CLIResponse> {
    const startTime = Date.now();
    const cliConfig = this.config[request.interface_type];

    if (!cliConfig || !cliConfig.enabled) {
      return {
        success: false,
        interface_used: request.interface_type,
        response_text: '',
        metadata: {
          command_used: '',
          execution_time_ms: 0,
          exit_code: -1,
          working_directory: process.cwd()
        },
        error: {
          code: 'CLI_NOT_AVAILABLE',
          message: `CLI interface '${request.interface_type}' is not available or disabled`
        }
      };
    }

    try {
      const { command, args } = this.buildCommand(request, cliConfig);
      console.log(`[CLIInterfaceManager] Executing ${request.interface_type}: ${command} ${args.join(' ')}`);

      const result = await this.execCommand(command, args, {
        input: request.prompt,
        cwd: request.context?.working_dir || process.cwd(),
        timeout: 300000 // 5分タイムアウト
      });

      const executionTime = Date.now() - startTime;

      return {
        success: result.exitCode === 0,
        interface_used: request.interface_type,
        response_text: result.stdout,
        metadata: {
          command_used: `${command} ${args.join(' ')}`,
          execution_time_ms: executionTime,
          exit_code: result.exitCode,
          working_directory: request.context?.working_dir || process.cwd(),
          files_processed: request.context?.files
        },
        error: result.exitCode !== 0 ? {
          code: 'CLI_EXECUTION_ERROR',
          message: `Command failed with exit code ${result.exitCode}`,
          stderr: result.stderr
        } : undefined
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        interface_used: request.interface_type,
        response_text: '',
        metadata: {
          command_used: cliConfig.command,
          execution_time_ms: executionTime,
          exit_code: -1,
          working_directory: process.cwd()
        },
        error: {
          code: 'CLI_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown CLI execution error'
        }
      };
    }
  }

  /**
   * コマンドライン引数を構築
   */
  private buildCommand(request: CLIRequest, cliConfig: any): { command: string; args: string[] } {
    const args = [...cliConfig.args];

    // DEPRECATED: This method will be removed in favor of ToolOrchestratorService
    switch (request.interface_type) {
      case 'gemini_cli':
        if (request.options?.model) {
          args.push('-m', request.options.model);
        } else if (cliConfig.model) {
          args.push('-m', cliConfig.model);
        }
        
        if (request.options?.sandbox || cliConfig.sandbox) {
          args.push('-s');
        }
        
        if (request.options?.yolo) {
          args.push('-y');
        }
        
        if (request.options?.all_files) {
          args.push('-a');
        }
        
        if (request.options?.debug) {
          args.push('-d');
        }

        if (request.options?.interactive) {
          args.push('-i', request.prompt);
        } else {
          args.push('-p', request.prompt);
        }
        break;

      case 'claude_code':
        // Claude Codeの場合、標準入力でプロンプトを送る
        break;

      case 'context7':
        // context7 (c7) 固有のオプション設定
        // c7 <projectIdentifier> [query...]
        // デフォルトでは現在のディレクトリ "." を使用
        const projectId = request.context?.working_dir ? 
          path.basename(request.context.working_dir) : '.';
        args.push(projectId);
        args.push(request.prompt);
        
        // 出力形式指定
        if (request.options?.debug) {
          args.push('-t', 'json');
        }
        break;

      case 'chipher':
        // chipher固有のオプション設定
        args.push(request.prompt);
        break;
    }

    return { command: cliConfig.command, args };
  }

  /**
   * コマンド実行ヘルパー
   */
  private execCommand(
    command: string, 
    args: string[], 
    options: {
      input?: string;
      cwd?: string;
      timeout?: number;
    } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      // タイムアウト処理
      const timeoutId = options.timeout ? setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout) : null;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0
        });
      });

      child.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });

      // 標準入力にプロンプトを送信
      if (options.input && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }
    });
  }

  /**
   * 最適なCLIインターフェースを自動選択
   */
  public async selectBestInterface(
    prompt: string, 
    preferences?: {
      coding_focused?: boolean;
      interactive_preferred?: boolean;
      sandbox_required?: boolean;
      context_analysis?: boolean;
      encryption_required?: boolean;
    }
  ): Promise<'claude_code' | 'gemini_cli' | 'context7' | 'chipher'> {
    const availability = await this.checkAvailability();
    
    // 暗号化が必要な場合
    if (preferences?.encryption_required && availability.chipher) {
      return 'chipher';
    }
    
    // コンテキスト分析が必要な場合
    if (preferences?.context_analysis && availability.context7) {
      return 'context7';
    }
    
    // サンドボックスが必要な場合
    if (preferences?.sandbox_required && availability.gemini_cli) {
      return 'gemini_cli';
    }
    
    // コーディング重視の場合
    if (preferences?.coding_focused && availability.claude_code) {
      return 'claude_code';
    }
    
    // インタラクティブモード優先の場合
    if (preferences?.interactive_preferred && availability.gemini_cli) {
      return 'gemini_cli';
    }

    // デフォルト優先順位: Gemini CLI > Claude Code > context7 > chipher
    const priority = ['gemini_cli', 'claude_code', 'context7', 'chipher'] as const;
    
    for (const cli of priority) {
      if (availability[cli]) {
        return cli;
      }
    }
    
    throw new Error('No CLI interface available');
  }

  /**
   * バッチ処理：複数のCLIで並列実行
   */
  public async executeParallel(
    requests: CLIRequest[]
  ): Promise<CLIResponse[]> {
    const promises = requests.map(request => this.execute(request));
    return Promise.all(promises);
  }

  /**
   * インタラクティブセッションの開始
   */
  public async startInteractiveSession(
    interfaceType: 'claude_code' | 'gemini_cli' | 'context7' | 'chipher',
    options?: {
      model?: string;
      sandbox?: boolean;
      working_dir?: string;
    }
  ): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const cliConfig = this.config[interfaceType];
    
    if (!cliConfig || !cliConfig.enabled) {
      throw new Error(`CLI interface '${interfaceType}' is not available`);
    }

    try {
      const args = [...cliConfig.args];
      
      if (interfaceType === 'gemini_cli') {
        if (options?.model) args.push('-m', options.model);
        if (options?.sandbox) args.push('-s');
        // インタラクティブモードはデフォルト
      }

      const child = spawn(cliConfig.command, args, {
        cwd: options?.working_dir || process.cwd(),
        stdio: 'inherit' // ユーザーの端末に接続
      });

      this.activeProcesses.set(sessionId, child);
      
      child.on('close', () => {
        this.activeProcesses.delete(sessionId);
      });

      console.log(`[CLIInterfaceManager] Started interactive session: ${sessionId} with ${interfaceType}`);
      return sessionId;
      
    } catch (error) {
      throw new Error(`Failed to start interactive session: ${error}`);
    }
  }

  /**
   * インタラクティブセッションの終了
   */
  public terminateSession(sessionId: string): boolean {
    const process = this.activeProcesses.get(sessionId);
    if (process) {
      process.kill('SIGTERM');
      this.activeProcesses.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * 設定を取得
   */
  public getConfig(): CLIConfig {
    return { ...this.config };
  }

  /**
   * 統計情報を取得
   */
  public getStats(): {
    available_interfaces: string[];
    active_sessions: number;
    config_loaded: boolean;
  } {
    return {
      available_interfaces: Object.entries(this.config)
        .filter(([_, config]) => config.enabled)
        .map(([name]) => name),
      active_sessions: this.activeProcesses.size,
      config_loaded: true
    };
  }
}