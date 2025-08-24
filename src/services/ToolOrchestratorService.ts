import { CLIInterfaceManager, CLIRequest, CLIResponse } from './CLIInterfaceManager';

/**
 * ToolOrchestratorService - 外部ツール実行オーケストレーションサービス
 * LLMOrchestrator から分離されたツール管理専用サービス
 */

export interface ToolCategory {
  ai_interfaces: {
    claude_code: boolean;
    gemini_cli: boolean;
  };
  analysis_tools: {
    context7: boolean;
    chipher: boolean;
  };
}

export type AIInterface = 'claude_code' | 'gemini_cli';
export type AnalysisTool = 'context7' | 'chipher';
export type ToolType = AIInterface | AnalysisTool;

export interface AnalysisToolRequest {
  tool_type: AnalysisTool;
  command: string;
  args: string[];
  options?: {
    output_format?: 'json' | 'txt';
    timeout?: number;
    working_dir?: string;
  };
}

export interface AnalysisToolResponse {
  success: boolean;
  tool_used: string;
  result: string;
  metadata: {
    command_executed: string;
    execution_time_ms: number;
    exit_code: number;
    working_directory: string;
  };
  error?: {
    code: string;
    message: string;
    stderr?: string;
  };
}

export class ToolOrchestratorService {
  private static instance: ToolOrchestratorService;
  private cliManager: CLIInterfaceManager;
  private availableTools: ToolCategory = {
    ai_interfaces: {
      claude_code: false,
      gemini_cli: false
    },
    analysis_tools: {
      context7: false,
      chipher: false
    }
  };

  private constructor() {
    console.log('[ToolOrchestrator] Initializing Tool Orchestration Service...');
    this.cliManager = CLIInterfaceManager.getInstance();
    this.initializeToolAvailability();
  }

  public static getInstance(): ToolOrchestratorService {
    if (!ToolOrchestratorService.instance) {
      ToolOrchestratorService.instance = new ToolOrchestratorService();
    }
    return ToolOrchestratorService.instance;
  }

  /**
   * ツール可用性の初期化
   */
  private async initializeToolAvailability(): Promise<void> {
    try {
      const availability = await this.cliManager.checkAvailability();
      
      // AI Interfaces
      this.availableTools.ai_interfaces.claude_code = availability['claude_code'] || false;
      this.availableTools.ai_interfaces.gemini_cli = availability['gemini_cli'] || false;
      
      // Analysis Tools
      this.availableTools.analysis_tools.context7 = availability['context7'] || false;
      this.availableTools.analysis_tools.chipher = availability['chipher'] || false;

      const aiCount = Object.values(this.availableTools.ai_interfaces).filter(Boolean).length;
      const toolCount = Object.values(this.availableTools.analysis_tools).filter(Boolean).length;
      
      console.log(`[ToolOrchestrator] ✅ Tool availability check completed: ${aiCount} AI interfaces, ${toolCount} analysis tools`);
    } catch (error) {
      console.warn('[ToolOrchestrator] ⚠️ Tool availability check failed:', error);
    }
  }

