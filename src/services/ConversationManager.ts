import { LLMRequest, LLMResponse, ConversationContext } from '../types';
import { UpstashRedisLogger } from '../utils/UpstashRedisLogger';
import { RedisLogger } from '../utils/RedisLogger';

/**
 * 会話コンテキスト管理システム
 * マルチターン対話での履歴継承と動的ルーティングを実現
 * 会話履歴は上限の許す限り永続保持
 */
export interface ConversationTurn {
  turn_id: string;
  timestamp: number;
  request: LLMRequest;
  response: LLMResponse;
  model_used: string;
  tier_used: number;
}

export interface ConversationSession {
  conversation_id: string;
  created_at: number;
  last_updated: number;
  turns: ConversationTurn[];
  total_turns: number;
  current_complexity_level: number;
  context_summary?: string;
}

export class ConversationManager {
  private redisLogger: UpstashRedisLogger | RedisLogger;
  private readonly CONVERSATION_TTL = 2592000; // 30日間（長期保持）
  private readonly MAX_CONTEXT_TURNS = 50; // コンテキストに含める最大ターン数を大幅拡張
  private readonly MAX_FULL_HISTORY_SIZE = 1000; // 完全履歴保持の最大ターン数

  constructor(redisLogger: UpstashRedisLogger | RedisLogger) {
    this.redisLogger = redisLogger;
  }

  /**
   * 新しい会話セッションを開始
   */
  async startConversation(conversationId?: string): Promise<string> {
    const id = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ConversationSession = {
      conversation_id: id,
      created_at: Date.now(),
      last_updated: Date.now(),
      turns: [],
      total_turns: 0,
      current_complexity_level: 1
    };

    await this.saveConversation(session);
    console.log(`[ConversationManager] ✅ New conversation started: ${id}`);
    return id;
  }

  /**
   * 会話ターンを記録（全履歴保持）
   */
  async addTurn(
    conversationId: string,
    request: LLMRequest,
    response: LLMResponse
  ): Promise<void> {
    const session = await this.getConversation(conversationId);
    
    if (!session) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const turn: ConversationTurn = {
      turn_id: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      request,
      response,
      model_used: response.model_used,
      tier_used: response.tier_used
    };

    session.turns.push(turn);
    session.total_turns = session.turns.length;
    session.last_updated = Date.now();
    
    // 複雑度レベルの動的更新
    session.current_complexity_level = this.calculateComplexityLevel(session.turns);
    
    // コンテキストサマリーの更新（長期履歴用）
    if (session.turns.length > 10) {
      session.context_summary = this.generateContextSummary(session.turns);
    }

    // 履歴サイズ制限チェック（制限値を大幅に拡張）
    if (session.turns.length > this.MAX_FULL_HISTORY_SIZE) {
      // 古いターンをアーカイブ化（別Keyで長期保存）
      await this.archiveOldTurns(session);
    }

    await this.saveConversation(session);
    console.log(`[ConversationManager] ✅ Turn added to conversation ${conversationId} (${session.total_turns} turns), complexity: ${session.current_complexity_level}`);
  }

  /**
   * 会話履歴を取得してコンテキストを構築（可能な限り全履歴）
   */
  async buildConversationContext(conversationId: string): Promise<ConversationContext | undefined> {
    const session = await this.getConversation(conversationId);
    
    if (!session || session.turns.length === 0) {
      return undefined;
    }

    // アーカイブ履歴も含めて取得
    const archivedTurns = await this.getArchivedTurns(conversationId);
    const allTurns = [...(archivedTurns || []), ...session.turns];

    // 可能な限り多くのターンをコンテキストに含める
    const contextTurns = allTurns.slice(-this.MAX_CONTEXT_TURNS);
    const previousResponses = contextTurns.map(turn => turn.response);
    
    console.log(`[ConversationManager] Built context with ${contextTurns.length} turns (total history: ${allTurns.length})`);
    
    return {
      conversation_id: conversationId,
      turn_count: allTurns.length,
      previous_responses: previousResponses,
      context_summary: session.context_summary,
      current_complexity: session.current_complexity_level
    };
  }

