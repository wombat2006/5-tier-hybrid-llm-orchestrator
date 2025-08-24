import { LLMRequest, TaskType } from '../types';

/**
 * ログ解析サービス
 * ユーザコマンド + エラー出力から問題を診断し、解決策を提案
 * 
 * 責任範囲:
 * - コマンド意図の解析
 * - エラーパターンの認識
 * - 根本原因の仮説生成
 * - 解決戦略の策定
 */

export interface LogAnalysisRequest {
  user_command: string;
  error_output: string;
  system_context?: string;
  log_files?: string[];
  environment_info?: {
    os: string;
    version: string;
    architecture: string;
  };
}

export interface ErrorClassification {
  error_type: 'configuration' | 'permission' | 'dependency' | 'resource' | 'network' | 'syntax' | 'runtime' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number; // 0-1
  category: string;
  keywords_detected: string[];
}

export interface LogAnalysisPlan {
  identified_intent: string;
  error_classification: ErrorClassification;
  root_cause_hypothesis: string[];
  solution_strategy: string;
  recommended_commands: string[];
  routing_decision: {
    task_type: TaskType;
    min_tier: number;
    reasoning: string;
  };
  urgency_level: number; // 1-5
}

export class LogAnalysisService {
  
  /**
   * メインのログ解析エントリーポイント
   */
  async analyzeLog(request: LogAnalysisRequest): Promise<LogAnalysisPlan> {
    console.log('[LogAnalysisService] 🔍 Starting log analysis...');
    console.log(`[LogAnalysisService] Command: ${request.user_command}`);
    console.log(`[LogAnalysisService] Error: ${request.error_output.substring(0, 200)}...`);

    // 1. コマンド意図の解析
    const intent = this.analyzeCommandIntent(request.user_command);
    
    // 2. エラー分類
    const errorClassification = this.classifyError(request.error_output, request.user_command);
    
    // 3. 根本原因仮説の生成
    const rootCauses = this.generateRootCauseHypotheses(
      request.user_command, 
      request.error_output, 
      errorClassification
    );
    
    // 4. 解決戦略の策定
    const strategy = this.developSolutionStrategy(intent, errorClassification, rootCauses);
    
    // 5. 推奨コマンドの生成
    const recommendedCommands = this.generateRecommendedCommands(
      intent, 
      errorClassification, 
      request.user_command
    );
    
    // 6. ルーティング判定
    const routingDecision = this.determineRouting(errorClassification, intent, request);
    
    // 7. 緊急度評価
    const urgencyLevel = this.evaluateUrgency(errorClassification, intent);

    const plan: LogAnalysisPlan = {
      identified_intent: intent,
      error_classification: errorClassification,
      root_cause_hypothesis: rootCauses,
      solution_strategy: strategy,
      recommended_commands: recommendedCommands,
      routing_decision: routingDecision,
      urgency_level: urgencyLevel
    };

    console.log('[LogAnalysisService] ✅ Analysis complete');
    return plan;
  }

  /**
   * ユーザコマンドの意図解析
   */
  private analyzeCommandIntent(command: string): string {
    const cmd = command.toLowerCase().trim();
    
    // システムサービス関連
    if (cmd.includes('systemctl')) {
      if (cmd.includes('start')) return 'Starting system service';
      if (cmd.includes('stop')) return 'Stopping system service';
      if (cmd.includes('restart')) return 'Restarting system service';
      if (cmd.includes('enable')) return 'Enabling system service';
      if (cmd.includes('status')) return 'Checking service status';
      return 'System service management';
    }
    
    // Apache/HTTP関連
    if (cmd.includes('httpd') || cmd.includes('apache')) {
      return 'Apache web server management';
    }
    
    // データベース関連
    if (cmd.includes('psql') || cmd.includes('postgres')) {
      return 'PostgreSQL database operation';
    }
    
    // Docker関連
    if (cmd.includes('docker')) {
      return 'Container management operation';
    }
    
    // ネットワーク関連
    if (cmd.includes('firewall') || cmd.includes('iptables')) {
      return 'Network security configuration';
    }
    
    // ファイルシステム関連
    if (cmd.includes('mount') || cmd.includes('umount')) {
      return 'File system mount operation';
    }
    
    // パッケージ管理
    if (cmd.includes('yum') || cmd.includes('dnf') || cmd.includes('apt')) {
      return 'Package management operation';
    }
    
    // ユーザー・権限管理
    if (cmd.includes('chmod') || cmd.includes('chown') || cmd.includes('sudo')) {
      return 'Permission/access control modification';
    }

    return 'General system command execution';
  }

