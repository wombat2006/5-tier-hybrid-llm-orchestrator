// ユーザー認証・追跡ミドルウェア
// 共有API_KEY環境でのセキュリティ強化とコスト管理

import { Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

interface UserSession {
  userId: string;
  username: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActivity: Date;
  requestCount: number;
  totalCostUsd: number;
  dailyLimitUsd: number;
  hourlyRequestLimit: number;
}

interface UserUsageLog {
  userId: string;
  username: string;
  timestamp: Date;
  endpoint: string;
  prompt: string;
  taskType: string;
  modelUsed: string;
  tierUsed: number;
  costUsd: number;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  success: boolean;
  errorMessage?: string;
}

export class UserAuthMiddleware {
  private sessions = new Map<string, UserSession>();
  private usageLogs: UserUsageLog[] = [];
  private logFile: string;
  private dailyUsageFile: string;
  
  // セキュリティ設定
  private readonly MAX_REQUESTS_PER_HOUR = 50;
  private readonly DAILY_COST_LIMIT_USD = 10.0;
  private readonly SESSION_TIMEOUT_HOURS = 8;
  private readonly SUSPICIOUS_ACTIVITY_THRESHOLD = 100;

  constructor() {
    this.logFile = path.join(process.env.DATA_DIR || './data', 'user-usage-logs.jsonl');
    this.dailyUsageFile = path.join(process.env.DATA_DIR || './data', 'daily-usage.json');
    this.initializeMiddleware();
  }

  private async initializeMiddleware() {
    try {
      // ログディレクトリ作成
      const dataDir = path.dirname(this.logFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      // 既存の使用状況ファイル読み込み
      await this.loadDailyUsage();
      
      // クリーンアップタスクを定期実行
      setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000); // 1時間ごと
      setInterval(() => this.saveUsageLogs(), 5 * 60 * 1000); // 5分ごと
      
      console.log('🔐 UserAuthMiddleware initialized - Enhanced security for shared API keys');
    } catch (error) {
      console.error('❌ Failed to initialize UserAuthMiddleware:', error);
    }
  }

  /**
   * メイン認証ミドルウェア
   */
  public authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = this.extractUserId(req);
      const sessionId = this.extractSessionId(req);
      
      if (!userId) {
        this.sendUnauthorized(res, 'User identification required');
        return;
      }

      // セッション管理
      const session = await this.getOrCreateSession(userId, sessionId, req);
      
      // レート制限チェック
      if (!this.checkRateLimit(session)) {
        this.sendRateLimited(res, 'Hourly request limit exceeded');
        return;
      }

      // 日次コスト制限チェック
      if (!this.checkDailyCostLimit(session)) {
        this.sendCostLimited(res, 'Daily cost limit exceeded');
        return;
      }

      // 不審な活動検出
      if (this.detectSuspiciousActivity(session, req)) {
        console.warn(`🚨 Suspicious activity detected for user: ${userId}`);
        this.sendSuspiciousActivity(res, 'Suspicious activity detected');
        return;
      }

      // リクエストメタデータをセット
      req.userSession = session;
      req.userId = userId;
      req.sessionId = sessionId;

      // セッション更新
      this.updateSessionActivity(session);

      next();
    } catch (error) {
      console.error('❌ Authentication error:', error);
      res.status(500).json({
        success: false,
        error: 'Authentication system error'
      });
    }
  };

  /**
   * 使用量ログ記録ミドルウェア
   */
  public logUsage = (req: Request, res: Response, next: NextFunction) => {
    // レスポンス終了時に使用量を記録
    const originalSend = res.send;
    
    res.send = function(this: Response, body: any) {
      // 使用量情報を抽出
      const responseData = typeof body === 'string' ? JSON.parse(body) : body;
      
      if (req.userSession && responseData.metadata) {
        const usageLog: UserUsageLog = {
          userId: req.userId!,
          username: req.userSession.username,
          timestamp: new Date(),
          endpoint: req.path,
          prompt: req.body?.prompt ? req.body.prompt.substring(0, 100) : 'N/A',
          taskType: req.body?.task_type || 'unknown',
          modelUsed: responseData.model_used || 'unknown',
          tierUsed: responseData.tier_used || 0,
          costUsd: responseData.cost_info?.total_cost_usd || 0,
          tokensUsed: responseData.metadata?.tokens_used || { input: 0, output: 0, total: 0 },
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          sessionId: req.sessionId!,
          success: responseData.success || false,
          errorMessage: responseData.error?.message
        };

        // 非同期で使用量を記録
        void req.app.locals.userAuthMiddleware.recordUsage(usageLog);
      }

      return originalSend.call(this, body);
    };

    next();
  };

  private extractUserId(req: Request): string | null {
    // 複数の方法でユーザーIDを抽出
    return (
      req.headers['x-user-id'] as string ||
      req.body?.user_metadata?.user_id ||
      req.query.user_id as string ||
      this.extractUserFromJWT(req) ||
      null
    );
  }

  private extractSessionId(req: Request): string {
    return (
      req.headers['x-session-id'] as string ||
      req.body?.user_metadata?.session_id ||
      this.generateSessionId()
    );
  }

  private extractUserFromJWT(req: Request): string | null {
    // JWT トークンからユーザー情報を抽出
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const jwtSecret = process.env.JWT_SECRET;
        
        if (!jwtSecret) {
          console.warn('⚠️ JWT_SECRET not configured, skipping JWT validation');
          return null;
        }
        
        const decoded = jwt.verify(token, jwtSecret) as any;
        return decoded.userId || decoded.sub || decoded.username;
      } catch (error) {
        console.warn('🔒 Invalid JWT token:', error instanceof Error ? error.message : 'Unknown error');
        return null;
      }
    }
    return null;
  }

  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private async getOrCreateSession(
    userId: string, 
    sessionId: string, 
    req: Request
  ): Promise<UserSession> {
    const existingSession = this.sessions.get(sessionId);
    
    if (existingSession && existingSession.userId === userId) {
      return existingSession;
    }

    // 新しいセッション作成
    const session: UserSession = {
      userId,
      username: userId, // 実際の実装では適切なユーザー名取得
      sessionId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      createdAt: new Date(),
      lastActivity: new Date(),
      requestCount: 0,
      totalCostUsd: 0,
      dailyLimitUsd: this.DAILY_COST_LIMIT_USD,
      hourlyRequestLimit: this.MAX_REQUESTS_PER_HOUR
    };

    this.sessions.set(sessionId, session);
    console.log(`🔑 New session created for user: ${userId}`);
    
    return session;
  }

  private checkRateLimit(session: UserSession): boolean {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // 過去1時間のリクエスト数をカウント（簡易実装）
    if (session.lastActivity > oneHourAgo && session.requestCount >= session.hourlyRequestLimit) {
      return false;
    }

    // 1時間経過していればリセット
    if (session.lastActivity <= oneHourAgo) {
      session.requestCount = 0;
    }

    return true;
  }

  private checkDailyCostLimit(session: UserSession): boolean {
    const today = new Date().toISOString().split('T')[0];
    const dailyCost = this.getDailyCost(session.userId, today);
    
    return dailyCost < session.dailyLimitUsd;
  }

  private detectSuspiciousActivity(session: UserSession, req: Request): boolean {
    // 不審な活動のパターン検出
    const suspiciousPatterns = [
      // 異常に高い頻度でのリクエスト
      session.requestCount > this.SUSPICIOUS_ACTIVITY_THRESHOLD,
      
      // 異常に長いプロンプト
      req.body?.prompt && req.body.prompt.length > 10000,
      
      // 不審なUser-Agent
      !req.get('User-Agent') || req.get('User-Agent')?.includes('bot'),
      
      // IPアドレスの急激な変更（実装時は地理的位置も考慮）
      // この部分は実際の実装でより高度な検出ロジックを追加
    ];

    return suspiciousPatterns.some(pattern => pattern);
  }

  private updateSessionActivity(session: UserSession): void {
    session.lastActivity = new Date();
    session.requestCount++;
  }

  private async recordUsage(usageLog: UserUsageLog): Promise<void> {
    this.usageLogs.push(usageLog);

    // セッションのコスト累計を更新
    const session = this.sessions.get(usageLog.sessionId);
    if (session) {
      session.totalCostUsd += usageLog.costUsd;
    }

    // 異常なコスト発生時の緊急アラート
    if (usageLog.costUsd > 1.0) { // $1以上の単発コスト
      console.warn(`💸 High cost detected: $${usageLog.costUsd} for user ${usageLog.userId}`);
    }
  }

  private getDailyCost(userId: string, date: string): number {
    return this.usageLogs
      .filter(log => 
        log.userId === userId && 
        log.timestamp.toISOString().startsWith(date)
      )
      .reduce((total, log) => total + log.costUsd, 0);
  }

  private cleanupExpiredSessions(): void {
    const cutoff = new Date(Date.now() - this.SESSION_TIMEOUT_HOURS * 60 * 60 * 1000);
    
    const sessionsToDelete: string[] = [];
    this.sessions.forEach((session, sessionId) => {
      if (session.lastActivity < cutoff) {
        sessionsToDelete.push(sessionId);
      }
    });
    
    sessionsToDelete.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });
  }

  private async saveUsageLogs(): Promise<void> {
    if (this.usageLogs.length === 0) return;

    try {
      const logs = this.usageLogs.splice(0); // 現在のログを取得してクリア
      const logLines = logs.map(log => JSON.stringify(log)).join('\n') + '\n';
      
      await fs.appendFile(this.logFile, logLines);
    } catch (error) {
      console.error('❌ Failed to save usage logs:', error);
    }
  }

  private async loadDailyUsage(): Promise<void> {
    try {
      const data = await fs.readFile(this.dailyUsageFile, 'utf-8');
      // 日次使用量の復元処理（実装時に詳細化）
    } catch (error) {
      // ファイルが存在しない場合は新規作成
    }
  }

  private sendUnauthorized(res: Response, message: string): Response {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message,
      code: 'AUTH_REQUIRED'
    });
  }

  private sendRateLimited(res: Response, message: string): Response {
    return res.status(429).json({
      success: false,
      error: 'Rate Limited',
      message,
      code: 'RATE_LIMIT_EXCEEDED',
      retry_after: 3600 // 1時間後に再試行
    });
  }

  private sendCostLimited(res: Response, message: string): Response {
    return res.status(402).json({
      success: false,
      error: 'Cost Limit Exceeded',
      message,
      code: 'COST_LIMIT_EXCEEDED'
    });
  }

  private sendSuspiciousActivity(res: Response, message: string): Response {
    return res.status(403).json({
      success: false,
      error: 'Suspicious Activity',
      message,
      code: 'SUSPICIOUS_ACTIVITY_DETECTED'
    });
  }

  /**
   * 管理者用メソッド：ユーザー使用状況取得
   */
  public getUserUsageReport(userId?: string): any {
    const logs = userId 
      ? this.usageLogs.filter(log => log.userId === userId)
      : this.usageLogs;

    return {
      total_requests: logs.length,
      total_cost_usd: logs.reduce((sum, log) => sum + log.costUsd, 0),
      unique_users: new Set(logs.map(log => log.userId)).size,
      usage_by_tier: this.groupBy(logs, 'tierUsed'),
      usage_by_model: this.groupBy(logs, 'modelUsed'),
      recent_activity: logs.slice(-10)
    };
  }

  private groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((result, item) => {
      const group = item[key] || 'unknown';
      result[group] = (result[group] || 0) + 1;
      return result;
    }, {});
  }
}

// Express Request インターフェースの拡張
declare global {
  namespace Express {
    interface Request {
      userSession?: UserSession;
      userId?: string;
      sessionId?: string;
    }
  }
}