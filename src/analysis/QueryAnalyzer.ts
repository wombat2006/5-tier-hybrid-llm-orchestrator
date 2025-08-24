/**
 * Claude Code主導の知的クエリ分析システム
 * 
 * 従来の単純キーワードマッチングから、Claude Codeの知見を活用した
 * 多次元的な意図理解・複雑度評価・モデル適性判断システムへの進化
 */

export interface QueryAnalysis {
  // 複雑度評価（5段階）
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';
  
  // 推定処理時間（秒）
  estimatedProcessingTime: number;
  
  // 要求される能力領域
  requiredCapabilities: string[];
  
  // 専門分野
  domain: string[];
  
  // 推論の深さ
  reasoningDepth: 'shallow' | 'moderate' | 'deep';
  
  // 創造性レベル
  creativityLevel: 'factual' | 'analytical' | 'creative' | 'innovative';
  
  // 精度 vs 速度の要求バランス
  priorityBalance: {
    accuracy: number;    // 0-1
    speed: number;       // 0-1  
    cost: number;        // 0-1
  };
  
  // 推定トークン数
  estimatedTokens: {
    input: number;
    output: number;
  };
  
  // 分析信頼度
  confidenceScore: number; // 0-1
  
  // 意図カテゴリ
  intentCategory: 'question' | 'task' | 'creation' | 'analysis' | 'decision';
  
  // 出力品質要求レベル
  qualityRequirement: 'basic' | 'good' | 'high' | 'exceptional';
  
  // 分析根拠
  reasoning: string;
  
  // 🆕 コンテキスト考慮要因
  context_factors?: {
    continuity_bonus: number;
    complexity_escalation: number;
    topic_shift: boolean;
    model_performance_factor: number;
    conversation_turns: number;
    current_complexity_level: number;
  };
}

export interface ModelSuitabilityScore {
  modelId: string;
  suitabilityScore: number; // 0-1
  strengths: string[];
  weaknesses: string[];
  confidence: number;
  reasoning: string;
}

export class ClaudeCodeQueryAnalyzer {
  /**
   * Claude Code自身の知見を活用したクエリ分析
   * 単純なキーワードマッチングを超えた意図理解
   */
  async analyzeQuery(prompt: string, context?: any): Promise<QueryAnalysis> {
    // Claude Codeの分析アルゴリズム
    const analysis = await this.performDeepAnalysis(prompt, context);
    
    return {
      complexity: this.assessComplexity(prompt, context),
      estimatedProcessingTime: this.estimateProcessingTime(prompt),
      requiredCapabilities: this.identifyRequiredCapabilities(prompt),
      domain: this.identifyDomains(prompt),
      reasoningDepth: this.assessReasoningDepth(prompt),
      creativityLevel: this.assessCreativityLevel(prompt),
      priorityBalance: this.analyzePriorityBalance(prompt),
      estimatedTokens: this.estimateTokenUsage(prompt),
      confidenceScore: analysis.confidence,
      intentCategory: this.categorizeIntent(prompt),
      qualityRequirement: this.assessQualityRequirement(prompt),
      reasoning: analysis.reasoning
    };
  }