  /**
   * エラー分類器
   */
  private classifyError(errorOutput: string, command: string): ErrorClassification {
    const error = errorOutput.toLowerCase();
    let errorType: ErrorClassification['error_type'] = 'unknown';
    let severity: ErrorClassification['severity'] = 'medium';
    let confidence = 0.5;
    let category = 'General Error';
    const detectedKeywords: string[] = [];

    // 権限エラー
    const permissionPatterns = [
      'permission denied', 'access denied', 'operation not permitted',
      'sudo required', 'unauthorized', 'forbidden'
    ];
    if (permissionPatterns.some(pattern => error.includes(pattern))) {
      errorType = 'permission';
      severity = 'high';
      confidence = 0.9;
      category = 'Permission/Access Control';
      detectedKeywords.push('permission_denied');
    }

    // 設定エラー
    const configPatterns = [
      'configuration error', 'invalid configuration', 'config file not found',
      'syntax error', 'bad configuration', 'malformed'
    ];
    if (configPatterns.some(pattern => error.includes(pattern))) {
      errorType = 'configuration';
      severity = 'medium';
      confidence = 0.85;
      category = 'Configuration';
      detectedKeywords.push('config_error');
    }

    // 依存関係エラー
    const dependencyPatterns = [
      'dependency', 'package not found', 'module not found', 'library not found',
      'missing dependency', 'cannot resolve', 'not installed'
    ];
    if (dependencyPatterns.some(pattern => error.includes(pattern))) {
      errorType = 'dependency';
      severity = 'high';
      confidence = 0.8;
      category = 'Dependencies';
      detectedKeywords.push('missing_dependency');
    }

    // リソース不足
    const resourcePatterns = [
      'out of memory', 'disk full', 'no space left', 'resource temporarily unavailable',
      'too many open files', 'quota exceeded'
    ];
    if (resourcePatterns.some(pattern => error.includes(pattern))) {
      errorType = 'resource';
      severity = 'critical';
      confidence = 0.95;
      category = 'Resource Exhaustion';
      detectedKeywords.push('resource_exhaustion');
    }

    // ネットワークエラー
    const networkPatterns = [
      'connection refused', 'network unreachable', 'timeout', 'connection timeout',
      'dns resolution', 'host not found', 'port already in use'
    ];
    if (networkPatterns.some(pattern => error.includes(pattern))) {
      errorType = 'network';
      severity = 'high';
      confidence = 0.85;
      category = 'Network Connectivity';
      detectedKeywords.push('network_error');
    }

    // シンタックスエラー
    const syntaxPatterns = [
      'syntax error', 'invalid syntax', 'parse error', 'unexpected token',
      'malformed', 'invalid format'
    ];
    if (syntaxPatterns.some(pattern => error.includes(pattern))) {
      errorType = 'syntax';
      severity = 'medium';
      confidence = 0.9;
      category = 'Syntax/Format';
      detectedKeywords.push('syntax_error');
    }

    // ランタイムエラー
    const runtimePatterns = [
      'segmentation fault', 'core dumped', 'killed', 'aborted', 'exception',
      'runtime error', 'execution failed'
    ];
    if (runtimePatterns.some(pattern => error.includes(pattern))) {
      errorType = 'runtime';
      severity = 'critical';
      confidence = 0.8;
      category = 'Runtime Failure';
      detectedKeywords.push('runtime_failure');
    }

    return {
      error_type: errorType,
      severity,
      confidence_score: confidence,
      category,
      keywords_detected: detectedKeywords
    };
  }

  /**
   * 根本原因仮説の生成
   */
  private generateRootCauseHypotheses(
    command: string, 
    errorOutput: string, 
    classification: ErrorClassification
  ): string[] {
    const hypotheses: string[] = [];
    
    switch (classification.error_type) {
      case 'permission':
        hypotheses.push('User lacks necessary privileges for the operation');
        hypotheses.push('File or directory ownership is incorrect');
        hypotheses.push('SELinux or AppArmor policies blocking access');
        break;
        
      case 'configuration':
        hypotheses.push('Configuration file contains syntax errors');
        hypotheses.push('Missing required configuration parameters');
        hypotheses.push('Configuration file path is incorrect');
        hypotheses.push('Service-specific configuration validation failure');
        break;
        
      case 'dependency':
        hypotheses.push('Required package or library is not installed');
        hypotheses.push('Version compatibility issues between components');
        hypotheses.push('Missing system dependencies');
        break;
        
      case 'resource':
        hypotheses.push('System has insufficient memory available');
        hypotheses.push('Disk space exhausted');
        hypotheses.push('File descriptor limits reached');
        hypotheses.push('Network connection limits exceeded');
        break;
        
      case 'network':
        hypotheses.push('Target service is not running or accessible');
        hypotheses.push('Firewall blocking required ports');
        hypotheses.push('DNS resolution failure');
        hypotheses.push('Network interface configuration issue');
        break;
        
      case 'runtime':
        hypotheses.push('Software bug causing process termination');
        hypotheses.push('Memory corruption or segmentation fault');
        hypotheses.push('Resource cleanup failure');
        break;
        
      default:
        hypotheses.push('Command syntax or parameters are incorrect');
        hypotheses.push('System state incompatible with requested operation');
        hypotheses.push('Environment configuration issue');
    }
    
    return hypotheses;
  }

