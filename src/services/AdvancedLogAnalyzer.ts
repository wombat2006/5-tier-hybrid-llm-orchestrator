import { LLMRequest, TaskType } from '../types';

/**
 * 高度なログ解析エンジン
 * ユーザが提供する実際の業務ログを解析し、包括的な問題解決を提供
 * 
 * 責任範囲:
 * - 多形式ログの解析 (syslog, Apache, Nginx, PostgreSQL, アプリケーションログ等)
 * - タイムスタンプ相関分析
 * - エラー連鎖・依存関係の特定
 * - 環境コンテキストの推定
 * - 具体的解決手順の生成
 */

export interface LogEntry {
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'TRACE';
  source: string;
  service: string;
  message: string;
  raw_line: string;
  parsed_fields?: Record<string, any>;
}

export interface LogAnalysisContext {
  user_description: string;
  environment: {
    os?: string;
    version?: string;
    architecture?: string;
    server_role?: string; // web, db, app, etc.
    deployment_type?: 'standalone' | 'cluster' | 'container' | 'cloud';
  };
  timeline?: {
    problem_started?: string;
    last_working?: string;
    actions_taken?: string[];
  };
  system_info?: {
    services_affected?: string[];
    error_frequency?: 'once' | 'intermittent' | 'continuous';
    user_impact?: 'none' | 'minor' | 'major' | 'critical';
  };
}

export interface ParsedLogAnalysis {
  log_format: string;
  total_entries: number;
  date_range: {
    start: Date;
    end: Date;
  };
  log_levels: Record<string, number>;
  services_involved: string[];
  error_patterns: ErrorPattern[];
  timeline_analysis: TimelineEvent[];
  correlation_analysis: CorrelationInsight[];
  environment_hints: EnvironmentHint[];
}

export interface ErrorPattern {
  pattern_type: string;
  frequency: number;
  first_occurrence: Date;
  last_occurrence: Date;
  affected_services: string[];
  sample_messages: string[];
  severity_assessment: 'low' | 'medium' | 'high' | 'critical';
  probable_causes: string[];
}

export interface TimelineEvent {
  timestamp: Date;
  event_type: 'error_spike' | 'service_restart' | 'configuration_change' | 'resource_issue';
  description: string;
  impact_level: number; // 1-5
  related_entries: LogEntry[];
}

export interface CorrelationInsight {
  correlation_type: 'temporal' | 'service_dependency' | 'resource_contention';
  description: string;
  confidence_score: number; // 0-1
  related_patterns: string[];
  implications: string[];
}

export interface EnvironmentHint {
  hint_type: 'os_detection' | 'service_detection' | 'version_detection' | 'config_detection';
  detected_value: string;
  confidence: number;
  evidence: string[];
}

export interface ComprehensiveDiagnosis {
  primary_issue: {
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence_score: number;
  };
  contributing_factors: string[];
  root_cause_analysis: {
    most_likely_cause: string;
    alternative_causes: string[];
    reasoning: string;
  };
  impact_assessment: {
    affected_systems: string[];
    user_impact: string;
    business_impact: 'minimal' | 'moderate' | 'significant' | 'severe';
    urgency_level: number; // 1-5
  };
  resolution_plan: ResolutionPlan;
}

export interface ResolutionPlan {
  immediate_actions: ResolutionStep[];
  investigation_steps: ResolutionStep[];
  long_term_solutions: ResolutionStep[];
  prevention_measures: string[];
  monitoring_recommendations: string[];
}

export interface ResolutionStep {
  step_number: number;
  title: string;
  description: string;
  commands: string[];
  expected_outcome: string;
  risks: string[];
  validation_steps: string[];
  estimated_time: string;
}

export class AdvancedLogAnalyzer {
  
  /**
   * メイン解析エントリーポイント
   */
  async analyzeUserLogs(
    rawLogs: string, 
    context: LogAnalysisContext
  ): Promise<ComprehensiveDiagnosis> {
    console.log('[AdvancedLogAnalyzer] 🔍 Starting comprehensive log analysis...');
    console.log(`[AdvancedLogAnalyzer] Context: ${(context.user_description || 'No description').substring(0, 100)}...`);
    console.log(`[AdvancedLogAnalyzer] Log size: ${rawLogs.length} characters`);

    try {
      // 1. ログ形式判定・パース
      const parsedLogs = await this.parseMultiFormatLogs(rawLogs);
      
      // 2. 詳細解析実行
      const analysis = await this.performDetailedAnalysis(parsedLogs, context);
      
      // 3. 包括的診断生成
      const diagnosis = await this.generateComprehensiveDiagnosis(analysis, context, parsedLogs);
      
      console.log('[AdvancedLogAnalyzer] ✅ Analysis complete');
      return diagnosis;
      
    } catch (error) {
      console.error('[AdvancedLogAnalyzer] ❌ Analysis failed:', error);
      throw error;
    }
  }