  /**
   * AI Interface経由でのリクエスト処理
   */
  public async processAIRequest(request: CLIRequest): Promise<CLIResponse> {
    console.log(`[ToolOrchestrator] Processing AI request with ${request.interface_type}: ${request.prompt.substring(0, 100)}...`);

    if (!this.isAIInterface(request.interface_type)) {
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
          code: 'INVALID_AI_INTERFACE',
          message: `'${request.interface_type}' is not a valid AI interface`
        }
      };
    }

    try {
      const response = await this.cliManager.execute(request);
      console.log(`[ToolOrchestrator] ${response.success ? '✅' : '❌'} AI request completed: ${request.interface_type}, Time: ${response.metadata.execution_time_ms}ms`);
      return response;
    } catch (error) {
      console.error(`[ToolOrchestrator] ❌ AI request failed:`, error);
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
          code: 'AI_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown AI interface error'
        }
      };
    }
  }

  /**
   * 分析ツールでのリクエスト処理
   */
  public async processAnalysisRequest(request: AnalysisToolRequest): Promise<AnalysisToolResponse> {
    console.log(`[ToolOrchestrator] Processing analysis request with ${request.tool_type}: ${request.command}`);

    if (!this.isAnalysisTool(request.tool_type)) {
      return {
        success: false,
        tool_used: request.tool_type,
        result: '',
        metadata: {
          command_executed: '',
          execution_time_ms: 0,
          exit_code: -1,
          working_directory: process.cwd()
        },
        error: {
          code: 'INVALID_ANALYSIS_TOOL',
          message: `'${request.tool_type}' is not a valid analysis tool`
        }
      };
    }

    const startTime = Date.now();

    try {
      // 分析ツール用のCLIRequestに変換
      const cliRequest: CLIRequest = {
        interface_type: request.tool_type,
        prompt: request.command,
        options: {
          debug: request.options?.output_format === 'json'
        },
        context: {
          working_dir: request.options?.working_dir || process.cwd()
        }
      };

      const response = await this.cliManager.execute(cliRequest);
      const executionTime = Date.now() - startTime;

      console.log(`[ToolOrchestrator] ${response.success ? '✅' : '❌'} Analysis request completed: ${request.tool_type}, Time: ${executionTime}ms`);

      return {
        success: response.success,
        tool_used: request.tool_type,
        result: response.response_text,
        metadata: {
          command_executed: response.metadata.command_used,
          execution_time_ms: executionTime,
          exit_code: response.metadata.exit_code,
          working_directory: response.metadata.working_directory
        },
        error: response.error
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`[ToolOrchestrator] ❌ Analysis request failed:`, error);
      
      return {
        success: false,
        tool_used: request.tool_type,
        result: '',
        metadata: {
          command_executed: `${request.tool_type} ${request.command}`,
          execution_time_ms: executionTime,
          exit_code: -1,
          working_directory: process.cwd()
        },
        error: {
          code: 'ANALYSIS_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown analysis tool error'
        }
      };
    }
  }

  /**
   * 最適なAIインターフェースの自動選択
   */
  public async selectOptimalAI(
    prompt: string,
    preferences?: {
      coding_focused?: boolean;
      interactive_preferred?: boolean;
      sandbox_required?: boolean;
    }
  ): Promise<AIInterface> {
    console.log(`[ToolOrchestrator] Selecting optimal AI interface for prompt: ${prompt.substring(0, 50)}...`);

    const selectedInterface = await this.cliManager.selectBestInterface(prompt, {
      coding_focused: preferences?.coding_focused,
      interactive_preferred: preferences?.interactive_preferred,
      sandbox_required: preferences?.sandbox_required
    }) as AIInterface;

    if (!this.isAIInterface(selectedInterface)) {
      // デフォルトでgemini_cliを選択、利用できない場合はclaude_code
      if (this.availableTools.ai_interfaces.gemini_cli) {
        return 'gemini_cli';
      } else if (this.availableTools.ai_interfaces.claude_code) {
        return 'claude_code';
      } else {
        throw new Error('No AI interface available');
      }
    }

    console.log(`[ToolOrchestrator] Selected AI interface: ${selectedInterface}`);
    return selectedInterface;
  }

  /**
   * 最適な分析ツールの自動選択
   */
  public async selectOptimalAnalysisTool(
    analysisType: 'project_analysis' | 'security_analysis' | 'general'
  ): Promise<AnalysisTool> {
    console.log(`[ToolOrchestrator] Selecting optimal analysis tool for type: ${analysisType}`);

    switch (analysisType) {
      case 'project_analysis':
        if (this.availableTools.analysis_tools.context7) {
          return 'context7';
        }
        break;
      case 'security_analysis':
        if (this.availableTools.analysis_tools.chipher) {
          return 'chipher';
        }
        break;
      case 'general':
      default:
        // context7を優先、利用できない場合はchipher
        if (this.availableTools.analysis_tools.context7) {
          return 'context7';
        } else if (this.availableTools.analysis_tools.chipher) {
          return 'chipher';
        }
        break;
    }

    throw new Error('No analysis tool available for the requested type');
  }

  /**
   * インタラクティブAIセッションの開始
   */
  public async startInteractiveAISession(
    aiInterface: AIInterface,
    options?: {
      model?: string;
      sandbox?: boolean;
      working_dir?: string;
    }
  ): Promise<string> {
    console.log(`[ToolOrchestrator] Starting interactive AI session: ${aiInterface}`);
    
    if (!this.isAIInterface(aiInterface)) {
      throw new Error(`Invalid AI interface: ${aiInterface}`);
    }

    return this.cliManager.startInteractiveSession(aiInterface, options);
  }

  /**
   * セッション終了
   */
  public terminateSession(sessionId: string): boolean {
    console.log(`[ToolOrchestrator] Terminating session: ${sessionId}`);
    return this.cliManager.terminateSession(sessionId);
  }

  /**
   * ツール統計情報取得
   */
  public getToolStats(): {
    ai_interfaces: Record<string, boolean>;
    analysis_tools: Record<string, boolean>;
    active_sessions: number;
    total_available_tools: number;
  } {
    const cliStats = this.cliManager.getStats();
    
    return {
      ai_interfaces: this.availableTools.ai_interfaces,
      analysis_tools: this.availableTools.analysis_tools,
      active_sessions: cliStats.active_sessions,
      total_available_tools: Object.values(this.availableTools.ai_interfaces).filter(Boolean).length +
                           Object.values(this.availableTools.analysis_tools).filter(Boolean).length
    };
  }

  /**
   * ヘルスチェック
   */
  public async healthCheck(): Promise<{
    service_healthy: boolean;
    ai_interfaces: Record<string, boolean>;
    analysis_tools: Record<string, boolean>;
  }> {
    console.log('[ToolOrchestrator] Performing health check...');
    
    try {
      await this.initializeToolAvailability();
      
      const result = {
        service_healthy: true,
        ai_interfaces: this.availableTools.ai_interfaces,
        analysis_tools: this.availableTools.analysis_tools
      };

      console.log(`[ToolOrchestrator] Health check completed: Service healthy`);
      return result;
    } catch (error) {
      console.error('[ToolOrchestrator] Health check failed:', error);
      
      return {
        service_healthy: false,
        ai_interfaces: { claude_code: false, gemini_cli: false },
        analysis_tools: { context7: false, chipher: false }
      };
    }
  }

  /**
   * Type Guard: AI Interface チェック
   */
  private isAIInterface(toolType: string): toolType is AIInterface {
    return toolType === 'claude_code' || toolType === 'gemini_cli';
  }

  /**
   * Type Guard: Analysis Tool チェック
   */
  private isAnalysisTool(toolType: string): toolType is AnalysisTool {
    return toolType === 'context7' || toolType === 'chipher';
  }
}