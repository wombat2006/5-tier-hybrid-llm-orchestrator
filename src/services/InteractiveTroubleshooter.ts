import { LLMRequest, TaskType } from '../types';
import AdvancedLogAnalyzer, { LogAnalysisContext, ComprehensiveDiagnosis } from './AdvancedLogAnalyzer';

/**
 * インタラクティブトラブルシューティングサービス
 * ユーザーとの対話を通じて問題を段階的に解決
 * 
 * 責任範囲:
 * - 問題の段階的な診断
 * - ユーザーとの双方向コミュニケーション
 * - 動的な質問生成
 * - 解決プロセスの追跡
 * - 安全性を考慮した解決策提供
 */

export interface TroubleshootingSession {
  session_id: string;
  user_id?: string;
  created_at: Date;
  updated_at: Date;
  status: 'active' | 'resolved' | 'escalated' | 'abandoned';
  problem_description: string;
  current_step: number;
  total_estimated_steps: number;
  collected_info: CollectedInformation;
  interaction_history: InteractionRecord[];
  current_diagnosis?: ComprehensiveDiagnosis;
  resolution_progress?: ResolutionProgress;
}

export interface CollectedInformation {
  basic_info: {
    problem_description: string;
    when_started?: string;
    frequency?: 'once' | 'intermittent' | 'continuous';
    user_impact?: 'none' | 'minor' | 'major' | 'critical';
  };
  environment_info: {
    os?: string;
    version?: string;
    server_type?: 'physical' | 'vm' | 'container' | 'cloud';
    server_role?: string;
    deployment_type?: 'standalone' | 'cluster' | 'container' | 'cloud';
  };
  technical_details: {
    error_logs?: string;
    system_output?: string;
    configuration_changes?: string[];
    recent_actions?: string[];
  };
  context_info: {
    services_affected?: string[];
    related_symptoms?: string[];
    workarounds_tried?: string[];
    previous_incidents?: string[];
  };
}

export interface InteractionRecord {
  timestamp: Date;
  type: 'question' | 'answer' | 'command_suggestion' | 'diagnosis' | 'resolution_step';
  content: string;
  user_response?: string;
  metadata?: Record<string, any>;
}

export interface ResolutionProgress {
  current_phase: 'investigation' | 'immediate_action' | 'detailed_fixing' | 'validation' | 'monitoring';
  completed_steps: string[];
  current_step: string;
  next_steps: string[];
  success_indicators: string[];
  rollback_plan: string[];
}

export interface DynamicQuestion {
  id: string;
  question: string;
  type: 'text' | 'choice' | 'yes_no' | 'command_output' | 'file_content';
  choices?: string[];
  validation?: {
    required: boolean;
    pattern?: string;
    min_length?: number;
  };
  follow_up_logic?: FollowUpLogic;
  help_text?: string;
  priority: number; // 1-5, higher = more important
}

export interface FollowUpLogic {
  condition_type: 'answer_contains' | 'answer_equals' | 'answer_matches';
  condition_value: string;
  next_questions: string[];
  actions: string[];
}

export interface TroubleshootingResponse {
  session_id: string;
  status: 'continue' | 'diagnosis_ready' | 'resolution_started' | 'completed' | 'escalation_needed';
  message: string;
  next_questions?: DynamicQuestion[];
  diagnosis?: ComprehensiveDiagnosis;
  recommended_actions?: string[];
  progress_percentage: number;
  estimated_time_remaining?: string;
}

export class InteractiveTroubleshooter {
  private logAnalyzer: AdvancedLogAnalyzer;
  private activeSessions: Map<string, TroubleshootingSession> = new Map();
  
  constructor() {
    this.logAnalyzer = new AdvancedLogAnalyzer();
  }

