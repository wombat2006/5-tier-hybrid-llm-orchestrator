import { Subtask, DifficultyLevel, CollaborativeConfig } from '../types/collaborative';

export class DifficultyClassifier {
  private config: CollaborativeConfig;

  constructor(config: CollaborativeConfig) {
    this.config = config;
  }

  async classifyBatch(subtasks: Subtask[]): Promise<Subtask[]> {
    console.log(`[DifficultyClassifier] 🎯 Classifying difficulty for ${subtasks.length} subtasks`);

    try {
      // 各サブタスクの難易度を分析・再評価
      const classifiedTasks = await Promise.all(
        subtasks.map(subtask => this.classifySingle(subtask))
      );

      const stats = this.calculateStats(classifiedTasks);
      console.log(`[DifficultyClassifier] 📊 Classification complete - Easy: ${stats.easy}, Hard: ${stats.hard}`);
      console.log(`[DifficultyClassifier] 🎯 Qwen3 Coder assignment rate: ${(stats.easyPercentage * 100).toFixed(1)}%`);

      return classifiedTasks;
    } catch (error) {
      console.error(`[DifficultyClassifier] ❌ Classification failed:`, error);
      throw new Error(`Difficulty classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async classifySingle(subtask: Subtask): Promise<Subtask> {
    // 複数の指標を組み合わせた難易度判定
    const heuristicScore = this.calculateHeuristicScore(subtask);
    const complexityScore = this.analyzeComplexity(subtask);
    const contextScore = this.analyzeContext(subtask);

    // 重み付き合計スコア（0-100）
    const finalScore = (
      heuristicScore * 0.4 +
      complexityScore * 0.4 +
      contextScore * 0.2
    );

    // Claude Codeによる追加分析（実際の実装では Claude Code API を呼び出し）
    const claudeAnalysis = await this.getClaudeAnalysis(subtask);
    
    // 最終的な難易度決定
    const adjustedScore = this.adjustScoreWithClaudeAnalysis(finalScore, claudeAnalysis);
    const difficulty: DifficultyLevel = adjustedScore < (this.config.difficultyThreshold * 100) ? 'easy' : 'hard';

    console.log(`[DifficultyClassifier] Task "${subtask.id}": Score=${adjustedScore.toFixed(1)}, Difficulty=${difficulty}`);

    return {
      ...subtask,
      difficulty,
      metadata: {
        ...subtask.metadata,
        difficultyScore: adjustedScore,
        heuristicScore,
        complexityScore,
        contextScore,
        claudeAnalysis
      }
    };
  }

  private calculateHeuristicScore(subtask: Subtask): number {
    let score = 0;

    // 推定コード行数による判定
    const loc = subtask.estimatedLOC || 0;
    if (loc < 30) score += 20;
    else if (loc < 100) score += 40;
    else if (loc < 200) score += 60;
    else score += 80;

    // 言語による複雑度調整
    const language = subtask.language?.toLowerCase() || '';
    if (['html', 'css', 'json'].includes(language)) score -= 10;
    else if (['python', 'javascript'].includes(language)) score += 0;
    else if (['typescript', 'java', 'c#'].includes(language)) score += 10;
    else if (['rust', 'go', 'cpp'].includes(language)) score += 15;

    // 依存関係の複雑度
    const dependencyCount = subtask.dependencies?.length || 0;
    score += Math.min(dependencyCount * 5, 20);

    return Math.max(0, Math.min(score, 100));
  }

  private analyzeComplexity(subtask: Subtask): number {
    const description = subtask.description.toLowerCase();
    let score = 30; // ベーススコア

    // キーワードベースの複雑度分析
    const complexKeywords = [
      'algorithm', 'optimization', 'performance', 'security', 'encryption',
      'async', 'concurrent', 'parallel', 'distributed', 'microservice',
      'machine learning', 'ai', 'neural', 'database design', 'architecture',
      'アルゴリズム', '最適化', 'パフォーマンス', 'セキュリティ', '暗号化',
      '非同期', '並行', '分散', 'アーキテクチャ', 'データベース設計'
    ];

    const simpleKeywords = [
      'crud', 'form', 'validation', 'display', 'render', 'show', 'hide',
      'basic', 'simple', 'straightforward', 'standard', 'typical',
      '表示', '非表示', '基本的', 'シンプル', '標準的', 'CRUD'
    ];

    // 複雑なキーワードの検出
    for (const keyword of complexKeywords) {
      if (description.includes(keyword)) {
        score += 15;
      }
    }

    // シンプルなキーワードの検出
    for (const keyword of simpleKeywords) {
      if (description.includes(keyword)) {
        score -= 10;
      }
    }

    // タスクの種類による調整
    if (description.includes('test') || description.includes('テスト')) score -= 15;
    if (description.includes('config') || description.includes('設定')) score -= 10;
    if (description.includes('ui') || description.includes('interface')) score -= 5;
    if (description.includes('api') && description.includes('design')) score += 20;
    if (description.includes('business logic') || description.includes('ビジネスロジック')) score += 25;

    return Math.max(0, Math.min(score, 100));
  }

  private analyzeContext(subtask: Subtask): number {
    let score = 40; // ベーススコア

    // 過去の類似タスクの成功率に基づく調整（実際の実装では履歴データを使用）
    const taskType = this.categorizeTask(subtask);
    const historicalSuccess = this.getHistoricalSuccessRate(taskType);
    
    if (historicalSuccess > 0.8) score -= 20;
    else if (historicalSuccess > 0.6) score -= 10;
    else if (historicalSuccess < 0.4) score += 20;

    return Math.max(0, Math.min(score, 100));
  }

  private categorizeTask(subtask: Subtask): string {
    const desc = subtask.description.toLowerCase();
    
    if (desc.includes('api') || desc.includes('endpoint')) return 'api';
    if (desc.includes('ui') || desc.includes('component')) return 'ui';
    if (desc.includes('database') || desc.includes('data')) return 'data';
    if (desc.includes('test') || desc.includes('spec')) return 'test';
    if (desc.includes('config') || desc.includes('setup')) return 'config';
    if (desc.includes('algorithm') || desc.includes('logic')) return 'algorithm';
    
    return 'general';
  }

  private getHistoricalSuccessRate(taskType: string): number {
    // モック実装：実際はデータベースから取得
    const mockRates: Record<string, number> = {
      'api': 0.85,
      'ui': 0.75,
      'data': 0.70,
      'test': 0.90,
      'config': 0.95,
      'algorithm': 0.45,
      'general': 0.70
    };
    
    return mockRates[taskType] || 0.70;
  }

  private async getClaudeAnalysis(subtask: Subtask): Promise<any> {
    // 実際の実装では Claude Code API を呼び出し
    // ここではモック分析を返す
    const analysisPrompt = `
以下のコーディングタスクの難易度を分析してください：

タスク: ${subtask.description}
推定LOC: ${subtask.estimatedLOC}
言語: ${subtask.language}
依存関係: ${subtask.dependencies?.join(', ') || 'なし'}

以下の観点から分析し、0-100のスコアで評価してください：
1. 技術的複雑度
2. 実装の難しさ
3. デバッグの困難性
4. メンテナンス性への影響

JSON形式で回答してください：
{
  "technicalComplexity": 数値,
  "implementationDifficulty": 数値, 
  "debuggingDifficulty": 数値,
  "maintenanceImpact": 数値,
  "overallScore": 数値,
  "reasoning": "理由",
  "recommendation": "Qwen3CoderまたはClaudeCode"
}
`;

    // モック分析結果
    const mockAnalysis = {
      technicalComplexity: Math.random() * 40 + 30,
      implementationDifficulty: Math.random() * 50 + 25,
      debuggingDifficulty: Math.random() * 60 + 20,
      maintenanceImpact: Math.random() * 30 + 35,
      overallScore: 0,
      reasoning: `${subtask.description}は標準的な実装パターンに従う${subtask.difficulty === 'easy' ? 'シンプル' : '複雑'}なタスクです。`,
      recommendation: subtask.difficulty === 'easy' ? 'Qwen3Coder' : 'ClaudeCode'
    };

    mockAnalysis.overallScore = (
      mockAnalysis.technicalComplexity +
      mockAnalysis.implementationDifficulty +
      mockAnalysis.debuggingDifficulty +
      mockAnalysis.maintenanceImpact
    ) / 4;

    return mockAnalysis;
  }

  private adjustScoreWithClaudeAnalysis(heuristicScore: number, claudeAnalysis: any): number {
    // Claude分析結果で最終スコアを調整
    const claudeScore = claudeAnalysis.overallScore || heuristicScore;
    
    // 重み付き平均：ヒューリスティック70%、Claude分析30%
    return heuristicScore * 0.7 + claudeScore * 0.3;
  }

  private calculateStats(subtasks: Subtask[]) {
    const easy = subtasks.filter(t => t.difficulty === 'easy').length;
    const hard = subtasks.filter(t => t.difficulty === 'hard').length;
    const total = subtasks.length;
    
    return {
      easy,
      hard,
      total,
      easyPercentage: total > 0 ? easy / total : 0,
      hardPercentage: total > 0 ? hard / total : 0
    };
  }

  // 難易度分類の妥当性を検証
  validateClassification(subtasks: Subtask[]): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const stats = this.calculateStats(subtasks);

    // バランスチェック
    if (stats.easyPercentage > 0.9) {
      warnings.push('タスクの90%以上が「easy」に分類されています。一部を「hard」に調整することを検討してください。');
    }
    
    if (stats.easyPercentage < 0.1) {
      warnings.push('タスクの90%以上が「hard」に分類されています。コスト効率のため一部を「easy」に調整することを検討してください。');
    }

    // 推定LOCと難易度の一貫性チェック
    const inconsistencies = subtasks.filter(task => {
      const loc = task.estimatedLOC || 0;
      return (task.difficulty === 'easy' && loc > 100) || 
             (task.difficulty === 'hard' && loc < 30);
    });

    if (inconsistencies.length > 0) {
      warnings.push(`${inconsistencies.length}個のタスクで推定LOCと難易度に不整合があります。`);
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  }

  // 難易度閾値を動的調整するメソッド
  adjustThresholdBasedOnHistory(recentPerformance: { qwenSuccessRate: number; claudeUtilization: number }) {
    const { qwenSuccessRate, claudeUtilization } = recentPerformance;
    
    let newThreshold = this.config.difficultyThreshold;
    
    // Qwen3の成功率が低い場合は閾値を下げる（more conservative）
    if (qwenSuccessRate < 0.7) {
      newThreshold = Math.max(0.3, newThreshold - 0.1);
    } else if (qwenSuccessRate > 0.9) {
      newThreshold = Math.min(0.8, newThreshold + 0.05);
    }
    
    // Claude Code の利用率が高すぎる場合は閾値を上げる
    if (claudeUtilization > 0.7) {
      newThreshold = Math.min(0.8, newThreshold + 0.05);
    }
    
    if (newThreshold !== this.config.difficultyThreshold) {
      console.log(`[DifficultyClassifier] 🎛️ Adjusting threshold: ${this.config.difficultyThreshold.toFixed(2)} → ${newThreshold.toFixed(2)}`);
      this.config.difficultyThreshold = newThreshold;
    }
  }
}