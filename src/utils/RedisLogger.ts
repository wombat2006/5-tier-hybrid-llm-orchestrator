import { createClient, RedisClientType } from 'redis';

export interface LogLevel {
  INFO: 'info';
  ERROR: 'error';
  DEBUG: 'debug';
  WARN: 'warn';
  TRACE: 'trace';
}

export interface QueryAnalysisLog {
  requestId: string;
  timestamp: number;
  complexity: string;
  reasoning_depth: string;
  creativity_level: string;
  routing_decision: string;
  selected_model: string;
  selected_tier: number;
  confidence_score: number;
  alternative_models: string[];
  analysis_time_ms: number;
  prompt_length: number;
  estimated_cost: number;
  priority_balance: {
    accuracy: number;
    speed: number;
    cost: number;
  };
}

export interface ModelMetrics {
  model_id: string;
  request_count: number;
  success_count: number;
  error_count: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  last_used: number;
  success_rate: number;
}

export interface DailyCostSummary {
  date: string;
  total_requests: number;
  total_cost_usd: number;
  model_breakdown: Record<string, {
    requests: number;
    cost: number;
    avg_latency: number;
  }>;
  tier_breakdown: Record<string, {
    requests: number;
    cost: number;
  }>;
  error_count: number;
  success_rate: number;
}

export class RedisLogger {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
      }
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis Logger connected');
      this.isConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        this.isConnected = false;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
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
        service: 'llm-orchestrator'
      };

      await this.client.setEx(logKey, ttlSeconds, JSON.stringify(logEntry));
    } catch (error) {
      console.error('Redis log write failed:', error);
    }
  }

  /**
   * クエリ分析結果のトレースログ
   */
  async logQueryAnalysis(analysis: QueryAnalysisLog): Promise<void> {
    if (!this.isConnected) return;

    try {
      const key = `traces:analysis:${analysis.requestId}`;
      await this.client.setEx(key, 259200, JSON.stringify(analysis)); // 3日間保持
      
      // インデックス用
      const indexKey = `traces:analysis:index:${new Date().toISOString().split('T')[0]}`;
      await this.client.sAdd(indexKey, analysis.requestId);
      await this.client.expire(indexKey, 259200);
      
      await this.log('TRACE', 'Query analysis completed', {
        requestId: analysis.requestId,
        complexity: analysis.complexity,
        selected_model: analysis.selected_model,
        confidence_score: analysis.confidence_score
      });
    } catch (error) {
      console.error('Query analysis log failed:', error);
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
      
      // 原子的操作でメトリクス更新
      const multi = this.client.multi();
      
      multi.hIncrBy(key, 'request_count', 1);
      multi.hIncrBy(key, success ? 'success_count' : 'error_count', 1);
      multi.hIncrByFloat(key, 'total_latency_ms', latency);
      multi.hIncrByFloat(key, 'total_cost_usd', cost);
      multi.hSet(key, 'last_used', now.toString());
      
      await multi.exec();
      
      // 平均値計算
      const metrics = await this.client.hGetAll(key);
      const requestCount = parseInt(metrics.request_count || '1');
      const avgLatency = parseFloat(metrics.total_latency_ms || '0') / requestCount;
      const avgCost = parseFloat(metrics.total_cost_usd || '0') / requestCount;
      const successRate = parseInt(metrics.success_count || '0') / requestCount;
      
      await this.client.hSet(key, {
        'avg_latency_ms': avgLatency.toString(),
        'avg_cost_usd': avgCost.toString(),
        'success_rate': successRate.toString()
      });
      
      // TTL設定（30日）
      await this.client.expire(key, 2592000);
    } catch (error) {
      console.error('Model metrics update failed:', error);
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
      const modelKeys = await this.client.keys('metrics:models:*');
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
      
      for (const key of modelKeys) {
        const modelId = key.split(':')[2];
        const metrics = await this.client.hGetAll(key);
        
        const requests = parseInt(metrics.request_count || '0');
        const cost = parseFloat(metrics.total_cost_usd || '0');
        const successes = parseInt(metrics.success_count || '0');
        const errors = parseInt(metrics.error_count || '0');
        const avgLatency = parseFloat(metrics.avg_latency_ms || '0');
        
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
      await this.client.setEx(costTableKey, 2592000, JSON.stringify(summary)); // 30日保持
      
      // コスト履歴インデックス更新
      const historyKey = 'cost_history:index';
      await this.client.zAdd(historyKey, {
        score: Date.now(),
        value: today
      });
      await this.client.expire(historyKey, 2592000);
      
      await this.log('INFO', 'Daily cost table updated', {
        date: today,
        total_requests: summary.total_requests,
        total_cost_usd: summary.total_cost_usd,
        success_rate: summary.success_rate
      });
    } catch (error) {
      console.error('Daily cost update failed:', error);
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
      
      await this.client.hIncrBy(errorKey, errorType, 1);
      await this.client.expire(errorKey, 2592000); // 30日保持
      
      await this.log('ERROR', errorMessage, {
        error_type: errorType,
        context: context || null
      }, 2592000);
    } catch (error) {
      console.error('Error tracking failed:', error);
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
      const modelKeys = await this.client.keys('metrics:models:*');
      const models: Record<string, ModelMetrics> = {};
      
      for (const key of modelKeys) {
        const modelId = key.split(':')[2];
        const metrics = await this.client.hGetAll(key);
        
        models[modelId] = {
          model_id: modelId,
          request_count: parseInt(metrics.request_count || '0'),
          success_count: parseInt(metrics.success_count || '0'),
          error_count: parseInt(metrics.error_count || '0'),
          total_latency_ms: parseFloat(metrics.total_latency_ms || '0'),
          avg_latency_ms: parseFloat(metrics.avg_latency_ms || '0'),
          total_cost_usd: parseFloat(metrics.total_cost_usd || '0'),
          avg_cost_usd: parseFloat(metrics.avg_cost_usd || '0'),
          last_used: parseInt(metrics.last_used || '0'),
          success_rate: parseFloat(metrics.success_rate || '0')
        };
      }
      
      // 今日のコスト情報
      const today = new Date().toISOString().split('T')[0];
      const costTableKey = `cost_table:${today}`;
      const dailyCostData = await this.client.get(costTableKey);
      const dailyCosts = dailyCostData ? JSON.parse(dailyCostData) : null;
      
      // エラー統計
      const errorKey = `errors:classification:${today}`;
      const errorStats = await this.client.hGetAll(errorKey);
      
      return { models, dailyCosts, errorStats };
    } catch (error) {
      console.error('Failed to get real-time metrics:', error);
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
      const requestIds = await this.client.sMembers(indexKey);
      
      const analyses: QueryAnalysisLog[] = [];
      const limitedIds = requestIds.slice(0, limit);
      
      for (const requestId of limitedIds) {
        const key = `traces:analysis:${requestId}`;
        const data = await this.client.get(key);
        if (data) {
          analyses.push(JSON.parse(data));
        }
      }
      
      return analyses.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get query analysis history:', error);
      return [];
    }
  }
}

export default RedisLogger;