  /**
   * 多形式ログパーサー
   */
  private async parseMultiFormatLogs(rawLogs: string): Promise<ParsedLogAnalysis> {
    const lines = rawLogs.split('\n').filter(line => line.trim());
    const parsedEntries: LogEntry[] = [];
    let detectedFormat = 'unknown';

    console.log(`[AdvancedLogAnalyzer] 📄 Parsing ${lines.length} log lines...`);

    for (const line of lines) {
      const entry = await this.parseLogLine(line);
      if (entry) {
        parsedEntries.push(entry);
        
        // 最初の有効エントリーから形式を判定
        if (detectedFormat === 'unknown') {
          detectedFormat = this.detectLogFormat(line);
        }
      }
    }

    // 統計情報生成
    const logLevels: Record<string, number> = {};
    const servicesSet = new Set<string>();
    let earliestDate = new Date();
    let latestDate = new Date(0);

    for (const entry of parsedEntries) {
      // ログレベル集計
      logLevels[entry.level] = (logLevels[entry.level] || 0) + 1;
      
      // サービス収集
      servicesSet.add(entry.service);
      
      // 日付範囲
      if (entry.timestamp < earliestDate) earliestDate = entry.timestamp;
      if (entry.timestamp > latestDate) latestDate = entry.timestamp;
    }

    // エラーパターン分析
    const errorPatterns = await this.identifyErrorPatterns(parsedEntries);
    
    // タイムライン分析
    const timelineEvents = await this.analyzeTimeline(parsedEntries);
    
    // 相関分析
    const correlationInsights = await this.performCorrelationAnalysis(parsedEntries);
    
    // 環境ヒント抽出
    const environmentHints = await this.extractEnvironmentHints(parsedEntries);

    return {
      log_format: detectedFormat,
      total_entries: parsedEntries.length,
      date_range: {
        start: earliestDate,
        end: latestDate
      },
      log_levels: logLevels,
      services_involved: Array.from(servicesSet),
      error_patterns: errorPatterns,
      timeline_analysis: timelineEvents,
      correlation_analysis: correlationInsights,
      environment_hints: environmentHints
    };
  }

  /**
   * 単一ログ行のパース
   */
  private async parseLogLine(line: string): Promise<LogEntry | null> {
    try {
      // Apache/Nginx アクセスログ
      if (this.isApacheAccessLog(line)) {
        return this.parseApacheAccessLog(line);
      }
      
      // Apache/Nginx エラーログ
      if (this.isApacheErrorLog(line)) {
        return this.parseApacheErrorLog(line);
      }
      
      // Syslog形式
      if (this.isSyslogFormat(line)) {
        return this.parseSyslogEntry(line);
      }
      
      // PostgreSQL ログ
      if (this.isPostgreSQLLog(line)) {
        return this.parsePostgreSQLLog(line);
      }
      
      // Journalctl 形式
      if (this.isJournalctlFormat(line)) {
        return this.parseJournalctlEntry(line);
      }
      
      // 一般的なアプリケーションログ
      if (this.isApplicationLog(line)) {
        return this.parseApplicationLog(line);
      }
      
      // フォールバック：汎用パーサー
      return this.parseGenericLog(line);
      
    } catch (error) {
      console.error(`[AdvancedLogAnalyzer] Failed to parse line: ${line.substring(0, 100)}`);
      return null;
    }
  }

