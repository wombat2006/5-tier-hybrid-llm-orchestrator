import { LLMRequest, ConversationContext, ModelConfig } from '../types';
import { ClaudeCodeQueryAnalyzer, QueryAnalysis } from './QueryAnalyzer';

/**
 * コンテキスト考慮型クエリ分析器
 * 会話履歴を活用してインテリジェントな再ルーティングを実現
 * 
 * 責任範囲:
 * - 会話コンテキストの複雑度分析
 * - エスカレーション判定
 * - トピックシフト検出
 * - モデル性能履歴考慮
 */
export class ContextAwareQueryAnalyzer {
  private baseAnalyzer: ClaudeCodeQueryAnalyzer;
  
  constructor() {
    this.baseAnalyzer = new ClaudeCodeQueryAnalyzer();
  }
  
  /**
   * 会話コンテキストを考慮した高度なクエリ分析
   */
  async analyzeWithContext(
    request: LLMRequest, 
    context?: ConversationContext
  ): Promise<QueryAnalysis> {
    // 基本分析を実行
    const baseAnalysis = await this.baseAnalyzer.analyzeQuery(request.prompt);
    
    if (!context || !context.previous_responses || context.previous_responses.length === 0) {
      console.log('[ContextAwareQueryAnalyzer] No context available, using base analysis');
      return baseAnalysis;
    }

    console.log(`[ContextAwareQueryAnalyzer] Analyzing with context: ${context.turn_count} turns`);
    
    // コンテキスト考慮による分析の調整
    const contextEnhancedAnalysis = this.enhanceAnalysisWithContext(baseAnalysis, context);
    
    return contextEnhancedAnalysis;
  }

  /**
   * 会話履歴を考慮してクエリ分析を強化
   */
  private enhanceAnalysisWithContext(
    baseAnalysis: QueryAnalysis, 
    context: ConversationContext
  ): QueryAnalysis {
    const enhanced = { ...baseAnalysis };
    
    // 1. 会話継続性分析
    const continuityBonus = this.calculateContinuityBonus(context);
    
    // 2. 複雑度エスカレーション検出
    const complexityEscalation = this.detectComplexityEscalation(baseAnalysis, context);
    
    // 3. トピック変化分析
    const topicShift = this.analyzeTopicShift(baseAnalysis, context);
    
    // 4. モデル性能履歴考慮
    const modelPerformanceAdjustment = this.adjustForModelPerformance(context);

    // 分析結果の調整
    enhanced.complexity = Math.min(
      baseAnalysis.complexity + complexityEscalation + continuityBonus, 
      10
    );
    
    enhanced.reasoning_depth = Math.min(
      baseAnalysis.reasoning_depth + (topicShift ? 2 : 0),
      10
    );
    
    enhanced.confidence_score = Math.max(
      baseAnalysis.confidence_score * (1 + modelPerformanceAdjustment),
      0.1
    );

    // コンテキスト情報を分析結果に追加
    enhanced.context_factors = {
      continuity_bonus: continuityBonus,
      complexity_escalation: complexityEscalation,
      topic_shift: topicShift,
      model_performance_factor: modelPerformanceAdjustment,
      conversation_turns: context.turn_count,
      current_complexity_level: context.current_complexity || 1
    };

    console.log(`[ContextAwareQueryAnalyzer] Enhanced analysis - Complexity: ${baseAnalysis.complexity} → ${enhanced.complexity}, Confidence: ${baseAnalysis.confidence_score?.toFixed(2)} → ${enhanced.confidence_score?.toFixed(2)}`);
    
    return enhanced;
  }

  /**
   * 会話継続性ボーナス計算
   */
  private calculateContinuityBonus(context: ConversationContext): number {
    if (!context.turn_count || context.turn_count < 2) return 0;
    
    // 長期会話には複雑度ボーナス
    const turnBonus = Math.min(context.turn_count * 0.1, 1.5);
    
    // コンテキスト情報の豊富さボーナス
    const contextRichness = context.context_summary ? 0.3 : 0;
    
    return turnBonus + contextRichness;
  }