  /**
   * 複雑度の多次元評価
   * - 概念的複雑さ
   * - 推論の深さ
   * - 専門知識要求度
   * - 創造性要求度
   */
  private assessComplexity(prompt: string, context?: any): QueryAnalysis['complexity'] {
    const indicators = {
      trivial: [
        /^(こんにちは|hello|hi)$/i,
        /^(今日の天気|what time|current time)/i,
        /^(yes|no|はい|いいえ)$/i
      ],
      
      simple: [
        /^(説明|explain|what is|なに|どんな)/i,
        /翻訳|translate|convert/i,
        /簡単な|simple|basic/i
      ],
      
      moderate: [
        /(分析|analysis|compare|比較|evaluate)/i,
        /(実装|implement|create|作成|develop)/i,
        /(設計|design|plan|計画)/i
      ],
      
      complex: [
        /(戦略|strategy|アーキテクチャ|architecture)/i,
        /(最適化|optimization|performance)/i,
        /(複雑|complex|sophisticated|高度)/i,
        /(システム設計|system design|integration)/i
      ],
      
      expert: [
        /(研究|research|論文|paper|学術)/i,
        /(最先端|cutting.?edge|state.?of.?the.?art)/i,
        /(機械学習|machine learning|deep learning|AI)/i,
        /(量子|quantum|暗号|cryptography)/i
      ]
    };

    // 文章長も考慮
    const length = prompt.length;
    const wordCount = prompt.split(/\s+/).length;
    
    // 専門用語密度
    const technicalTerms = [
      'algorithm', 'アルゴリズム', 'framework', 'フレームワーク',
      'methodology', '手法', 'paradigm', 'パラダイム'
    ];
    const technicalDensity = technicalTerms.filter(term => 
      prompt.toLowerCase().includes(term.toLowerCase())
    ).length / wordCount;

    // 多重条件・依存関係の検出
    const conditionalComplexity = (prompt.match(/if|when|もし|場合|条件/gi) || []).length;
    const logicalConnectors = (prompt.match(/and|or|but|however|また|しかし|そして/gi) || []).length;

    // スコア計算
    let complexityScore = 0;
    
    for (const [level, patterns] of Object.entries(indicators)) {
      for (const pattern of patterns) {
        if (pattern.test(prompt)) {
          const levelScores = { trivial: 1, simple: 2, moderate: 3, complex: 4, expert: 5 };
          complexityScore = Math.max(complexityScore, levelScores[level as keyof typeof levelScores]);
        }
      }
    }

    // 追加要因による調整
    if (length > 500) complexityScore += 0.5;
    if (wordCount > 100) complexityScore += 0.5;
    if (technicalDensity > 0.1) complexityScore += 1;
    if (conditionalComplexity > 2) complexityScore += 1;
    if (logicalConnectors > 3) complexityScore += 0.5;

    // 最終判定
    if (complexityScore >= 5) return 'expert';
    if (complexityScore >= 4) return 'complex';
    if (complexityScore >= 3) return 'moderate';
    if (complexityScore >= 2) return 'simple';
    return 'trivial';
  }

  private estimateProcessingTime(prompt: string): number {
    const baseTime = Math.max(5, prompt.length / 100); // 基本処理時間
    const complexity = this.assessComplexity(prompt);
    
    const multipliers = {
      trivial: 1,
      simple: 2,
      moderate: 5,
      complex: 15,
      expert: 30
    };
    
    return baseTime * multipliers[complexity];
  }

  private identifyRequiredCapabilities(prompt: string): string[] {
    const capabilities = [];
    
    const capabilityMap = {
      'coding': /code|コード|プログラム|実装|implement|function|関数/i,
      'analysis': /分析|analysis|examine|研究|investigate/i,
      'creativity': /創造|create|creative|デザイン|design|アイデア/i,
      'reasoning': /推論|logic|論理|思考|reasoning|考察/i,
      'mathematics': /数学|math|計算|calculation|統計|statistics/i,
      'writing': /文章|writing|執筆|document|report|レポート/i,
      'translation': /翻訳|translate|通訳/i,
      'summarization': /要約|summary|まとめ|summarize/i
    };

    for (const [capability, pattern] of Object.entries(capabilityMap)) {
      if (pattern.test(prompt)) {
        capabilities.push(capability);
      }
    }

    return capabilities.length > 0 ? capabilities : ['general_inquiry'];
  }

  private identifyDomains(prompt: string): string[] {
    const domains = [];
    
    const domainMap = {
      'technology': /tech|技術|IT|software|ソフトウェア|computer|コンピュータ/i,
      'science': /科学|science|research|研究|実験|experiment/i,
      'business': /ビジネス|business|経営|management|戦略|strategy/i,
      'education': /教育|education|学習|learning|教える|teach/i,
      'healthcare': /医療|health|医学|medicine|病気|treatment/i,
      'finance': /金融|finance|投資|investment|経済|economics/i,
      'legal': /法律|legal|法的|contract|契約/i,
      'arts': /芸術|art|文学|literature|音楽|music/i
    };

    for (const [domain, pattern] of Object.entries(domainMap)) {
      if (pattern.test(prompt)) {
        domains.push(domain);
      }
    }

    return domains.length > 0 ? domains : ['general'];
  }

  private assessReasoningDepth(prompt: string): QueryAnalysis['reasoningDepth'] {
    const deepReasoningIndicators = [
      /なぜ|why|理由|reason|根拠|evidence/i,
      /どのように|how|方法|method|プロセス|process/i,
      /比較|compare|contrast|違い|difference/i,
      /評価|evaluate|assess|判断|judge/i,
      /予測|predict|forecast|見通し/i
    ];

    const complexReasoningCount = deepReasoningIndicators
      .filter(pattern => pattern.test(prompt)).length;

    if (complexReasoningCount >= 3) return 'deep';
    if (complexReasoningCount >= 1) return 'moderate';
    return 'shallow';
  }