  // ログ形式判定メソッド群
  private isApacheAccessLog(line: string): boolean {
    // 一般的なApacheアクセスログパターン
    return /^\d+\.\d+\.\d+\.\d+ - - \[/.test(line) || 
           /^\d+\.\d+\.\d+\.\d+ - \w+ \[/.test(line);
  }

  private isApacheErrorLog(line: string): boolean {
    return /^\[[\w\s:]+\] \[[\w:]+\]/.test(line);
  }

  private isSyslogFormat(line: string): boolean {
    return /^[\w]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/.test(line) ||
           /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(line);
  }

  private isPostgreSQLLog(line: string): boolean {
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(line) && 
           (line.includes('UTC') || line.includes('JST') || line.includes('ERROR') || line.includes('LOG'));
  }

  private isJournalctlFormat(line: string): boolean {
    return /^[\w]{3} \d{2} \d{2}:\d{2}:\d{2} \w+ [\w\-\.]+\[\d+\]:/.test(line);
  }

  private isApplicationLog(line: string): boolean {
    return /\b(ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\b/.test(line);
  }

  // ログパーサー実装群
  private parseApacheAccessLog(line: string): LogEntry {
    // 簡易実装 - 実際はより詳細なパターンマッチング
    const match = line.match(/^(\d+\.\d+\.\d+\.\d+) - - \[(.*?)\] "(\w+) (.*?) HTTP\/\d\.\d" (\d+) (\d+|-)/);
    
    return {
      timestamp: match ? new Date(match[2]) : new Date(),
      level: 'INFO',
      source: 'apache_access',
      service: 'httpd',
      message: line,
      raw_line: line,
      parsed_fields: match ? {
        ip: match[1],
        method: match[3],
        path: match[4],
        status: parseInt(match[5]),
        size: match[6] !== '-' ? parseInt(match[6]) : 0
      } : undefined
    };
  }

  private parseApacheErrorLog(line: string): LogEntry {
    const match = line.match(/^\[(.*?)\] \[(.*?)\] \[client (.*?)\] (.*)/);
    
    return {
      timestamp: match ? new Date(match[1]) : new Date(),
      level: match && match[2].includes('error') ? 'ERROR' : 'WARN',
      source: 'apache_error',
      service: 'httpd',
      message: match ? match[4] : line,
      raw_line: line
    };
  }

  private parseSyslogEntry(line: string): LogEntry {
    const match = line.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}) (\w+) ([\w\-\.]+)(?:\[(\d+)\])?: (.*)/);
    
    if (match) {
      const dateStr = `${new Date().getFullYear()} ${match[1]}`;
      return {
        timestamp: new Date(dateStr),
        level: this.extractLogLevel(match[5]),
        source: 'syslog',
        service: match[3],
        message: match[5],
        raw_line: line,
        parsed_fields: {
          hostname: match[2],
          process: match[3],
          pid: match[4] ? parseInt(match[4]) : undefined
        }
      };
    }
    
    return this.parseGenericLog(line);
  }