  /**
   * 新しいトラブルシューティングセッション開始
   */
  async startTroubleshootingSession(
    problemDescription: string,
    userId?: string
  ): Promise<TroubleshootingResponse> {
    console.log('[InteractiveTroubleshooter] 🚀 Starting new troubleshooting session...');
    console.log(`[InteractiveTroubleshooter] Problem: ${problemDescription.substring(0, 100)}...`);

    const sessionId = this.generateSessionId();
    
    const session: TroubleshootingSession = {
      session_id: sessionId,
      user_id: userId,
      created_at: new Date(),
      updated_at: new Date(),
      status: 'active',
      problem_description: problemDescription,
      current_step: 1,
      total_estimated_steps: this.estimateSteps(problemDescription),
      collected_info: {
        basic_info: {
          problem_description: problemDescription
        },
        environment_info: {},
        technical_details: {},
        context_info: {}
      },
      interaction_history: [{
        timestamp: new Date(),
        type: 'question',
        content: `User reported problem: ${problemDescription}`
      }]
    };

    this.activeSessions.set(sessionId, session);

    // 初期質問を生成
    const initialQuestions = await this.generateInitialQuestions(problemDescription);
    
    console.log(`[InteractiveTroubleshooter] ✅ Session ${sessionId} started with ${initialQuestions.length} questions`);

    return {
      session_id: sessionId,
      status: 'continue',
      message: `トラブルシューティングセッションを開始しました。問題を詳しく理解するために、いくつかの質問にお答えください。`,
      next_questions: initialQuestions,
      progress_percentage: 10,
      estimated_time_remaining: this.estimateTimeRemaining(session)
    };
  }

  /**
   * ユーザー回答の処理
   */
  async processUserResponse(
    sessionId: string,
    questionId: string,
    answer: string
  ): Promise<TroubleshootingResponse> {
    console.log(`[InteractiveTroubleshooter] 📝 Processing answer for session ${sessionId}`);

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 回答を記録
    session.interaction_history.push({
      timestamp: new Date(),
      type: 'answer',
      content: `Q: ${questionId} A: ${answer}`
    });

    // 情報を収集データに統合
    await this.integrateAnswer(session, questionId, answer);
    
    // 次のステップを決定
    return await this.determineNextStep(session);
  }

  /**
   * 診断実行
   */
  async performDiagnosis(sessionId: string): Promise<TroubleshootingResponse> {
    console.log(`[InteractiveTroubleshooter] 🔬 Performing diagnosis for session ${sessionId}`);

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 収集した情報から診断コンテキストを構築
    const context: LogAnalysisContext = this.buildAnalysisContext(session);
    
    // ログが提供されている場合は詳細分析
    let diagnosis: ComprehensiveDiagnosis;
    
    if (session.collected_info.technical_details.error_logs) {
      diagnosis = await this.logAnalyzer.analyzeUserLogs(
        session.collected_info.technical_details.error_logs,
        context
      );
    } else {
      // ログなしの場合は収集した情報から推論診断
      diagnosis = await this.generateInferredDiagnosis(session, context);
    }

    session.current_diagnosis = diagnosis;
    session.updated_at = new Date();

    console.log(`[InteractiveTroubleshooter] ✅ Diagnosis completed: ${diagnosis.primary_issue.title}`);

    return {
      session_id: sessionId,
      status: 'diagnosis_ready',
      message: `診断が完了しました。以下の問題が特定されました：`,
      diagnosis: diagnosis,
      progress_percentage: 60,
      estimated_time_remaining: this.estimateTimeRemaining(session)
    };
  }

  /**
   * 解決プロセス開始
   */
  async startResolution(
    sessionId: string,
    approvedActions?: string[]
  ): Promise<TroubleshootingResponse> {
    console.log(`[InteractiveTroubleshooter] 🔧 Starting resolution for session ${sessionId}`);

    const session = this.activeSessions.get(sessionId);
    if (!session || !session.current_diagnosis) {
      throw new Error(`Session ${sessionId} not ready for resolution`);
    }

    // 解決プロセスを初期化
    session.resolution_progress = {
      current_phase: 'immediate_action',
      completed_steps: [],
      current_step: session.current_diagnosis.resolution_plan.immediate_actions[0]?.title || 'Investigation',
      next_steps: session.current_diagnosis.resolution_plan.immediate_actions.map(a => a.title),
      success_indicators: ['Error messages reduced', 'Service stability improved'],
      rollback_plan: ['Document current state', 'Backup configurations before changes']
    };

    const recommendedActions = this.prioritizeActions(
      session.current_diagnosis.resolution_plan,
      approvedActions
    );

    return {
      session_id: sessionId,
      status: 'resolution_started',
      message: `解決プロセスを開始します。以下のアクションを実行することをお勧めします：`,
      recommended_actions: recommendedActions,
      progress_percentage: 70,
      estimated_time_remaining: this.estimateTimeRemaining(session)
    };
  }