  private assessCreativityLevel(prompt: string): QueryAnalysis['creativityLevel'] {
    const creativeIndicators = [
      /創造|create|creative|アイデア|idea|革新|innovation/i,
      /デザイン|design|構想|concept|想像|imagine/i,
      /新しい|new|novel|独特|unique|オリジナル|original/i
    ];

    const analyticalIndicators = [
      /分析|analysis|examine|調査|research|検証/i,
      /データ|data|統計|statistics|事実|fact/i
    ];

    const hasCreative = creativeIndicators.some(pattern => pattern.test(prompt));
    const hasAnalytical = analyticalIndicators.some(pattern => pattern.test(prompt));

    if (hasCreative && !hasAnalytical) return 'creative';
    if (hasCreative && hasAnalytical) return 'innovative';
    if (hasAnalytical) return 'analytical';
    return 'factual';
  }

  private analyzePriorityBalance(prompt: string): QueryAnalysis['priorityBalance'] {
    // デフォルトバランス
    let accuracy = 0.5;
    let speed = 0.5;
    let cost = 0.5;

    // 精度重視指標
    if (/正確|accurate|precise|詳細|detail|厳密/i.test(prompt)) {
      accuracy += 0.3;
      speed -= 0.1;
    }

    // 速度重視指標
    if (/急ぎ|quick|fast|すぐに|簡単に|briefly/i.test(prompt)) {
      speed += 0.3;
      accuracy -= 0.1;
    }

    // コスト重視指標
    if (/簡単|simple|basic|概要|overview/i.test(prompt)) {
      cost += 0.3;
      accuracy -= 0.1;
    }

    // 正規化
    const total = accuracy + speed + cost;
    return {
      accuracy: Math.max(0, Math.min(1, accuracy / total * 3)),
      speed: Math.max(0, Math.min(1, speed / total * 3)),
      cost: Math.max(0, Math.min(1, cost / total * 3))
    };
  }

  private estimateTokenUsage(prompt: string): QueryAnalysis['estimatedTokens'] {
    const inputTokens = Math.ceil(prompt.length / 4); // 概算: 4文字≈1トークン
    
    const complexity = this.assessComplexity(prompt);
    const outputMultipliers = {
      trivial: 0.5,
      simple: 1,
      moderate: 2,
      complex: 4,
      expert: 8
    };
    
    const outputTokens = Math.ceil(inputTokens * outputMultipliers[complexity]);
    
    return {
      input: inputTokens,
      output: Math.min(outputTokens, 4000) // 最大出力制限
    };
  }

  private categorizeIntent(prompt: string): QueryAnalysis['intentCategory'] {
    if (/\?|？|what|how|why|なに|どう|なぜ/.test(prompt)) return 'question';
    if (/作成|create|作って|make|生成|generate/.test(prompt)) return 'creation';
    if (/分析|analyze|調査|research|検証/.test(prompt)) return 'analysis';
    if (/決定|decide|判断|choose|選択/.test(prompt)) return 'decision';
    return 'task';
  }

  private assessQualityRequirement(prompt: string): QueryAnalysis['qualityRequirement'] {
    if (/最高|best|excellent|完璧|perfect|professional/.test(prompt)) return 'exceptional';
    if (/高品質|high.?quality|詳細|detail|正確|accurate/.test(prompt)) return 'high';
    if (/良い|good|適切|proper|しっかり/.test(prompt)) return 'good';
    return 'basic';
  }

  private async performDeepAnalysis(prompt: string, context?: any): Promise<{confidence: number, reasoning: string}> {
    // ここでClaude Codeの深い分析能力を活用
    // 実際の実装では、より高度な自然言語理解を行う
    
    const confidence = Math.min(0.9, Math.max(0.3, prompt.length / 1000)); // 簡易信頼度
    
    const reasoning = `
    分析要因:
    - 文章長: ${prompt.length}文字
    - 複雑度指標: 多次元評価実施
    - 意図推定: 文脈とパターンから判定
    - 要求品質: 語彙選択から推論
    `.trim();
    
    return { confidence, reasoning };
  }
}

/**
 * 動的モデル適性評価システム
 */