  private parsePostgreSQLLog(line: string): LogEntry {
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?) \w+ \[(\d+)\] (\w+): (.*)/);
    
    return {
      timestamp: match ? new Date(match[1]) : new Date(),
      level: match ? match[3].toUpperCase() as LogEntry['level'] : 'INFO',
      source: 'postgresql',
      service: 'postgresql',
      message: match ? match[4] : line,
      raw_line: line,
      parsed_fields: match ? {
        pid: parseInt(match[2])
      } : undefined
    };
  }

  private parseJournalctlEntry(line: string): LogEntry {
    const match = line.match(/^(\w{3} \d{2} \d{2}:\d{2}:\d{2}) (\w+) ([\w\-\.]+)\[(\d+)\]: (.*)/);
    
    if (match) {
      const dateStr = `${new Date().getFullYear()} ${match[1]}`;
      return {
        timestamp: new Date(dateStr),
        level: this.extractLogLevel(match[5]),
        source: 'journalctl',
        service: match[3],
        message: match[5],
        raw_line: line,
        parsed_fields: {
          hostname: match[2],
          pid: parseInt(match[4])
        }
      };
    }
    
    return this.parseGenericLog(line);
  }

  private parseApplicationLog(line: string): LogEntry {
    // タイムスタンプ + レベル + メッセージの一般的なパターン
    const patterns = [
      /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(\w+)\s+(.+)/,
      /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s+(\w+)\s+(.+)/,
      /^(\w{3} \w{3} \d{2} \d{2}:\d{2}:\d{2} \d{4})\s+(\w+)\s+(.+)/
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          timestamp: new Date(match[1]),
          level: match[2].toUpperCase() as LogEntry['level'],
          source: 'application',
          service: 'app',
          message: match[3],
          raw_line: line
        };
      }
    }
    
    return this.parseGenericLog(line);
  }

  private parseGenericLog(line: string): LogEntry {
    return {
      timestamp: new Date(), // フォールバック
      level: this.extractLogLevel(line),
      source: 'unknown',
      service: 'unknown',
      message: line,
      raw_line: line
    };
  }

  private extractLogLevel(message: string): LogEntry['level'] {
    const upper = message.toUpperCase();
    
    if (upper.includes('FATAL') || upper.includes('PANIC')) return 'FATAL';
    if (upper.includes('ERROR')) return 'ERROR';
    if (upper.includes('WARN')) return 'WARN';
    if (upper.includes('INFO')) return 'INFO';
    if (upper.includes('DEBUG')) return 'DEBUG';
    if (upper.includes('TRACE')) return 'TRACE';
    
    return 'INFO';
  }

  private detectLogFormat(line: string): string {
    if (this.isApacheAccessLog(line)) return 'apache_access';
    if (this.isApacheErrorLog(line)) return 'apache_error';
    if (this.isPostgreSQLLog(line)) return 'postgresql';
    if (this.isSyslogFormat(line)) return 'syslog';
    if (this.isJournalctlFormat(line)) return 'journalctl';
    if (this.isApplicationLog(line)) return 'application';
    return 'generic';
  }

  /**
   * 詳細解析実行
   */
  private async performDetailedAnalysis(
    parsedLogs: ParsedLogAnalysis, 
    context: LogAnalysisContext
  ): Promise<ParsedLogAnalysis> {
    console.log('[AdvancedLogAnalyzer] 🧠 Performing detailed analysis...');
    
    // 既存の解析結果を返す（拡張版では更に詳細な分析を追加）
    return parsedLogs;
  }

  /**
   * エラーパターン特定
   */
  private async identifyErrorPatterns(entries: LogEntry[]): Promise<ErrorPattern[]> {
    const errorEntries = entries.filter(e => e.level === 'ERROR' || e.level === 'FATAL');
    const patterns: Map<string, ErrorPattern> = new Map();
    
    for (const entry of errorEntries) {
      // エラーメッセージの正規化
      const normalizedMessage = this.normalizeErrorMessage(entry.message);
      
      if (!patterns.has(normalizedMessage)) {
        patterns.set(normalizedMessage, {
          pattern_type: 'error_message',
          frequency: 1,
          first_occurrence: entry.timestamp,
          last_occurrence: entry.timestamp,
          affected_services: [entry.service],
          sample_messages: [entry.message],
          severity_assessment: this.assessErrorSeverity(entry.message),
          probable_causes: this.identifyProbableCauses(entry.message)
        });
      } else {
        const pattern = patterns.get(normalizedMessage)!;
        pattern.frequency++;
        pattern.last_occurrence = entry.timestamp;
        if (!pattern.affected_services.includes(entry.service)) {
          pattern.affected_services.push(entry.service);
        }
        if (pattern.sample_messages.length < 3) {
          pattern.sample_messages.push(entry.message);
        }
      }
    }
    
    return Array.from(patterns.values()).sort((a, b) => b.frequency - a.frequency);
  }

  private normalizeErrorMessage(message: string): string {
    // 数字、パス、IDなどを正規化して同類エラーをグループ化
    return message
      .replace(/\d+/g, 'N')
      .replace(/\/[\w\/\.]+/g, '/PATH')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, 'IP_ADDRESS');
  }

  private assessErrorSeverity(message: string): 'low' | 'medium' | 'high' | 'critical' {
    const critical = ['fatal', 'panic', 'segmentation fault', 'out of memory', 'disk full'];
    const high = ['connection refused', 'permission denied', 'authentication failed', 'timeout'];
    const medium = ['warning', 'deprecated', 'retry'];
    
    const lower = message.toLowerCase();
    
    if (critical.some(keyword => lower.includes(keyword))) return 'critical';
    if (high.some(keyword => lower.includes(keyword))) return 'high';
    if (medium.some(keyword => lower.includes(keyword))) return 'medium';
    
    return 'low';
  }

  private identifyProbableCauses(message: string): string[] {
    const causes: string[] = [];
    const lower = message.toLowerCase();
    
    if (lower.includes('connection refused') || lower.includes('connection timeout')) {
      causes.push('Service not running or not accessible');
      causes.push('Network connectivity issue');
      causes.push('Firewall blocking connection');
    }
    
    if (lower.includes('permission denied') || lower.includes('access denied')) {
      causes.push('Insufficient file/directory permissions');
      causes.push('SELinux/AppArmor policy restriction');
      causes.push('User lacks required privileges');
    }
    
    if (lower.includes('out of memory') || lower.includes('cannot allocate memory')) {
      causes.push('System memory exhausted');
      causes.push('Memory leak in application');
      causes.push('Insufficient swap space');
    }
    
    if (lower.includes('disk full') || lower.includes('no space left')) {
      causes.push('Disk space exhausted');
      causes.push('Large log files consuming space');
      causes.push('Temporary files not cleaned up');
    }
    
    return causes.length > 0 ? causes : ['Unknown cause - requires further investigation'];
  }

  /**
   * タイムライン分析
   */
  private async analyzeTimeline(entries: LogEntry[]): Promise<TimelineEvent[]> {
    const events: TimelineEvent[] = [];
    
    // エラー急増ポイントを検出
    const errorSpikes = this.detectErrorSpikes(entries);
    events.push(...errorSpikes);
    
    // サービス再起動検出
    const restarts = this.detectServiceRestarts(entries);
    events.push(...restarts);
    
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private detectErrorSpikes(entries: LogEntry[]): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const errorEntries = entries.filter(e => e.level === 'ERROR' || e.level === 'FATAL');
    
    // 5分間隔でエラー数を集計
    const timeSlots: Map<number, LogEntry[]> = new Map();
    for (const entry of errorEntries) {
      const slotTime = Math.floor(entry.timestamp.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000);
      if (!timeSlots.has(slotTime)) {
        timeSlots.set(slotTime, []);
      }
      timeSlots.get(slotTime)!.push(entry);
    }
    
    // 急増を検出（前の時間帯の3倍以上）
    const slots = Array.from(timeSlots.entries()).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < slots.length; i++) {
      const current = slots[i][1];
      const previous = slots[i-1][1];
      
      if (current.length > 10 && current.length >= previous.length * 3) {
        events.push({
          timestamp: new Date(slots[i][0]),
          event_type: 'error_spike',
          description: `Error spike detected: ${current.length} errors in 5 minutes`,
          impact_level: Math.min(5, Math.floor(current.length / 10)),
          related_entries: current
        });
      }
    }
    
    return events;
  }

  private detectServiceRestarts(entries: LogEntry[]): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const restartPatterns = [
      'starting', 'started', 'stopping', 'stopped', 'restarting', 'restarted',
      'service start', 'service stop', 'initialization complete'
    ];
    
    for (const entry of entries) {
      const lower = entry.message.toLowerCase();
      if (restartPatterns.some(pattern => lower.includes(pattern))) {
        events.push({
          timestamp: entry.timestamp,
          event_type: 'service_restart',
          description: `${entry.service}: ${entry.message}`,
          impact_level: 2,
          related_entries: [entry]
        });
      }
    }
    
    return events;
  }

  /**
   * 相関分析
   */
  private async performCorrelationAnalysis(entries: LogEntry[]): Promise<CorrelationInsight[]> {
    const insights: CorrelationInsight[] = [];
    
    // サービス間依存関係分析
    const serviceDependencies = this.analyzeServiceDependencies(entries);
    insights.push(...serviceDependencies);
    
    return insights;
  }

  private analyzeServiceDependencies(entries: LogEntry[]): CorrelationInsight[] {
    const insights: CorrelationInsight[] = [];
    
    // 簡易実装：同時期のエラーから依存関係を推測
    const errorsByService: Map<string, LogEntry[]> = new Map();
    
    entries.filter(e => e.level === 'ERROR').forEach(entry => {
      if (!errorsByService.has(entry.service)) {
        errorsByService.set(entry.service, []);
      }
      errorsByService.get(entry.service)!.push(entry);
    });
    
    // 時間的に近いエラーを関連付け
    const services = Array.from(errorsByService.keys());
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const service1 = services[i];
        const service2 = services[j];
        const correlation = this.calculateTemporalCorrelation(
          errorsByService.get(service1)!,
          errorsByService.get(service2)!
        );
        
        if (correlation > 0.7) {
          insights.push({
            correlation_type: 'service_dependency',
            description: `${service1} and ${service2} show correlated error patterns`,
            confidence_score: correlation,
            related_patterns: [service1, service2],
            implications: [`${service1} issues may cause ${service2} failures`]
          });
        }
      }
    }
    
    return insights;
  }

  private calculateTemporalCorrelation(errors1: LogEntry[], errors2: LogEntry[]): number {
    // 5分以内の時間的相関を計算
    let correlations = 0;
    const timeWindow = 5 * 60 * 1000; // 5分
    
    for (const error1 of errors1) {
      for (const error2 of errors2) {
        if (Math.abs(error1.timestamp.getTime() - error2.timestamp.getTime()) < timeWindow) {
          correlations++;
        }
      }
    }
    
    return Math.min(1, correlations / Math.max(errors1.length, errors2.length));
  }

  /**
   * 環境ヒント抽出
   */
  private async extractEnvironmentHints(entries: LogEntry[]): Promise<EnvironmentHint[]> {
    const hints: EnvironmentHint[] = [];
    
    // OS検出
    const osHints = this.detectOperatingSystem(entries);
    hints.push(...osHints);
    
    // サービス検出
    const serviceHints = this.detectServices(entries);
    hints.push(...serviceHints);
    
    return hints;
  }

  private detectOperatingSystem(entries: LogEntry[]): EnvironmentHint[] {
    const hints: EnvironmentHint[] = [];
    const osIndicators: Map<string, string[]> = new Map([
      ['CentOS', ['centos', 'rhel', 'red hat']],
      ['Ubuntu', ['ubuntu', 'debian']],
      ['SUSE', ['suse', 'opensuse']],
      ['Rocky Linux', ['rocky', 'rocky linux']]
    ]);
    
    for (const [os, indicators] of osIndicators) {
      const evidence = entries.filter(entry => 
        indicators.some(indicator => 
          entry.message.toLowerCase().includes(indicator)
        )
      );
      
      if (evidence.length > 0) {
        hints.push({
          hint_type: 'os_detection',
          detected_value: os,
          confidence: Math.min(1, evidence.length / 10),
          evidence: evidence.slice(0, 3).map(e => e.message)
        });
      }
    }
    
    return hints;
  }

  private detectServices(entries: LogEntry[]): EnvironmentHint[] {
    const serviceSet = new Set(entries.map(e => e.service));
    return Array.from(serviceSet).map(service => ({
      hint_type: 'service_detection',
      detected_value: service,
      confidence: 1,
      evidence: [`Service ${service} found in logs`]
    }));
  }

  /**
   * 包括的診断生成
   */
  private async generateComprehensiveDiagnosis(
    analysis: ParsedLogAnalysis,
    context: LogAnalysisContext,
    parsedLogs: ParsedLogAnalysis
  ): Promise<ComprehensiveDiagnosis> {
    console.log('[AdvancedLogAnalyzer] 🎯 Generating comprehensive diagnosis...');
    
    // 主要問題特定
    const primaryIssue = this.identifyPrimaryIssue(analysis, context);
    
    // 寄与要因分析
    const contributingFactors = this.identifyContributingFactors(analysis);
    
    // 根本原因分析
    const rootCauseAnalysis = this.performRootCauseAnalysis(analysis, context);
    
    // 影響評価
    const impactAssessment = this.assessImpact(analysis, context);
    
    // 解決計画生成
    const resolutionPlan = await this.generateResolutionPlan(analysis, context);
    
    return {
      primary_issue: primaryIssue,
      contributing_factors: contributingFactors,
      root_cause_analysis: rootCauseAnalysis,
      impact_assessment: impactAssessment,
      resolution_plan: resolutionPlan
    };
  }

  private identifyPrimaryIssue(analysis: ParsedLogAnalysis, context: LogAnalysisContext) {
    // 最も頻度の高いエラーパターンを主要問題とする
    const topPattern = analysis.error_patterns[0];
    
    if (!topPattern) {
      return {
        title: 'No Critical Errors Detected',
        description: 'Analysis completed without identifying critical errors',
        severity: 'low' as const,
        confidence_score: 0.9
      };
    }
    
    return {
      title: `${topPattern.pattern_type}: ${topPattern.sample_messages[0].substring(0, 100)}...`,
      description: `Recurring error pattern affecting ${topPattern.affected_services.join(', ')} (${topPattern.frequency} occurrences)`,
      severity: topPattern.severity_assessment,
      confidence_score: Math.min(1, topPattern.frequency / 10)
    };
  }

  private identifyContributingFactors(analysis: ParsedLogAnalysis): string[] {
    const factors: string[] = [];
    
    // 高エラー率
    const totalEntries = analysis.total_entries;
    const errorCount = (analysis.log_levels.ERROR || 0) + (analysis.log_levels.FATAL || 0);
    const errorRate = errorCount / totalEntries;
    
    if (errorRate > 0.1) {
      factors.push(`High error rate: ${(errorRate * 100).toFixed(1)}% of log entries are errors`);
    }
    
    // 複数サービス関与
    if (analysis.services_involved.length > 3) {
      factors.push(`Multiple services affected: ${analysis.services_involved.join(', ')}`);
    }
    
    // タイムライン上のイベント
    if (analysis.timeline_analysis.length > 0) {
      factors.push(`Timeline events detected: ${analysis.timeline_analysis.length} significant events`);
    }
    
    return factors;
  }

  private performRootCauseAnalysis(analysis: ParsedLogAnalysis, context: LogAnalysisContext) {
    const topPattern = analysis.error_patterns[0];
    
    if (!topPattern) {
      return {
        most_likely_cause: 'No errors detected - system appears to be functioning normally',
        alternative_causes: [],
        reasoning: 'Log analysis did not reveal any error patterns or issues'
      };
    }
    
    return {
      most_likely_cause: topPattern.probable_causes[0] || 'Unknown cause',
      alternative_causes: topPattern.probable_causes.slice(1),
      reasoning: `Based on ${topPattern.frequency} occurrences of similar errors across ${topPattern.affected_services.join(', ')}`
    };
  }

  private assessImpact(analysis: ParsedLogAnalysis, context: LogAnalysisContext) {
    const criticalServices = analysis.error_patterns
      .filter(p => p.severity_assessment === 'critical')
      .flatMap(p => p.affected_services);
    
    const userImpact = context.system_info?.user_impact || 'unknown';
    const businessImpact = this.assessBusinessImpact(analysis, context);
    const urgencyLevel = this.calculateUrgencyLevel(analysis, context);
    
    return {
      affected_systems: Array.from(new Set([
        ...analysis.services_involved,
        ...criticalServices
      ])),
      user_impact: `${userImpact} user impact based on error severity and frequency`,
      business_impact: businessImpact,
      urgency_level: urgencyLevel
    };
  }

  private assessBusinessImpact(analysis: ParsedLogAnalysis, context: LogAnalysisContext): 'minimal' | 'moderate' | 'significant' | 'severe' {
    const criticalErrors = analysis.error_patterns.filter(p => p.severity_assessment === 'critical').length;
    const userImpact = context.system_info?.user_impact || 'minor';
    
    if (criticalErrors > 0 && userImpact === 'critical') return 'severe';
    if (criticalErrors > 0 || userImpact === 'major') return 'significant';
    if (analysis.error_patterns.length > 3) return 'moderate';
    return 'minimal';
  }

  private calculateUrgencyLevel(analysis: ParsedLogAnalysis, context: LogAnalysisContext): number {
    let urgency = 1;
    
    // エラーの深刻度
    const criticalErrors = analysis.error_patterns.filter(p => p.severity_assessment === 'critical').length;
    urgency += criticalErrors * 2;
    
    // ユーザー影響
    const userImpact = context.system_info?.user_impact || 'none';
    switch (userImpact) {
      case 'critical': urgency += 3; break;
      case 'major': urgency += 2; break;
      case 'minor': urgency += 1; break;
    }
    
    // エラー頻度
    const errorFrequency = context.system_info?.error_frequency || 'once';
    if (errorFrequency === 'continuous') urgency += 2;
    else if (errorFrequency === 'intermittent') urgency += 1;
    
    return Math.min(5, urgency);
  }

  private async generateResolutionPlan(analysis: ParsedLogAnalysis, context: LogAnalysisContext): Promise<ResolutionPlan> {
    const immediateActions: ResolutionStep[] = [];
    const investigationSteps: ResolutionStep[] = [];
    const longTermSolutions: ResolutionStep[] = [];
    
    // 緊急対応アクション
    if (analysis.error_patterns.some(p => p.severity_assessment === 'critical')) {
      immediateActions.push({
        step_number: 1,
        title: 'Critical Error Immediate Response',
        description: 'Address critical errors that require immediate attention',
        commands: this.generateImmediateCommands(analysis),
        expected_outcome: 'Restore basic system functionality',
        risks: ['Service interruption during restart'],
        validation_steps: ['Check service status', 'Monitor error logs'],
        estimated_time: '15-30 minutes'
      });
    }
    
    // 調査ステップ
    investigationSteps.push({
      step_number: 1,
      title: 'Detailed System Investigation',
      description: 'Gather additional information to understand the full scope of issues',
      commands: this.generateInvestigationCommands(analysis),
      expected_outcome: 'Complete understanding of system state and issues',
      risks: ['Minimal - read-only operations'],
      validation_steps: ['Review all collected information'],
      estimated_time: '30-45 minutes'
    });
    
    // 長期解決策
    longTermSolutions.push({
      step_number: 1,
      title: 'Implement Permanent Fixes',
      description: 'Apply permanent solutions to prevent issue recurrence',
      commands: this.generateLongTermCommands(analysis),
      expected_outcome: 'Permanent resolution of identified issues',
      risks: ['Configuration changes may require testing'],
      validation_steps: ['Full system testing', 'Monitor for 24-48 hours'],
      estimated_time: '1-4 hours'
    });
    
    return {
      immediate_actions: immediateActions,
      investigation_steps: investigationSteps,
      long_term_solutions: longTermSolutions,
      prevention_measures: this.generatePreventionMeasures(analysis),
      monitoring_recommendations: this.generateMonitoringRecommendations(analysis)
    };
  }

  private generateImmediateCommands(analysis: ParsedLogAnalysis): string[] {
    const commands: string[] = [];
    
    // サービス関連の緊急対応
    const failedServices = analysis.error_patterns
      .filter(p => p.severity_assessment === 'critical')
      .flatMap(p => p.affected_services)
      .filter((service, index, array) => array.indexOf(service) === index);
    
    for (const service of failedServices) {
      commands.push(`systemctl status ${service}  # Check ${service} status`);
      commands.push(`systemctl restart ${service}  # Restart ${service} if needed`);
    }
    
    // 一般的なシステムチェック
    commands.push('df -h  # Check disk space');
    commands.push('free -h  # Check memory usage');
    commands.push('top -bn1 | head -20  # Check system load');
    
    return commands;
  }

  private generateInvestigationCommands(analysis: ParsedLogAnalysis): string[] {
    const commands: string[] = [
      'systemctl --failed  # List failed services',
      'journalctl -xe --no-pager  # Recent system logs',
      'dmesg | tail -20  # Kernel messages',
      'ps aux --sort=-%cpu | head -10  # Top CPU processes',
      'netstat -tlnp  # Network connections',
      'lsof +L1  # Check for deleted files still in use'
    ];
    
    // サービス固有の調査
    for (const service of analysis.services_involved) {
      commands.push(`journalctl -u ${service} --since "1 hour ago" --no-pager`);
    }
    
    return commands;
  }

  private generateLongTermCommands(analysis: ParsedLogAnalysis): string[] {
    const commands: string[] = [];
    
    // 設定の最適化
    commands.push('# Configuration optimization based on identified issues');
    
    // ログローテーション
    if (analysis.total_entries > 10000) {
      commands.push('logrotate -f /etc/logrotate.conf  # Force log rotation');
    }
    
    // パフォーマンス最適化
    commands.push('# Consider implementing monitoring and alerting');
    commands.push('# Review and optimize system configurations');
    
    return commands;
  }

  private generatePreventionMeasures(analysis: ParsedLogAnalysis): string[] {
    const measures: string[] = [
      'Implement comprehensive monitoring and alerting',
      'Regular system health checks and maintenance',
      'Automated log rotation and cleanup',
      'Performance baseline establishment',
      'Regular security updates and patches'
    ];
    
    // エラーパターンに基づく具体的な予防策
    for (const pattern of analysis.error_patterns) {
      if (pattern.severity_assessment === 'critical') {
        measures.push(`Address root causes of: ${pattern.sample_messages[0].substring(0, 50)}...`);
      }
    }
    
    return measures;
  }

  private generateMonitoringRecommendations(analysis: ParsedLogAnalysis): string[] {
    return [
      'Set up real-time log monitoring for critical errors',
      'Implement performance metrics collection',
      'Configure automated alerts for service failures',
      `Monitor ${analysis.services_involved.join(', ')} services closely`,
      'Regular system resource utilization reporting'
    ];
  }
}

export default AdvancedLogAnalyzer;