  /**
   * 複雑度エスカレーション検出
   */
  private detectComplexityEscalation(
    currentAnalysis: QueryAnalysis, 
    context: ConversationContext
  ): number {
    if (!context.previous_responses || context.previous_responses.length === 0) return 0;
    
    const recentResponses = context.previous_responses.slice(-3); // 最新3回答
    
    // エスカレーション指示語を検出
    const escalationKeywords = [
      'explain', 'detail', 'elaborate', 'expand', 'deeper', 'advanced', 
      'complex', 'sophisticated', 'analyze', 'prove', 'demonstrate',
      '詳しく', '詳細', '高度', '複雑', '分析', '証明', '説明して',
      'more', 'further', 'why', 'how exactly', 'what if', 'suppose'
    ];

    const hasEscalation = escalationKeywords.some(keyword => 
      currentAnalysis.query.toLowerCase().includes(keyword.toLowerCase())
    );

    // 前回の応答が簡潔だった場合の追加質問検出
    const lastResponse = recentResponses[recentResponses.length - 1];
    const wasSimpleResponse = lastResponse && 
      lastResponse.response_text && 
      lastResponse.response_text.length < 200;

    let escalationBonus = 0;
    
    if (hasEscalation) {
      escalationBonus += 2;
      console.log('[ContextAwareQueryAnalyzer] Detected complexity escalation keywords');
    }
    
    if (wasSimpleResponse && currentAnalysis.query.length > 100) {
      escalationBonus += 1.5;
      console.log('[ContextAwareQueryAnalyzer] Detected follow-up to simple response');
    }

    // 連続する「なぜ」「how」質問の検出
    const questionWords = ['why', 'how', 'what', 'when', 'where', 'なぜ', 'どう', 'どのように'];
    const hasQuestionWords = questionWords.some(word => 
      currentAnalysis.query.toLowerCase().includes(word)
    );
    
    if (hasQuestionWords && recentResponses.length > 1) {
      escalationBonus += 0.5;
    }

    return Math.min(escalationBonus, 3);
  }

  /**
   * トピック変化分析
   */
  private analyzeTopicShift(
    currentAnalysis: QueryAnalysis, 
    context: ConversationContext
  ): boolean {
    if (!context.previous_responses || context.previous_responses.length === 0) return false;
    
    // 簡略化した実装：キーワード比較によるトピック変化検出
    const currentKeywords = this.extractKeywords(currentAnalysis.query);
    
    const recentResponse = context.previous_responses[context.previous_responses.length - 1];
    if (!recentResponse.response_text) return false;
    
    const previousKeywords = this.extractKeywords(recentResponse.response_text);
    
    // 共通キーワードの比率でトピック継続性を判定
    const commonKeywords = currentKeywords.filter(k => previousKeywords.includes(k));
    const continuityRatio = commonKeywords.length / Math.max(currentKeywords.length, 1);
    
    const topicShift = continuityRatio < 0.3;
    
    if (topicShift) {
      console.log('[ContextAwareQueryAnalyzer] Detected topic shift');
    }
    
    return topicShift;
  }

  /**
   * モデル性能履歴を考慮した調整
   */
  private adjustForModelPerformance(context: ConversationContext): number {
    if (!context.previous_responses || context.previous_responses.length === 0) return 0;
    
    const recentResponses = context.previous_responses.slice(-2);
    
    // 前回の応答が不十分だった可能性を検出
    let performanceAdjustment = 0;
    
    recentResponses.forEach(response => {
      // 応答の長さが非常に短い場合
      if (response.response_text && response.response_text.length < 150) {
        performanceAdjustment += 0.1;
      }
      
      // エラーがあった場合
      if (response.error) {
        performanceAdjustment += 0.15;
      }
      
      // 低いTierモデルが使用された場合の段階的向上
      if (response.tier_used !== undefined && response.tier_used < 2) {
        performanceAdjustment += 0.05;
      }
    });

    return Math.min(performanceAdjustment, 0.3);
  }

  /**
   * 会話流れに基づく最適モデル選択アドバイス
   */
  suggestOptimalModelForContext(
    analysis: QueryAnalysis,
    context: ConversationContext,
    availableModels: ModelConfig[]
  ): {
    recommended_model: string;
    reasoning: string;
    confidence: number;
  } {
    const contextFactors = analysis.context_factors || {};
    
    // 複雑度エスカレーションが高い場合は上位モデル推奨
    if (contextFactors.complexity_escalation > 1.5) {
      const premiumModels = availableModels.filter(m => m.tier >= 2);
      if (premiumModels.length > 0) {
        return {
          recommended_model: premiumModels[0].id,
          reasoning: 'High complexity escalation detected in conversation',
          confidence: 0.8
        };
      }
    }
    
    // トピックシフトの場合は適応性の高いモデル推奨
    if (contextFactors.topic_shift) {
      const versatileModels = availableModels.filter(m => 
        m.capabilities.includes('general') && m.tier >= 1
      );
      if (versatileModels.length > 0) {
        return {
          recommended_model: versatileModels[0].id,
          reasoning: 'Topic shift detected, recommending versatile model',
          confidence: 0.7
        };
      }
    }
    
    // デフォルトは分析結果に基づく選択
    return {
      recommended_model: availableModels[0]?.id || 'fallback',
      reasoning: 'Standard analysis-based selection',
      confidence: 0.6
    };
  }

  /**
   * 簡易キーワード抽出
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];
    
    // 簡略化：英数字のみの3文字以上の単語を抽出
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3 && /^[a-z0-9]+$/.test(word));
    
    // 頻度の高い一般的な単語を除外
    const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'has', 'let', 'put', 'say', 'she', 'too', 'use'];
    
    return [...new Set(words.filter(word => !commonWords.includes(word)))].slice(0, 10);
  }
}

export default ContextAwareQueryAnalyzer;