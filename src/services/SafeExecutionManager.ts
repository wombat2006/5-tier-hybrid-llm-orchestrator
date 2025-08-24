/**
 * 安全な実行管理サービス
 * 危険なコマンドの実行前チェック、段階的実行、ロールバック機能を提供
 * 
 * 責任範囲:
 * - コマンドの安全性評価
 * - 実行前の安全確認
 * - 段階的実行とバリデーション
 * - ロールバック計画の生成
 * - 実行結果の安全性検証
 */

export interface SafetyAssessment {
  is_safe: boolean;
  risk_level: 'minimal' | 'low' | 'medium' | 'high' | 'critical';
  risk_factors: RiskFactor[];
  safety_recommendations: string[];
  execution_requirements: ExecutionRequirement[];
  rollback_available: boolean;
  approval_required: boolean;
}

export interface RiskFactor {
  type: 'data_loss' | 'service_interruption' | 'security_impact' | 'irreversible_change' | 'system_instability';
  description: string;
  severity: 1 | 2 | 3 | 4 | 5; // 1=minimal, 5=critical
  mitigation_steps: string[];
}

export interface ExecutionRequirement {
  requirement_type: 'backup' | 'confirmation' | 'testing_environment' | 'rollback_plan' | 'monitoring';
  description: string;
  mandatory: boolean;
  validation_command?: string;
}

export interface SafeCommand {
  original_command: string;
  safe_command?: string;
  pre_checks: string[];
  post_checks: string[];
  expected_outcomes: string[];
  warning_signs: string[];
  timeout_seconds: number;
  requires_sudo: boolean;
}

export interface ExecutionPlan {
  plan_id: string;
  created_at: Date;
  commands: SafeCommand[];
  overall_risk_level: 'minimal' | 'low' | 'medium' | 'high' | 'critical';
  execution_order: number[];
  checkpoint_validations: CheckpointValidation[];
  rollback_plan: RollbackStep[];
  estimated_duration: string;
  prerequisites: string[];
  success_criteria: string[];
}

export interface CheckpointValidation {
  checkpoint_id: string;
  description: string;
  validation_commands: string[];
  success_criteria: string[];
  failure_actions: string[];
}

export interface RollbackStep {
  step_number: number;
  description: string;
  rollback_commands: string[];
  validation_commands: string[];
  risk_level: 'low' | 'medium' | 'high';
}

export interface ExecutionResult {
  plan_id: string;
  executed_at: Date;
  status: 'success' | 'partial_success' | 'failed' | 'rolled_back';
  executed_commands: ExecutedCommand[];
  rollback_executed: boolean;
  final_state: 'stable' | 'unstable' | 'unknown';
  recommendations: string[];
}

export interface ExecutedCommand {
  command: string;
  executed_at: Date;
  exit_code: number;
  stdout: string;
  stderr: string;
  execution_time_ms: number;
  safety_validated: boolean;
}

export class SafeExecutionManager {
  private dangerousPatterns: Map<string, RiskFactor> = new Map();
  private safeAlternatives: Map<string, string> = new Map();
  
  constructor() {
    this.initializeSafetyRules();
  }

  /**
   * コマンドの安全性評価
   */
  assessCommandSafety(command: string): SafetyAssessment {
    console.log(`[SafeExecution] 🔍 Assessing safety of command: ${command.substring(0, 50)}...`);
    
    const riskFactors: RiskFactor[] = [];
    const recommendations: string[] = [];
    const requirements: ExecutionRequirement[] = [];
    
    let highestRisk: RiskFactor['severity'] = 1;
    
    // 危険パターンのチェック
    for (const [pattern, riskFactor] of this.dangerousPatterns) {
      if (command.toLowerCase().includes(pattern)) {
        riskFactors.push(riskFactor);
        highestRisk = Math.max(highestRisk, riskFactor.severity) as RiskFactor['severity'];
        recommendations.push(...riskFactor.mitigation_steps);
      }
    }
    
    // 安全要件の追加
    if (highestRisk >= 3) {
      requirements.push({
        requirement_type: 'backup',
        description: 'Create backup before executing potentially destructive command',
        mandatory: true
      });
      
      requirements.push({
        requirement_type: 'confirmation',
        description: 'Manual confirmation required for high-risk operation',
        mandatory: true
      });
    }
    
    if (this.requiresSudo(command)) {
      requirements.push({
        requirement_type: 'confirmation',
        description: 'Administrative privileges required',
        mandatory: false
      });
    }
    
    const riskLevel = this.mapSeverityToRiskLevel(highestRisk);
    const isSafe = riskLevel === 'minimal' || riskLevel === 'low';
    
    return {
      is_safe: isSafe,
      risk_level: riskLevel,
      risk_factors: riskFactors,
      safety_recommendations: [...new Set(recommendations)], // 重複除去
      execution_requirements: requirements,
      rollback_available: this.isRollbackAvailable(command),
      approval_required: highestRisk >= 4
    };
  }