export class ModelSuitabilityAnalyzer {
  /**
   * 各モデルの特性を考慮した適性評価
   */
  evaluateModelForTask(
    analysis: QueryAnalysis, 
    availableModels: any[],
    modelCapabilities: Map<string, any>
  ): ModelSuitabilityScore[] {
    return availableModels.map(model => {
      const score = this.calculateSuitabilityScore(analysis, model, modelCapabilities);
      return {
        modelId: model.id,
        suitabilityScore: score.total,
        strengths: score.strengths,
        weaknesses: score.weaknesses,
        confidence: score.confidence,
        reasoning: score.reasoning
      };
    });
  }

  private calculateSuitabilityScore(
    analysis: QueryAnalysis, 
    model: any, 
    modelCapabilities: Map<string, any>
  ) {
    let totalScore = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    
    // 複雑度マッチング
    const complexityMatch = this.assessComplexityMatch(analysis.complexity, model.tier);
    totalScore += complexityMatch.score;
    if (complexityMatch.score > 0.7) strengths.push('複雑度適合');
    if (complexityMatch.score < 0.3) weaknesses.push('複雑度不適合');

    // 能力マッチング
    const capabilityMatch = this.assessCapabilityMatch(analysis.requiredCapabilities, model.capabilities || []);
    totalScore += capabilityMatch.score;
    strengths.push(...capabilityMatch.strengths);
    weaknesses.push(...capabilityMatch.weaknesses);

    // 速度 vs 品質のバランス
    const balanceMatch = this.assessPriorityBalance(analysis.priorityBalance, model);
    totalScore += balanceMatch.score;
    
    // コスト効率性
    const costEfficiency = this.assessCostEfficiency(analysis.estimatedTokens, model.cost_per_1k_tokens);
    totalScore += costEfficiency.score;

    const finalScore = totalScore / 4; // 正規化

    return {
      total: finalScore,
      strengths,
      weaknesses,
      confidence: 0.8, // 評価信頼度
      reasoning: `複雑度:${complexityMatch.score.toFixed(2)}, 能力:${capabilityMatch.score.toFixed(2)}, バランス:${balanceMatch.score.toFixed(2)}, コスト:${costEfficiency.score.toFixed(2)}`
    };
  }

  private assessComplexityMatch(complexity: string, tier: number) {
    const complexityTierMap = {
      'trivial': [0, 1],
      'simple': [0, 1, 2],  
      'moderate': [1, 2],
      'complex': [0, 2, 3],
      'expert': [2, 3, 4]
    };
    
    const suitableTiers = complexityTierMap[complexity as keyof typeof complexityTierMap] || [1];
    const isMatch = suitableTiers.includes(tier);
    
    return {
      score: isMatch ? 1.0 : Math.max(0, 1 - Math.abs(tier - suitableTiers[0]) * 0.3)
    };
  }

  private assessCapabilityMatch(requiredCaps: string[], modelCaps: string[]) {
    if (requiredCaps.length === 0) return { score: 0.5, strengths: [], weaknesses: [] };
    
    const matches = requiredCaps.filter(cap => 
      modelCaps.some(modelCap => 
        modelCap.toLowerCase().includes(cap.toLowerCase()) ||
        cap.toLowerCase().includes(modelCap.toLowerCase())
      )
    );
    
    const score = matches.length / requiredCaps.length;
    const strengths = matches.map(cap => `${cap}能力適合`);
    const weaknesses = requiredCaps.filter(cap => !matches.includes(cap)).map(cap => `${cap}能力不足`);
    
    return { score, strengths, weaknesses };
  }

  private assessPriorityBalance(balance: QueryAnalysis['priorityBalance'], model: any) {
    // モデルの特性に基づく評価（簡略版）
    const modelCharacteristics = {
      accuracy: model.tier >= 2 ? 0.8 : 0.5,
      speed: model.latency_ms < 1000 ? 0.8 : 0.3,
      cost: (model.cost_per_1k_tokens?.input || 1) < 1 ? 0.8 : 0.3
    };

    const matchScore = 
      Math.abs(balance.accuracy - modelCharacteristics.accuracy) +
      Math.abs(balance.speed - modelCharacteristics.speed) +
      Math.abs(balance.cost - modelCharacteristics.cost);
    
    return { score: Math.max(0, 1 - matchScore / 3) };
  }

  private assessCostEfficiency(tokens: QueryAnalysis['estimatedTokens'], pricing: any) {
    if (!pricing) return { score: 0.5 };
    
    const estimatedCost = 
      (tokens.input * (pricing.input || 0) / 1000) +
      (tokens.output * (pricing.output || 0) / 1000);
    
    // コスト効率スコア（低コストほど高スコア）
    const score = Math.max(0, 1 - Math.min(estimatedCost / 10, 1));
    return { score };
  }
}