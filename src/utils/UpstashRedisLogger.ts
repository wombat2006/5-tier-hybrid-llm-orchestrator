import { Redis } from '@upstash/redis';
import {
  LogLevel,
  QueryAnalysisLog,
  ModelMetrics,
  DailyCostSummary
} from './RedisLogger';

/**
 * Upstash Redis統合ログシステム
 * REST API経由でのグローバル分散Redis操作
 */
export class UpstashRedisLogger {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    // 環境変数からUpstash Redis設定を取得
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!upstashUrl || !upstashToken) {
      console.warn('[UpstashRedisLogger] Missing Upstash Redis credentials, logging disabled');
      this.isConnected = false;
      // ダミーRedisインスタンス（エラー回避用）
      this.redis = new Redis({ url: 'dummy', token: 'dummy' });
      return;
    }

    this.redis = new Redis({
      url: upstashUrl,
      token: upstashToken,
    });

    this.isConnected = true;
    console.log('[UpstashRedisLogger] ✅ Upstash Redis initialized');
  }

  /**
   * 接続テスト（Upstash REST APIへのping）
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      console.warn('[UpstashRedisLogger] Upstash Redis not configured, skipping connection');
      return;
    }

    try {
      const result = await this.redis.ping();
      if (result === 'PONG') {
        console.log('[UpstashRedisLogger] ✅ Upstash Redis connected successfully');
      }
    } catch (error) {
      console.error('[UpstashRedisLogger] Failed to connect to Upstash Redis:', error);
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    // Upstash REST APIは接続プール管理が不要
    this.isConnected = false;
    console.log('[UpstashRedisLogger] Disconnected from Upstash Redis');
  }

  /**
   * 汎用ログ記録（TTL付き）
   */
  async log(level: keyof LogLevel, message: string, data?: any, ttlSeconds: number = 604800): Promise<void> {
    if (!this.isConnected) return;

    try {
      const timestamp = Date.now();
      const logKey = `logs:${level}:${timestamp}:${Math.random().toString(36).substr(2, 9)}`;
      
      const logEntry = {
        level,
        message,
        timestamp,
        data: data || null,
        service: 'llm-orchestrator-upstash'
      };

      await this.redis.setex(logKey, ttlSeconds, JSON.stringify(logEntry));
    } catch (error) {
      console.error('[UpstashRedisLogger] Log write failed:', error);
    }
  }

  /**
   * クエリ分析結果のトレースログ
   */
  async logQueryAnalysis(analysis: QueryAnalysisLog): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = `traces:analysis:${analysis.requestId}`;
      await this.redis.setex(key, 259200, JSON.stringify(analysis)); // 3日間保持
      
      // インデックス用（Upstash SET操作）
      const indexKey = `traces:analysis:index:${new Date().toISOString().split('T')[0]}`;
      await this.redis.sadd(indexKey, analysis.requestId);
      await this.redis.expire(indexKey, 259200);
      
      await this.log('TRACE', 'Query analysis completed', {
        requestId: analysis.requestId,
        complexity: analysis.complexity,
        selected_model: analysis.selected_model,
        confidence_score: analysis.confidence_score
      });
    } catch (error) {
      console.error('[UpstashRedisLogger] Query analysis log failed:', error);
    }
  }

  /**
   * モデルメトリクス更新
   */
  async updateModelMetrics(modelId: string, latency: number, cost: number, success: boolean): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = `metrics:models:${modelId}`;
      const now = Date.now();
      
      // Upstash Redis原子的操作
      await this.redis.hincrby(key, 'request_count', 1);
      await this.redis.hincrby(key, success ? 'success_count' : 'error_count', 1);
      await this.redis.hincrbyfloat(key, 'total_latency_ms', latency);
      await this.redis.hincrbyfloat(key, 'total_cost_usd', cost);
      await this.redis.hset(key, { 'last_used': now.toString() });
      
      // 平均値計算
      const metrics = await this.redis.hgetall(key);
      if (!metrics) return;
      
      const requestCount = parseInt((metrics.request_count as string) || '1');
      const avgLatency = parseFloat((metrics.total_latency_ms as string) || '0') / requestCount;
      const avgCost = parseFloat((metrics.total_cost_usd as string) || '0') / requestCount;
      const successRate = parseInt((metrics.success_count as string) || '0') / requestCount;
      
      await this.redis.hset(key, {
        'avg_latency_ms': avgLatency.toString(),
        'avg_cost_usd': avgCost.toString(),
        'success_rate': successRate.toString()
      });
      
      // TTL設定（30日）
      await this.redis.expire(key, 2592000);
    } catch (error) {
      console.error('[UpstashRedisLogger] Model metrics update failed:', error);
    }
  }

  /**
   * 日次コスト集計更新
   */
  async updateDailyCosts(): Promise<void> {
    if (!this.isConnected) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const costTableKey = `cost_table:${today}`;
      
      // 全モデルメトリクスを取得
      const modelKeys = await this.getModelKeys();
      const summary: DailyCostSummary = {
        date: today,
        total_requests: 0,
        total_cost_usd: 0,
        model_breakdown: {},
        tier_breakdown: {},
        error_count: 0,
        success_rate: 0
      };
      
      let totalSuccesses = 0;
      
      for (const modelId of modelKeys) {
        const key = `metrics:models:${modelId}`;
        const metrics = await this.redis.hgetall(key);
        if (!metrics) continue;
        
        const requests = parseInt((metrics.request_count as string) || '0');
        const cost = parseFloat((metrics.total_cost_usd as string) || '0');
        const successes = parseInt((metrics.success_count as string) || '0');
        const errors = parseInt((metrics.error_count as string) || '0');
        const avgLatency = parseFloat((metrics.avg_latency_ms as string) || '0');
        
        if (requests > 0) {
          summary.total_requests += requests;
          summary.total_cost_usd += cost;
          summary.error_count += errors;
          totalSuccesses += successes;
          
          summary.model_breakdown[modelId] = {
            requests,
            cost,
            avg_latency: avgLatency
          };
        }
      }
      
      summary.success_rate = summary.total_requests > 0 
        ? totalSuccesses / summary.total_requests 
        : 0;
      
      // 日次コストテーブル更新
      await this.redis.setex(costTableKey, 2592000, JSON.stringify(summary)); // 30日保持
      
      // コスト履歴インデックス更新（Upstash ZADD）
      const historyKey = 'cost_history:index';
      await this.redis.zadd(historyKey, { score: Date.now(), member: today });
      await this.redis.expire(historyKey, 2592000);
      
      await this.log('INFO', 'Daily cost table updated', {
        date: today,
        total_requests: summary.total_requests,
        total_cost_usd: summary.total_cost_usd,
        success_rate: summary.success_rate
      });
    } catch (error) {
      console.error('[UpstashRedisLogger] Daily cost update failed:', error);
    }
  }

  /**
   * モデルキー一覧取得（Upstash用）
   */
  private async getModelKeys(): Promise<string[]> {
    try {
      // Upstash REST APIでkeys操作
      const keys = await this.redis.keys('metrics:models:*');
      return keys.map(key => key.replace('metrics:models:', ''));
    } catch (error) {
      console.error('[UpstashRedisLogger] Failed to get model keys:', error);
      return [];
    }
  }

  /**
   * エラー分類追跡
   */
  async trackError(errorType: string, errorMessage: string, context?: any): Promise<void> {
    if (!this.isConnected) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const errorKey = `errors:classification:${today}`;
      
      await this.redis.hincrby(errorKey, errorType, 1);
      await this.redis.expire(errorKey, 2592000); // 30日保持
      
      await this.log('ERROR', errorMessage, {
        error_type: errorType,
        context: context || null
      }, 2592000);
    } catch (error) {
      console.error('[UpstashRedisLogger] Error tracking failed:', error);
    }
  }

  /**
   * リアルタイムメトリクス取得
   */
  async getRealTimeMetrics(): Promise<{
    models: Record<string, ModelMetrics>;
    dailyCosts: DailyCostSummary | null;
    errorStats: Record<string, string>;
  }> {
    if (!this.isConnected) {
      return { models: {}, dailyCosts: null, errorStats: {} };
    }

    try {
      const modelKeys = await this.getModelKeys();
      const models: Record<string, ModelMetrics> = {};
      
      for (const modelId of modelKeys) {
        const key = `metrics:models:${modelId}`;
        const metrics = await this.redis.hgetall(key);
        if (!metrics) continue;
        
        models[modelId] = {
          model_id: modelId,
          request_count: parseInt((metrics.request_count as string) || '0'),
          success_count: parseInt((metrics.success_count as string) || '0'),
          error_count: parseInt((metrics.error_count as string) || '0'),
          total_latency_ms: parseFloat((metrics.total_latency_ms as string) || '0'),
          avg_latency_ms: parseFloat((metrics.avg_latency_ms as string) || '0'),
          total_cost_usd: parseFloat((metrics.total_cost_usd as string) || '0'),
          avg_cost_usd: parseFloat((metrics.avg_cost_usd as string) || '0'),
          last_used: parseInt((metrics.last_used as string) || '0'),
          success_rate: parseFloat((metrics.success_rate as string) || '0')
        };
      }
      
      // 今日のコスト情報
      const today = new Date().toISOString().split('T')[0];
      const costTableKey = `cost_table:${today}`;
      const dailyCostData = await this.redis.get(costTableKey);
      const dailyCosts = dailyCostData ? JSON.parse(dailyCostData as string) : null;
      
      // エラー統計
      const errorKey = `errors:classification:${today}`;
      const errorStatsRaw = await this.redis.hgetall(errorKey);
      const errorStats: Record<string, string> = errorStatsRaw ? 
        Object.fromEntries(Object.entries(errorStatsRaw).map(([k, v]) => [k, String(v)])) : {};
      
      return { models, dailyCosts, errorStats };
    } catch (error) {
      console.error('[UpstashRedisLogger] Failed to get real-time metrics:', error);
      return { models: {}, dailyCosts: null, errorStats: {} };
    }
  }

  /**
   * クエリ分析履歴取得
   */
  async getQueryAnalysisHistory(date: string, limit: number = 100): Promise<QueryAnalysisLog[]> {
    if (!this.isConnected) return [];

    try {
      const indexKey = `traces:analysis:index:${date}`;
      const requestIds = await this.redis.smembers(indexKey);
      
      const analyses: QueryAnalysisLog[] = [];
      const limitedIds = requestIds.slice(0, limit);
      
      for (const requestId of limitedIds) {
        const key = `traces:analysis:${requestId}`;
        const data = await this.redis.get(key);
        if (data) {
          analyses.push(JSON.parse(data as string));
        }
      }
      
      return analyses.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('[UpstashRedisLogger] Failed to get query analysis history:', error);
      return [];
    }
  }

  /**
   * Upstash Redis接続状態確認
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Upstash Redis統計情報取得
   */
  async getUpstashStats(): Promise<{
    connection_status: string;
    service_type: string;
    features: string[];
  }> {
    return {
      connection_status: this.isConnected ? 'connected' : 'disconnected',
      service_type: 'upstash_redis_rest_api',
      features: [
        'global_distribution',
        'rest_api_access',
        'automatic_scaling',
        'built_in_security',
        'real_time_metrics'
      ]
    };
  }
}

export default UpstashRedisLogger;