  /**
   * セッション状態取得
   */
  getSessionStatus(sessionId: string): TroubleshootingSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * アクティブセッション一覧取得
   */
  getActiveSessions(userId?: string): TroubleshootingSession[] {
    const sessions = Array.from(this.activeSessions.values());
    return userId ? sessions.filter(s => s.user_id === userId) : sessions;
  }

  /**
   * セッション終了
   */
  async closeSession(
    sessionId: string,
    resolution: 'resolved' | 'escalated' | 'abandoned'
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = resolution;
      session.updated_at = new Date();
      
      // セッションをアーカイブ（実装では永続化ストレージに移動）
      console.log(`[InteractiveTroubleshooter] 📁 Session ${sessionId} closed as ${resolution}`);
      
      // アクティブセッションから削除
      this.activeSessions.delete(sessionId);
    }
  }

  // プライベートメソッド群

  private generateSessionId(): string {
    return `ts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateSteps(problemDescription: string): number {
    // 問題の複雑さに基づいて推定ステップ数を計算
    let steps = 5; // 基本ステップ数
    
    const complexityIndicators = [
      'network', 'cluster', 'database', 'performance', 'security',
      'intermittent', 'multiple services', 'production'
    ];
    
    const lower = problemDescription.toLowerCase();
    const complexity = complexityIndicators.filter(indicator => 
      lower.includes(indicator)
    ).length;
    
    return Math.min(15, steps + complexity * 2);
  }

  private estimateTimeRemaining(session: TroubleshootingSession): string {
    const remainingSteps = session.total_estimated_steps - session.current_step;
    const estimatedMinutes = remainingSteps * 8; // 8分/ステップ
    
    if (estimatedMinutes < 60) {
      return `${estimatedMinutes}分`;
    } else {
      const hours = Math.floor(estimatedMinutes / 60);
      const minutes = estimatedMinutes % 60;
      return minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
    }
  }

  private async generateInitialQuestions(problemDescription: string): Promise<DynamicQuestion[]> {
    const questions: DynamicQuestion[] = [];
    
    // 基本的な環境情報
    questions.push({
      id: 'environment_os',
      question: 'どのオペレーティングシステムを使用していますか？',
      type: 'choice',
      choices: ['CentOS/RHEL', 'Ubuntu/Debian', 'Rocky Linux', 'SUSE', 'Windows', 'その他'],
      validation: { required: true },
      priority: 5
    });

    questions.push({
      id: 'problem_frequency',
      question: 'この問題はどのくらいの頻度で発生しますか？',
      type: 'choice',
      choices: ['初回のみ', '断続的に発生', '継続的に発生'],
      validation: { required: true },
      priority: 4
    });

    questions.push({
      id: 'user_impact',
      question: 'ユーザーへの影響はどの程度ですか？',
      type: 'choice',
      choices: ['影響なし', '軽微', '重大', '致命的'],
      validation: { required: true },
      priority: 4
    });

    // 技術的詳細
    if (this.isProbablyTechnical(problemDescription)) {
      questions.push({
        id: 'error_logs',
        question: 'エラーログやシステム出力がありましたら、貼り付けてください：',
        type: 'text',
        validation: { required: false, min_length: 10 },
        help_text: 'journalctl、/var/log、アプリケーションログなど',
        priority: 5
      });

      questions.push({
        id: 'recent_changes',
        question: '問題発生前に何か変更を行いましたか？（設定変更、更新、新しいソフトウェアのインストールなど）',
        type: 'text',
        validation: { required: false },
        priority: 3
      });
    }

    // 時間軸の質問
    questions.push({
      id: 'problem_timeline',
      question: 'この問題はいつから発生していますか？',
      type: 'choice',
      choices: ['今すぐ', '数時間前', '今日', '数日前', '1週間以上前'],
      validation: { required: true },
      priority: 3
    });

    // 優先度順にソート
    return questions.sort((a, b) => b.priority - a.priority);
  }

  private isProbablyTechnical(description: string): boolean {
    const technicalKeywords = [
      'error', 'log', 'service', 'server', 'database', 'network',
      'config', 'system', 'process', 'memory', 'cpu', 'disk'
    ];
    
    const lower = description.toLowerCase();
    return technicalKeywords.some(keyword => lower.includes(keyword));
  }

  private async integrateAnswer(
    session: TroubleshootingSession,
    questionId: string,
    answer: string
  ): Promise<void> {
    const info = session.collected_info;
    
    switch (questionId) {
      case 'environment_os':
        info.environment_info.os = answer;
        break;
      case 'problem_frequency':
        info.basic_info.frequency = this.mapFrequencyAnswer(answer);
        break;
      case 'user_impact':
        info.basic_info.user_impact = this.mapImpactAnswer(answer);
        break;
      case 'error_logs':
        if (answer.trim().length > 10) {
          info.technical_details.error_logs = answer;
        }
        break;
      case 'recent_changes':
        if (answer.trim().length > 0) {
          info.technical_details.recent_actions = [answer];
        }
        break;
      case 'problem_timeline':
        info.basic_info.when_started = answer;
        break;
      default:
        // カスタム質問の場合は汎用的に保存
        if (!info.context_info.related_symptoms) {
          info.context_info.related_symptoms = [];
        }
        info.context_info.related_symptoms.push(`${questionId}: ${answer}`);
    }
    
    session.updated_at = new Date();
  }

  private mapFrequencyAnswer(answer: string): 'once' | 'intermittent' | 'continuous' {
    if (answer.includes('初回')) return 'once';
    if (answer.includes('断続')) return 'intermittent';
    return 'continuous';
  }

  private mapImpactAnswer(answer: string): 'none' | 'minor' | 'major' | 'critical' {
    if (answer.includes('影響なし')) return 'none';
    if (answer.includes('軽微')) return 'minor';
    if (answer.includes('重大')) return 'major';
    return 'critical';
  }

  private async determineNextStep(session: TroubleshootingSession): Promise<TroubleshootingResponse> {
    session.current_step++;
    session.updated_at = new Date();
    
    // 十分な情報が収集されたかチェック
    if (this.hasEnoughInformation(session)) {
      return {
        session_id: session.session_id,
        status: 'diagnosis_ready',
        message: '十分な情報が収集されました。診断を開始しますか？',
        progress_percentage: 50
      };
    }
    
    // 追加質問が必要
    const nextQuestions = await this.generateFollowUpQuestions(session);
    
    return {
      session_id: session.session_id,
      status: 'continue',
      message: '追加情報をお聞かせください：',
      next_questions: nextQuestions,
      progress_percentage: Math.min(45, session.current_step * 5),
      estimated_time_remaining: this.estimateTimeRemaining(session)
    };
  }

  private hasEnoughInformation(session: TroubleshootingSession): boolean {
    const info = session.collected_info;
    
    // 最低限必要な情報
    const hasBasicInfo = !!(info.basic_info.problem_description && 
                        info.basic_info.frequency && 
                        info.basic_info.user_impact);
    
    const hasEnvironmentInfo = !!info.environment_info.os;
    
    // 技術的な問題の場合はログまたは詳細説明が必要
    const hasTechnicalDetails = !!(info.technical_details.error_logs || 
                               (info.technical_details.recent_actions && info.technical_details.recent_actions.length > 0) ||
                               session.current_step >= 5);
    
    return hasBasicInfo && hasEnvironmentInfo && hasTechnicalDetails;
  }

  private async generateFollowUpQuestions(session: TroubleshootingSession): Promise<DynamicQuestion[]> {
    const questions: DynamicQuestion[] = [];
    const info = session.collected_info;
    
    // 動的に次の質問を生成
    if (!info.technical_details.error_logs && this.isProbablyTechnical(session.problem_description)) {
      questions.push({
        id: 'system_command_output',
        question: '以下のコマンドの出力を共有していただけますか？\n`systemctl --failed` または `journalctl -xe --no-pager | tail -50`',
        type: 'command_output',
        validation: { required: false },
        help_text: 'システムの現在の状態を理解するのに役立ちます',
        priority: 4
      });
    }
    
    if (!info.context_info.services_affected) {
      questions.push({
        id: 'affected_services',
        question: '影響を受けているサービスやアプリケーションがあれば教えてください：',
        type: 'text',
        validation: { required: false },
        priority: 3
      });
    }
    
    if (info.basic_info.frequency === 'intermittent' && !info.context_info.workarounds_tried) {
      questions.push({
        id: 'intermittent_pattern',
        question: '断続的な問題の場合、何かパターンはありますか？（特定の時間、操作後など）',
        type: 'text',
        validation: { required: false },
        priority: 3
      });
    }
    
    return questions.sort((a, b) => b.priority - a.priority);
  }

  private buildAnalysisContext(session: TroubleshootingSession): LogAnalysisContext {
    const info = session.collected_info;
    
    return {
      user_description: session.problem_description,
      environment: {
        os: info.environment_info.os,
        server_role: info.environment_info.server_role,
        deployment_type: info.environment_info.deployment_type
      },
      timeline: {
        problem_started: info.basic_info.when_started,
        actions_taken: info.technical_details.recent_actions
      },
      system_info: {
        services_affected: info.context_info.services_affected,
        error_frequency: info.basic_info.frequency,
        user_impact: info.basic_info.user_impact
      }
    };
  }

  private async generateInferredDiagnosis(
    session: TroubleshootingSession,
    context: LogAnalysisContext
  ): Promise<ComprehensiveDiagnosis> {
    // ログがない場合の推論ベース診断
    const problemDesc = session.problem_description.toLowerCase();
    const userImpact = context.system_info?.user_impact || 'minor';
    
    // 簡易パターンマッチングによる診断
    let primaryIssue = {
      title: 'System Issue Identified',
      description: session.problem_description,
      severity: this.mapImpactToSeverity(userImpact),
      confidence_score: 0.6
    };
    
    let rootCause = {
      most_likely_cause: 'Requires further investigation',
      alternative_causes: [] as string[],
      reasoning: 'Based on user description and collected information'
    };
    
    // パターンに基づく推論
    if (problemDesc.includes('service') || problemDesc.includes('systemctl')) {
      primaryIssue.title = 'Service Management Issue';
      rootCause.most_likely_cause = 'Service configuration or dependency problem';
      rootCause.alternative_causes = ['Service dependency failure', 'Resource constraints', 'Configuration error'];
    } else if (problemDesc.includes('network') || problemDesc.includes('connection')) {
      primaryIssue.title = 'Network Connectivity Issue';
      rootCause.most_likely_cause = 'Network configuration or firewall issue';
      rootCause.alternative_causes = ['DNS resolution problem', 'Port blocking', 'Service unavailability'];
    } else if (problemDesc.includes('permission') || problemDesc.includes('access')) {
      primaryIssue.title = 'Access Control Issue';
      rootCause.most_likely_cause = 'Insufficient permissions or ownership problem';
      rootCause.alternative_causes = ['SELinux/AppArmor restriction', 'File ownership issue', 'Group membership problem'];
    }
    
    return {
      primary_issue: primaryIssue,
      contributing_factors: this.identifyContributingFactors(session),
      root_cause_analysis: rootCause,
      impact_assessment: {
        affected_systems: context.system_info?.services_affected || ['system'],
        user_impact: `${userImpact} user impact reported`,
        business_impact: this.mapImpactToBusiness(userImpact),
        urgency_level: this.calculateUrgencyFromContext(context)
      },
      resolution_plan: this.generateBasicResolutionPlan(session, context)
    };
  }

  private mapImpactToSeverity(impact: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (impact) {
      case 'critical': return 'critical';
      case 'major': return 'high';
      case 'minor': return 'medium';
      default: return 'low';
    }
  }

  private mapImpactToBusiness(impact: string): 'minimal' | 'moderate' | 'significant' | 'severe' {
    switch (impact) {
      case 'critical': return 'severe';
      case 'major': return 'significant';
      case 'minor': return 'moderate';
      default: return 'minimal';
    }
  }

  private calculateUrgencyFromContext(context: LogAnalysisContext): number {
    let urgency = 1;
    
    if (context.system_info?.user_impact === 'critical') urgency += 3;
    else if (context.system_info?.user_impact === 'major') urgency += 2;
    else if (context.system_info?.user_impact === 'minor') urgency += 1;
    
    if (context.system_info?.error_frequency === 'continuous') urgency += 2;
    else if (context.system_info?.error_frequency === 'intermittent') urgency += 1;
    
    return Math.min(5, urgency);
  }

  private identifyContributingFactors(session: TroubleshootingSession): string[] {
    const factors: string[] = [];
    const info = session.collected_info;
    
    if (info.basic_info.frequency === 'continuous') {
      factors.push('Problem occurs continuously, indicating systemic issue');
    }
    
    if (info.technical_details.recent_actions && info.technical_details.recent_actions.length > 0) {
      factors.push('Recent system changes may have contributed to the problem');
    }
    
    if (info.context_info.services_affected && info.context_info.services_affected.length > 1) {
      factors.push(`Multiple services affected: ${info.context_info.services_affected.join(', ')}`);
    }
    
    return factors;
  }

  private generateBasicResolutionPlan(
    session: TroubleshootingSession, 
    context: LogAnalysisContext
  ) {
    const problemDesc = session.problem_description.toLowerCase();
    
    const immediateActions: any[] = [];
    const investigationSteps: any[] = [];
    const longTermSolutions: any[] = [];
    
    // 一般的な調査ステップ
    investigationSteps.push({
      step_number: 1,
      title: 'System Status Investigation',
      description: 'Gather comprehensive system information',
      commands: [
        'systemctl --failed  # Check failed services',
        'journalctl -xe --no-pager | tail -50  # Recent logs',
        'df -h  # Disk space',
        'free -h  # Memory usage',
        'top -bn1 | head -20  # System load'
      ],
      expected_outcome: 'Understanding of current system state',
      risks: ['Minimal - read-only operations'],
      validation_steps: ['Review all output for anomalies'],
      estimated_time: '10-15 minutes'
    });
    
    // 問題固有のアクション
    if (problemDesc.includes('service')) {
      immediateActions.push({
        step_number: 1,
        title: 'Service Status Check',
        description: 'Check and potentially restart affected services',
        commands: [
          'systemctl status [service-name]',
          'systemctl restart [service-name]  # If needed'
        ],
        expected_outcome: 'Service restored to operational state',
        risks: ['Brief service interruption during restart'],
        validation_steps: ['Verify service is active and running'],
        estimated_time: '5-10 minutes'
      });
    }
    
    return {
      immediate_actions: immediateActions,
      investigation_steps: investigationSteps,
      long_term_solutions: longTermSolutions,
      prevention_measures: [
        'Implement regular system monitoring',
        'Establish maintenance procedures',
        'Document system configurations'
      ],
      monitoring_recommendations: [
        'Monitor system logs for recurring issues',
        'Set up alerts for service failures',
        'Regular system health checks'
      ]
    };
  }

  private prioritizeActions(
    resolutionPlan: any,
    approvedActions?: string[]
  ): string[] {
    const actions: string[] = [];
    
    // 緊急アクション
    for (const action of resolutionPlan.immediate_actions) {
      actions.push(`[緊急] ${action.title}: ${action.description}`);
      actions.push(...action.commands.map((cmd: string) => `  $ ${cmd}`));
    }
    
    // 調査ステップ
    for (const step of resolutionPlan.investigation_steps) {
      actions.push(`[調査] ${step.title}: ${step.description}`);
      actions.push(...step.commands.map((cmd: string) => `  $ ${cmd}`));
    }
    
    return actions;
  }
}

export default InteractiveTroubleshooter;