  /**
   * 安全な実行計画の生成
   */
  createExecutionPlan(commands: string[], context?: string): ExecutionPlan {
    console.log(`[SafeExecution] 📋 Creating execution plan for ${commands.length} commands`);
    
    const planId = this.generatePlanId();
    const safeCommands: SafeCommand[] = [];
    const rollbackSteps: RollbackStep[] = [];
    let overallRisk: SafetyAssessment['risk_level'] = 'minimal';
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const safety = this.assessCommandSafety(command);
      
      // 全体のリスクレベル更新
      if (this.isHigherRisk(safety.risk_level, overallRisk)) {
        overallRisk = safety.risk_level;
      }
      
      // 安全なコマンドオブジェクト作成
      const safeCommand: SafeCommand = {
        original_command: command,
        safe_command: this.getSafeAlternative(command),
        pre_checks: this.generatePreChecks(command),
        post_checks: this.generatePostChecks(command),
        expected_outcomes: this.generateExpectedOutcomes(command),
        warning_signs: this.generateWarningSigns(command),
        timeout_seconds: this.calculateTimeout(command),
        requires_sudo: this.requiresSudo(command)
      };
      
      safeCommands.push(safeCommand);
      
      // ロールバックステップ生成
      const rollbackStep = this.generateRollbackStep(command, i + 1);
      if (rollbackStep) {
        rollbackSteps.push(rollbackStep);
      }
    }
    
    // チェックポイント検証生成
    const checkpoints = this.generateCheckpoints(safeCommands);
    