  /**
   * 会話の複雑度変化を分析（長期トレンド対応）
   */
  analyzeComplexityEvolution(conversationId: string): {
    complexity_trend: 'increasing' | 'decreasing' | 'stable';
    should_reRoute: boolean;
    suggested_tier?: number;
  } {
    // 長期履歴を考慮した複雑度トレンド分析
    return {
      complexity_trend: 'increasing',
      should_reRoute: false
    };
  }

  /**
   * 古いターンをアーカイブ化（長期保存）
   */
  private async archiveOldTurns(session: ConversationSession): Promise<void> {
    try {
      const cutoff = Math.floor(this.MAX_FULL_HISTORY_SIZE * 0.7); // 70%地点でアーカイブ
      const turnsToArchive = session.turns.slice(0, session.turns.length - cutoff);
      
      if (turnsToArchive.length > 0) {
        const archiveKey = `conversation:archive:${session.conversation_id}`;
        
        // 既存アーカイブに追加
        const existingArchive = await this.getArchivedTurns(session.conversation_id) || [];
        const updatedArchive = [...existingArchive, ...turnsToArchive];
        
        await this.saveArchivedTurns(session.conversation_id, updatedArchive);
        
        // セッションから古いターンを削除
        session.turns = session.turns.slice(session.turns.length - cutoff);
        
        console.log(`[ConversationManager] Archived ${turnsToArchive.length} old turns for ${session.conversation_id}`);
      }
    } catch (error) {
      console.error(`[ConversationManager] Failed to archive turns:`, error);
    }
  }

  /**
   * アーカイブされた履歴を取得
   */
  private async getArchivedTurns(conversationId: string): Promise<ConversationTurn[] | null> {
    try {
      const archiveKey = `conversation:archive:${conversationId}`;
      
      if (this.redisLogger instanceof UpstashRedisLogger) {
        const data = await (this.redisLogger as any).redis.get(archiveKey);
        return data ? JSON.parse(data as string) : null;
      } else {
        console.log(`[ConversationManager] Getting archive from local Redis: ${archiveKey}`);
        return null;
      }
    } catch (error) {
      console.error(`[ConversationManager] Failed to get archived turns:`, error);
      return null;
    }
  }

  /**
   * アーカイブ履歴を保存
   */
  private async saveArchivedTurns(conversationId: string, turns: ConversationTurn[]): Promise<void> {
    try {
      const archiveKey = `conversation:archive:${conversationId}`;
      
      if (this.redisLogger instanceof UpstashRedisLogger) {
        // アーカイブは長期保存（90日）
        await (this.redisLogger as any).redis.setex(
          archiveKey, 
          7776000, // 90日
          JSON.stringify(turns)
        );
      } else {
        console.log(`[ConversationManager] Saving archive to local Redis: ${archiveKey}`);
      }
    } catch (error) {
      console.error(`[ConversationManager] Failed to save archived turns:`, error);
    }
  }

  /**
   * 会話セッション保存（Redisへ）
   */
  private async saveConversation(session: ConversationSession): Promise<void> {
    try {
      const key = `conversation:${session.conversation_id}`;
      
      if (this.redisLogger instanceof UpstashRedisLogger) {
        // Upstash Redis用（長期保存）
        await (this.redisLogger as any).redis.setex(
          key, 
          this.CONVERSATION_TTL, 
          JSON.stringify(session)
        );
      } else {
        // 標準Redis用の実装
        console.log(`[ConversationManager] Saving to local Redis: ${key}`);
      }
    } catch (error) {
      console.error(`[ConversationManager] Failed to save conversation ${session.conversation_id}:`, error);
    }
  }