  /**
   * 解決戦略の策定
   */
  private developSolutionStrategy(
    intent: string, 
    classification: ErrorClassification, 
    rootCauses: string[]
  ): string {
    const strategies = {
      permission: 'Verify and correct user permissions, ownership, and security policies',
      configuration: 'Validate and correct configuration files and parameters',
      dependency: 'Install missing dependencies and resolve version conflicts',
      resource: 'Monitor and optimize system resource utilization',
      network: 'Diagnose and resolve network connectivity issues',
      syntax: 'Review and correct command syntax and parameters',
      runtime: 'Investigate system logs and apply stability fixes',
      unknown: 'Perform systematic diagnostic analysis to identify root cause'
    };

    return strategies[classification.error_type] || strategies.unknown;
  }

  /**
   * 推奨コマンドの生成
   */
  private generateRecommendedCommands(
    intent: string, 
    classification: ErrorClassification, 
    originalCommand: string
  ): string[] {
    const commands: string[] = [];
    
    switch (classification.error_type) {
      case 'permission':
        commands.push('ls -la [target_file_or_directory]');
        commands.push('sudo [original_command]');
        commands.push('chmod +x [file_path]');
        commands.push('chown [user]:[group] [file_path]');
        break;
        
      case 'configuration':
        commands.push('systemctl status [service_name]');
        commands.push('journalctl -u [service_name] --no-pager');
        commands.push('[service_name] -t  # test configuration');
        break;
        
      case 'dependency':
        commands.push('yum list installed | grep [package_name]');
        commands.push('yum install [missing_package]');
        commands.push('ldd [binary_path]  # check shared libraries');
        break;
        
      case 'resource':
        commands.push('df -h  # check disk space');
        commands.push('free -h  # check memory usage');
        commands.push('top  # monitor process resource usage');
        break;
        
      case 'network':
        commands.push('systemctl status firewalld');
        commands.push('ss -tlnp | grep [port]');
        commands.push('nslookup [hostname]');
        commands.push('telnet [host] [port]');
        break;
        
      default:
        commands.push('journalctl -xe --no-pager');
        commands.push('dmesg | tail -20');
        commands.push('systemctl --failed');
    }
    
    return commands;
  }

  /**
   * ルーティング判定
   */
  private determineRouting(
    classification: ErrorClassification, 
    intent: string, 
    request: LogAnalysisRequest
  ): { task_type: TaskType; min_tier: number; reasoning: string } {
    let taskType: TaskType = 'complex_analysis'; // デフォルトは高品質分析
    let minTier = 2;
    const reasons: string[] = [];

    // 重要度による判定
    if (classification.severity === 'critical') {
      taskType = 'critical';
      minTier = 3;
      reasons.push('Critical severity requires expert analysis');
    } else if (classification.severity === 'high') {
      taskType = 'premium';
      minTier = 2;
      reasons.push('High severity requires detailed analysis');
    }

    // 技術領域による調整
    if (intent.includes('database') || request.user_command.includes('postgres')) {
      minTier = Math.max(minTier, 2);
      reasons.push('Database issues require specialized knowledge');
    }
    
    if (intent.includes('container') || request.user_command.includes('docker')) {
      minTier = Math.max(minTier, 2);
      reasons.push('Container technology requires advanced expertise');
    }
    
    if (classification.error_type === 'runtime' || classification.error_type === 'resource') {
      minTier = Math.max(minTier, 2);
      reasons.push('System-level failures require deep technical analysis');
    }

    // 信頼度が低い場合は上位モデルで慎重に分析
    if (classification.confidence_score < 0.7) {
      minTier = Math.max(minTier, 2);
      reasons.push('Low confidence classification requires careful analysis');
    }

    return {
      task_type: taskType,
      min_tier: minTier,
      reasoning: reasons.join('; ')
    };
  }

  /**
   * 緊急度評価
   */
  private evaluateUrgency(classification: ErrorClassification, intent: string): number {
    let urgency = 3; // デフォルト: 中程度
    
    if (classification.severity === 'critical') {
      urgency = 5; // 最高緊急度
    } else if (classification.severity === 'high') {
      urgency = 4;
    } else if (classification.severity === 'low') {
      urgency = 2;
    }

    // システムサービス系は緊急度アップ
    if (intent.includes('service') || intent.includes('system')) {
      urgency = Math.min(urgency + 1, 5);
    }
    
    // データベース系も緊急度アップ
    if (intent.includes('database')) {
      urgency = Math.min(urgency + 1, 5);
    }
    
    return urgency;
  }
}

export default LogAnalysisService;