    return {
      plan_id: planId,
      created_at: new Date(),
      commands: safeCommands,
      overall_risk_level: overallRisk,
      execution_order: Array.from({length: commands.length}, (_, i) => i),
      checkpoint_validations: checkpoints,
      rollback_plan: rollbackSteps.reverse(), // 逆順実行
      estimated_duration: this.estimateDuration(safeCommands),
      prerequisites: this.generatePrerequisites(safeCommands, overallRisk),
      success_criteria: this.generateSuccessCriteria(safeCommands)
    };
  }

  /**
   * プリフライト安全性チェック
   */
  async performPreflightChecks(plan: ExecutionPlan): Promise<{
    safe_to_proceed: boolean;
    blocking_issues: string[];
    warnings: string[];
    recommendations: string[];
  }> {
    console.log(`[SafeExecution] ✈️ Performing preflight checks for plan ${plan.plan_id}`);
    
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // 前提条件チェック
    for (const prerequisite of plan.prerequisites) {
      if (prerequisite.includes('backup') || prerequisite.includes('snapshot')) {
        recommendations.push(`Ensure ${prerequisite} is completed before execution`);
      }
    }
    
    // 高リスク操作のチェック
    if (plan.overall_risk_level === 'critical' || plan.overall_risk_level === 'high') {
      blockingIssues.push('High-risk operations require manual approval');
      recommendations.push('Consider executing in test environment first');
    }
    
    // システム状態チェック
    const systemChecks = await this.performSystemHealthCheck();
    if (!systemChecks.healthy) {
      warnings.push('System appears to be in unstable state - proceed with caution');
    }
    
    // 並行実行チェック
    if (this.hasConflictingOperations(plan)) {
      blockingIssues.push('Plan contains potentially conflicting operations');
    }
    
    return {
      safe_to_proceed: blockingIssues.length === 0,
      blocking_issues: blockingIssues,
      warnings: warnings,
      recommendations: recommendations
    };
  }

  /**
   * 段階的安全実行（シミュレーション）
   */
  async simulateExecution(plan: ExecutionPlan): Promise<{
    simulation_results: SimulationResult[];
    overall_assessment: string;
    predicted_issues: string[];
    confidence_score: number;
  }> {
    console.log(`[SafeExecution] 🧪 Simulating execution of plan ${plan.plan_id}`);
    
    const simulationResults: SimulationResult[] = [];
    const predictedIssues: string[] = [];
    
    for (let i = 0; i < plan.commands.length; i++) {
      const command = plan.commands[i];
      
      const simulation: SimulationResult = {
        step: i + 1,
        command: command.original_command,
        predicted_outcome: 'success', // 簡易実装
        potential_issues: this.predictPotentialIssues(command),
        resource_impact: this.assessResourceImpact(command),
        recovery_difficulty: this.assessRecoveryDifficulty(command)
      };
      
      simulationResults.push(simulation);
      
      if (simulation.potential_issues.length > 0) {
        predictedIssues.push(...simulation.potential_issues);
      }
    }
    
    const confidenceScore = this.calculateSimulationConfidence(simulationResults);
    
    return {
      simulation_results: simulationResults,
      overall_assessment: predictedIssues.length === 0 ? 
        'Execution expected to complete successfully' : 
        `${predictedIssues.length} potential issues identified`,
      predicted_issues: [...new Set(predictedIssues)],
      confidence_score: confidenceScore
    };
  }

  // プライベートメソッド群

  private initializeSafetyRules(): void {
    // 危険なパターンとリスク要因の定義
    this.dangerousPatterns.set('rm -rf /', {
      type: 'data_loss',
      description: 'Complete system deletion - catastrophic data loss',
      severity: 5,
      mitigation_steps: ['NEVER execute this command', 'Use specific file paths only']
    });
    
    this.dangerousPatterns.set('dd if=', {
      type: 'data_loss',
      description: 'Direct disk write - potential data overwrite',
      severity: 4,
      mitigation_steps: ['Verify output device carefully', 'Create backup first']
    });
    
    this.dangerousPatterns.set('mkfs', {
      type: 'data_loss',
      description: 'Filesystem creation - erases existing data',
      severity: 4,
      mitigation_steps: ['Confirm correct device', 'Backup data first']
    });
    
    this.dangerousPatterns.set('systemctl stop', {
      type: 'service_interruption',
      description: 'Service shutdown - may affect system availability',
      severity: 2,
      mitigation_steps: ['Check service dependencies', 'Plan restart procedure']
    });
    
    this.dangerousPatterns.set('iptables -F', {
      type: 'security_impact',
      description: 'Firewall flush - removes all security rules',
      severity: 3,
      mitigation_steps: ['Backup current rules', 'Have replacement rules ready']
    });
    
    this.dangerousPatterns.set('chmod -R 777', {
      type: 'security_impact',
      description: 'Dangerous permissions - security vulnerability',
      severity: 3,
      mitigation_steps: ['Use specific minimal permissions', 'Consider security implications']
    });
    
    // 安全な代替案
    this.safeAlternatives.set('rm -rf', 'rm -rf [specific-path]  # Specify exact path');
    this.safeAlternatives.set('chmod 777', 'chmod 644 [file] # or chmod 755 [directory]');
    this.safeAlternatives.set('systemctl stop', 'systemctl status [service] # Check status first');
  }

  private mapSeverityToRiskLevel(severity: number): SafetyAssessment['risk_level'] {
    if (severity >= 5) return 'critical';
    if (severity >= 4) return 'high';
    if (severity >= 3) return 'medium';
    if (severity >= 2) return 'low';
    return 'minimal';
  }

  private requiresSudo(command: string): boolean {
    const sudoCommands = [
      'systemctl', 'service', 'mount', 'umount', 'iptables',
      'firewall-cmd', 'semanage', 'setsebool', 'chmod', 'chown'
    ];
    
    return sudoCommands.some(cmd => command.toLowerCase().includes(cmd));
  }

  private isRollbackAvailable(command: string): boolean {
    // 簡易実装：一部のコマンドはロールバック可能
    const rollbackableCommands = [
      'systemctl start', 'systemctl stop', 'systemctl enable', 'systemctl disable',
      'mount', 'umount', 'iptables -A', 'iptables -I'
    ];
    
    return rollbackableCommands.some(cmd => command.toLowerCase().includes(cmd));
  }

  private getSafeAlternative(command: string): string | undefined {
    for (const [pattern, alternative] of this.safeAlternatives) {
      if (command.toLowerCase().includes(pattern)) {
        return alternative;
      }
    }
    return undefined;
  }

  private generatePreChecks(command: string): string[] {
    const checks: string[] = [];
    
    if (command.includes('systemctl')) {
      checks.push('systemctl is-active [service] # Check current status');
      checks.push('systemctl list-dependencies [service] # Check dependencies');
    }
    
    if (command.includes('mount')) {
      checks.push('df -h # Check available space');
      checks.push('lsblk # List block devices');
    }
    
    if (command.includes('firewall') || command.includes('iptables')) {
      checks.push('iptables -L -n # Backup current rules');
      checks.push('ss -tlnp # Check current connections');
    }
    
    return checks;
  }

  private generatePostChecks(command: string): string[] {
    const checks: string[] = [];
    
    if (command.includes('systemctl start')) {
      checks.push('systemctl is-active [service]');
      checks.push('journalctl -u [service] --since "1 minute ago"');
    }
    
    if (command.includes('mount')) {
      checks.push('df -h # Verify mount successful');
      checks.push('mount | grep [mountpoint]');
    }
    
    if (command.includes('firewall') || command.includes('iptables')) {
      checks.push('iptables -L -n # Verify rules applied');
      checks.push('ss -tlnp # Check affected connections');
    }
    
    return checks;
  }

  private generateExpectedOutcomes(command: string): string[] {
    if (command.includes('systemctl start')) {
      return ['Service becomes active', 'Process starts successfully', 'Dependencies satisfied'];
    }
    if (command.includes('mount')) {
      return ['Filesystem mounted', 'Accessible at mount point', 'Available space reported'];
    }
    if (command.includes('systemctl stop')) {
      return ['Service becomes inactive', 'Process terminates cleanly', 'Resources freed'];
    }
    
    return ['Command executes successfully', 'No error messages', 'Expected changes applied'];
  }

  private generateWarningSigns(command: string): string[] {
    const warnings: string[] = [
      'Error messages in stderr',
      'Non-zero exit code',
      'Timeout during execution'
    ];
    
    if (command.includes('systemctl')) {
      warnings.push('Service fails to start/stop');
      warnings.push('Dependency errors');
    }
    
    if (command.includes('mount')) {
      warnings.push('Mount point not accessible');
      warnings.push('Permission denied errors');
    }
    
    return warnings;
  }

  private calculateTimeout(command: string): number {
    // 簡易実装：コマンドタイプに基づくタイムアウト
    if (command.includes('systemctl')) return 30;
    if (command.includes('mount')) return 10;
    if (command.includes('firewall')) return 5;
    
    return 15; // デフォルト
  }

  private generateRollbackStep(command: string, stepNumber: number): RollbackStep | null {
    if (command.includes('systemctl start')) {
      return {
        step_number: stepNumber,
        description: 'Stop started service',
        rollback_commands: ['systemctl stop [service]'],
        validation_commands: ['systemctl is-active [service]'],
        risk_level: 'low'
      };
    }
    
    if (command.includes('systemctl enable')) {
      return {
        step_number: stepNumber,
        description: 'Disable enabled service',
        rollback_commands: ['systemctl disable [service]'],
        validation_commands: ['systemctl is-enabled [service]'],
        risk_level: 'low'
      };
    }
    
    if (command.includes('mount')) {
      return {
        step_number: stepNumber,
        description: 'Unmount filesystem',
        rollback_commands: ['umount [mountpoint]'],
        validation_commands: ['mount | grep [mountpoint]'],
        risk_level: 'low'
      };
    }
    
    return null; // ロールバック不可
  }

  private generateCheckpoints(commands: SafeCommand[]): CheckpointValidation[] {
    const checkpoints: CheckpointValidation[] = [];
    
    // 中間チェックポイント（半分の位置）
    if (commands.length > 2) {
      const midpoint = Math.floor(commands.length / 2);
      checkpoints.push({
        checkpoint_id: `checkpoint_${midpoint}`,
        description: `Midpoint validation after ${midpoint} commands`,
        validation_commands: ['systemctl --failed', 'journalctl -xe --since "5 minutes ago"'],
        success_criteria: ['No failed services', 'No critical errors in logs'],
        failure_actions: ['Stop execution', 'Initiate rollback', 'Manual investigation']
      });
    }
    
    // 最終チェックポイント
    checkpoints.push({
      checkpoint_id: 'final_validation',
      description: 'Final system validation',
      validation_commands: [
        'systemctl --failed',
        'df -h',
        'free -h',
        'ss -tlnp | wc -l'
      ],
      success_criteria: [
        'No failed services',
        'Adequate disk space',
        'Stable memory usage',
        'Expected network connections'
      ],
      failure_actions: ['Document issues', 'Consider rollback', 'Monitor closely']
    });
    
    return checkpoints;
  }

  private estimateDuration(commands: SafeCommand[]): string {
    const totalSeconds = commands.reduce((sum, cmd) => sum + cmd.timeout_seconds, 0);
    const minutes = Math.ceil(totalSeconds / 60);
    
    if (minutes < 60) {
      return `${minutes} minutes`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
  }

  private generatePrerequisites(commands: SafeCommand[], riskLevel: string): string[] {
    const prerequisites: string[] = [];
    
    if (riskLevel === 'high' || riskLevel === 'critical') {
      prerequisites.push('Create system backup or snapshot');
      prerequisites.push('Notify relevant stakeholders');
      prerequisites.push('Prepare rollback procedures');
    }
    
    if (commands.some(cmd => cmd.requires_sudo)) {
      prerequisites.push('Ensure administrative privileges available');
    }
    
    if (commands.some(cmd => cmd.original_command.includes('systemctl'))) {
      prerequisites.push('Verify service dependencies');
      prerequisites.push('Check system resource availability');
    }
    
    return prerequisites;
  }

  private generateSuccessCriteria(commands: SafeCommand[]): string[] {
    return [
      'All commands execute without errors',
      'System remains stable and responsive',
      'Target services function as expected',
      'No unexpected side effects observed',
      'Rollback capability maintained'
    ];
  }

  private async performSystemHealthCheck(): Promise<{healthy: boolean; issues: string[]}> {
    // 簡易実装：実際にはシステムチェックを実行
    return {
      healthy: true,
      issues: []
    };
  }

  private hasConflictingOperations(plan: ExecutionPlan): boolean {
    // 簡易実装：同じサービスに対する競合操作をチェック
    const serviceOperations = new Map<string, string[]>();
    
    for (const command of plan.commands) {
      const cmd = command.original_command.toLowerCase();
      if (cmd.includes('systemctl')) {
        const match = cmd.match(/systemctl\s+(\w+)\s+([\w-]+)/);
        if (match) {
          const [, action, service] = match;
          if (!serviceOperations.has(service)) {
            serviceOperations.set(service, []);
          }
          serviceOperations.get(service)!.push(action);
        }
      }
    }
    
    // 競合チェック（stop後にstart等）
    for (const [service, actions] of serviceOperations) {
      if (actions.includes('stop') && actions.includes('start')) {
        // これは正常なパターン
        continue;
      }
      if (actions.includes('enable') && actions.includes('disable')) {
        return true; // 競合
      }
    }
    
    return false;
  }

  private predictPotentialIssues(command: SafeCommand): string[] {
    const issues: string[] = [];
    const cmd = command.original_command.toLowerCase();
    
    if (cmd.includes('systemctl start')) {
      issues.push('Service dependencies may not be available');
      issues.push('Port conflicts with existing services');
    }
    
    if (cmd.includes('mount')) {
      issues.push('Mount point may not exist');
      issues.push('Insufficient disk space');
      issues.push('Filesystem corruption');
    }
    
    if (command.requires_sudo) {
      issues.push('Administrative privileges required');
    }
    
    return issues;
  }

  private assessResourceImpact(command: SafeCommand): string {
    if (command.original_command.includes('systemctl start')) {
      return 'Low - service startup resource usage';
    }
    if (command.original_command.includes('mount')) {
      return 'Minimal - filesystem mount operation';
    }
    if (command.original_command.includes('systemctl stop')) {
      return 'Positive - resources freed from service shutdown';
    }
    
    return 'Minimal - read-only or configuration operation';
  }

  private assessRecoveryDifficulty(command: SafeCommand): 'easy' | 'moderate' | 'difficult' | 'very_difficult' {
    if (!this.isRollbackAvailable(command.original_command)) {
      return 'very_difficult';
    }
    
    if (command.original_command.includes('systemctl')) {
      return 'easy';
    }
    
    if (command.original_command.includes('firewall') || command.original_command.includes('iptables')) {
      return 'moderate';
    }
    
    return 'moderate';
  }

  private calculateSimulationConfidence(results: SimulationResult[]): number {
    let totalIssues = 0;
    let totalSteps = results.length;
    
    for (const result of results) {
      totalIssues += result.potential_issues.length;
    }
    
    // 問題が少ないほど信頼度が高い
    const confidenceRatio = Math.max(0, (totalSteps * 2 - totalIssues) / (totalSteps * 2));
    return Math.round(confidenceRatio * 100) / 100;
  }

  private generatePlanId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isHigherRisk(risk1: string, risk2: string): boolean {
    const levels = { minimal: 1, low: 2, medium: 3, high: 4, critical: 5 };
    return (levels as any)[risk1] > (levels as any)[risk2];
  }
}

interface SimulationResult {
  step: number;
  command: string;
  predicted_outcome: 'success' | 'warning' | 'failure';
  potential_issues: string[];
  resource_impact: string;
  recovery_difficulty: 'easy' | 'moderate' | 'difficult' | 'very_difficult';
}

export default SafeExecutionManager;