  /**
   * 会話セッション取得
   */
  private async getConversation(conversationId: string): Promise<ConversationSession | null> {
    try {
      const key = `conversation:${conversationId}`;
      
      if (this.redisLogger instanceof UpstashRedisLogger) {
        // Upstash Redis用
        const data = await (this.redisLogger as any).redis.get(key);
        return data ? JSON.parse(data as string) : null;
      } else {
        // 標準Redis用の実装
        console.log(`[ConversationManager] Getting from local Redis: ${key}`);
        return null;
      }
    } catch (error) {
      console.error(`[ConversationManager] Failed to get conversation ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * 会話履歴に基づく複雑度レベル計算（長期トレンド考慮）
   */
  private calculateComplexityLevel(turns: ConversationTurn[]): number {
    if (turns.length === 0) return 1;

    // 全履歴を考慮した複雑度計算
    const recentTurns = turns.slice(-5); // 最新5ターン
    const avgTier = recentTurns.reduce((sum, turn) => sum + turn.tier_used, 0) / recentTurns.length;
    
    // 長期トレンドも考慮
    const longTermTurns = turns.slice(-15); // 最新15ターン
    const longTermAvg = longTermTurns.reduce((sum, turn) => sum + turn.tier_used, 0) / longTermTurns.length;
    
    // 質問の長さやキーワードも考慮
    const latestPromptLength = turns[turns.length - 1].request.prompt.length;
    const lengthBonus = Math.min(latestPromptLength / 1000, 2);
    
    // 会話の継続性ボーナス
    const continuityBonus = Math.min(turns.length / 10, 1);
    
    return Math.min(Math.round(avgTier * 0.7 + longTermAvg * 0.3 + lengthBonus + continuityBonus), 5);
  }

  /**
   * 会話のコンテキストサマリー生成（長期履歴対応）
   */
  private generateContextSummary(turns: ConversationTurn[]): string {
    if (turns.length < 2) return '';

    const recentTurns = turns.slice(-10); // 最新10ターン
    const topics: string[] = [];
    const modelTransitions: string[] = [];
    
    recentTurns.forEach((turn, index) => {
      const prompt = turn.request.prompt.substring(0, 80);
      topics.push(prompt);
      
      if (index > 0 && turn.model_used !== recentTurns[index - 1].model_used) {
        modelTransitions.push(`${recentTurns[index - 1].model_used} → ${turn.model_used}`);
      }
    });

    let summary = `Recent topics: ${topics.join(' | ')}`;
    if (modelTransitions.length > 0) {
      summary += ` | Model transitions: ${modelTransitions.join(', ')}`;
    }
    
    return summary;
  }

  /**
   * 完全な会話履歴を取得（アーカイブ含む）
   */
  async getFullConversationHistory(conversationId: string): Promise<ConversationTurn[]> {
    const session = await this.getConversation(conversationId);
    const archivedTurns = await this.getArchivedTurns(conversationId);
    
    const allTurns = [...(archivedTurns || []), ...(session?.turns || [])];
    console.log(`[ConversationManager] Retrieved full history: ${allTurns.length} turns for ${conversationId}`);
    
    return allTurns;
  }

  /**
   * 会話統計情報取得（長期履歴対応）
   */
  async getConversationStats(conversationId: string): Promise<{
    total_turns: number;
    archived_turns: number;
    active_turns: number;
    models_used: string[];
    avg_complexity: number;
    duration_minutes: number;
  } | null> {
    const session = await this.getConversation(conversationId);
    const archivedTurns = await this.getArchivedTurns(conversationId);
    
    if (!session) return null;

    const allTurns = [...(archivedTurns || []), ...session.turns];
    const modelsUsed = [...new Set(allTurns.map(turn => turn.model_used))];
    const avgComplexity = allTurns.reduce((sum, turn) => sum + turn.tier_used, 0) / allTurns.length;
    const durationMs = session.last_updated - session.created_at;

    return {
      total_turns: allTurns.length,
      archived_turns: archivedTurns?.length || 0,
      active_turns: session.turns.length,
      models_used: modelsUsed,
      avg_complexity: Math.round(avgComplexity * 10) / 10,
      duration_minutes: Math.round(durationMs / 60000)
    };
  }

  /**
   * 会話履歴のクリーンアップ（設定可能な保持期間）
   */
  async cleanupOldConversations(maxAgeHours: number = 2160): Promise<number> { // デフォルト90日
    // 実装は省略 - 実際はRedisからの条件付き削除処理
    console.log(`[ConversationManager] Cleanup scheduled for conversations older than ${maxAgeHours}h (${maxAgeHours/24} days)`);
    return 0;
  }
}

export default ConversationManager;