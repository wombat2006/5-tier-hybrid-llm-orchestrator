import { 
  Subtask, 
  CodeResult, 
  QualityReview, 
  QualityIssue, 
  CollaborativeConfig,
  QCDepth 
} from '../types/collaborative';

export class QualityGate {
  private config: CollaborativeConfig;

  constructor(config: CollaborativeConfig) {
    this.config = config;
  }

  async review(subtask: Subtask, result: CodeResult): Promise<QualityReview> {
    console.log(`[QualityGate] 🔍 Reviewing code for task "${subtask.id}" (${result.metadata.model_used})`);

    try {
      // 段階的品質チェック
      const syntaxCheck = await this.checkSyntax(result);
      const logicCheck = await this.checkLogic(subtask, result);
      const styleCheck = await this.checkStyle(result);
      const securityCheck = await this.checkSecurity(result);
      const performanceCheck = await this.checkPerformance(result);

      // Claude Codeによる包括的レビュー（実際の実装では Claude Code API を呼び出し）
      const claudeReview = await this.getClaudeCodeReview(subtask, result);

      // 総合評価の計算
      const overallScore = this.calculateOverallScore([
        syntaxCheck,
        logicCheck, 
        styleCheck,
        securityCheck,
        performanceCheck
      ], claudeReview);

      // 全ての問題を統合
      const allIssues = [
        ...syntaxCheck.issues,
        ...logicCheck.issues,
        ...styleCheck.issues,
        ...securityCheck.issues,
        ...performanceCheck.issues,
        ...(claudeReview.issues || [])
      ];

      // 修正が必要かどうかを判定
      const requiresRevision = this.determineRevisionRequirement(overallScore, allIssues);

      const review: QualityReview = {
        passed: overallScore >= this.config.qualityThresholds.minScore && !requiresRevision,
        score: overallScore,
        comments: this.generateReviewComments(overallScore, allIssues, claudeReview),
        issues: allIssues,
        suggestions: this.generateSuggestions(subtask, result, allIssues),
        requiresRevision
      };

      console.log(`[QualityGate] ${review.passed ? '✅' : '❌'} Review complete - Score: ${overallScore.toFixed(1)}, Issues: ${allIssues.length}`);
      
      return review;
    } catch (error) {
      console.error(`[QualityGate] ❌ Review failed:`, error);
      
      // レビュー失敗時のフォールバック
      return {
        passed: false,
        score: 0,
        comments: `品質レビューが失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
        issues: [{
          severity: 'critical',
          category: 'syntax',
          description: '品質レビューシステムエラー'
        }],
        suggestions: ['手動でのコードレビューを実施してください'],
        requiresRevision: true
      };
    }
  }

  // Standalone code review method for testing purposes
  async reviewCode(code: string, language: string): Promise<{
    overallScore: number;
    issues: QualityIssue[];
    suggestions: string[];
    approved: boolean;
    requiresReview: boolean;
  }> {
    console.log(`[QualityGate] 🔍 Reviewing standalone code (${language})`);

    try {
      // Create mock subtask and result for the existing review logic
      const mockSubtask: Subtask = {
        id: 'standalone-review',
        description: 'Standalone code review',
        difficulty: 'easy',
        status: 'done',
        retryCount: 0,
        estimatedLOC: code.split('\n').length,
        language: language,
        dependencies: []
      };

      const mockResult: CodeResult = {
        code: code,
        metadata: {
          model_used: 'standalone-review',
          tier_used: 0,
          tokens_used: Math.floor(code.length / 4),
          processing_time_ms: 0,
          confidence_score: 0.8,
          estimated_complexity: Math.min(10, Math.max(1, Math.floor(code.split('\n').length / 10)))
        }
      };

      // Use existing review logic
      const review = await this.review(mockSubtask, mockResult);

      return {
        overallScore: review.score,
        issues: review.issues,
        suggestions: review.suggestions,
        approved: review.passed,
        requiresReview: review.requiresRevision
      };

    } catch (error) {
      console.error(`[QualityGate] ❌ Standalone review failed:`, error);
      
      return {
        overallScore: 0,
        issues: [{
          severity: 'critical',
          category: 'syntax',
          description: 'スタンドアロンレビューシステムエラー'
        }],
        suggestions: ['手動でのコードレビューを実施してください'],
        approved: false,
        requiresReview: true
      };
    }
  }

  private async checkSyntax(result: CodeResult): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];
    let score = 100;

    // 基本的な構文チェック（実際の実装では言語固有のlinterを使用）
    const code = result.code;
    
    // JavaScript/TypeScript の基本チェック
    if (result.metadata.model_used.includes('qwen') || code.includes('javascript') || code.includes('typescript')) {
      // セミコロンの不足チェック
      const lines = code.split('\n');
      let missingSemicolons = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length > 0 && 
            !line.endsWith(';') && 
            !line.endsWith('{') && 
            !line.endsWith('}') && 
            !line.startsWith('//') && 
            !line.startsWith('*') &&
            !line.includes('if') &&
            !line.includes('else') &&
            !line.includes('for') &&
            !line.includes('while') &&
            (line.includes('const ') || line.includes('let ') || line.includes('var ') || line.includes('return'))) {
          missingSemicolons++;
          
          if (missingSemicolons <= 3) { // 報告するのは最初の3つまで
            issues.push({
              severity: 'low',
              category: 'syntax',
              description: `セミコロンが不足している可能性があります`,
              line: i + 1,
              suggestion: '行末にセミコロンを追加してください'
            });
          }
        }
      }
      
      score -= Math.min(missingSemicolons * 5, 20);
    }

    // 基本的な括弧バランスチェック
    const brackets = { '(': 0, '[': 0, '{': 0 };
    for (const char of code) {
      if (char === '(') brackets['(']++;
      else if (char === ')') brackets['(']--;
      else if (char === '[') brackets['[']++;
      else if (char === ']') brackets['[']--;
      else if (char === '{') brackets['{']++;
      else if (char === '}') brackets['{']--;
    }

    Object.entries(brackets).forEach(([bracket, count]) => {
      if (count !== 0) {
        issues.push({
          severity: 'high',
          category: 'syntax',
          description: `括弧 "${bracket}" のバランスが取れていません`,
          suggestion: '括弧の対応を確認してください'
        });
        score -= 25;
      }
    });

    return { score: Math.max(0, score), issues };
  }

  private async checkLogic(subtask: Subtask, result: CodeResult): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];
    let score = 100;

    const code = result.code;

    // 要求仕様との整合性チェック
    const requiredElements = this.extractRequiredElements(subtask.description);
    for (const element of requiredElements) {
      if (!code.toLowerCase().includes(element.toLowerCase())) {
        issues.push({
          severity: 'medium',
          category: 'logic',
          description: `要求されている "${element}" が実装に含まれていない可能性があります`,
          suggestion: `${element}の実装を追加または確認してください`
        });
        score -= 15;
      }
    }

    // 基本的なエラーハンドリングの有無
    if (subtask.description.toLowerCase().includes('api') || 
        subtask.description.toLowerCase().includes('async') ||
        subtask.description.toLowerCase().includes('database')) {
      const hasTryCatch = code.includes('try') && code.includes('catch');
      const hasErrorHandling = code.includes('error') || code.includes('Error') || hasTryCatch;
      
      if (!hasErrorHandling) {
        issues.push({
          severity: 'medium',
          category: 'logic',
          description: 'エラーハンドリングが実装されていません',
          suggestion: 'try-catchブロックまたはエラーハンドリングを追加してください'
        });
        score -= 20;
      }
    }

    // 型安全性（TypeScript）
    if (code.includes('typescript') || code.includes(': ') || code.includes('interface ')) {
      const hasAnyType = code.includes(': any');
      if (hasAnyType) {
        issues.push({
          severity: 'low',
          category: 'logic',
          description: 'any型の使用が検出されました',
          suggestion: '具体的な型定義を使用することを推奨します'
        });
        score -= 5;
      }
    }

    return { score: Math.max(0, score), issues };
  }

  private async checkStyle(result: CodeResult): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];
    let score = 100;

    const code = result.code;

    // 命名規則のチェック
    const variablePattern = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    while ((match = variablePattern.exec(code)) !== null) {
      const varName = match[1];
      // キャメルケースでない変数名をチェック
      if (!/^[a-z][a-zA-Z0-9]*$/.test(varName) && varName !== varName.toUpperCase()) {
        issues.push({
          severity: 'low',
          category: 'style',
          description: `変数名 "${varName}" が命名規則に従っていません`,
          suggestion: 'キャメルケースまたは適切な命名規則を使用してください'
        });
        score -= 2;
      }
    }

    // コメントの有無（長いコードの場合）
    const lines = code.split('\n');
    if (lines.length > 20) {
      const commentLines = lines.filter(line => 
        line.trim().startsWith('//') || 
        line.trim().startsWith('/*') || 
        line.trim().startsWith('*')
      );
      
      if (commentLines.length === 0) {
        issues.push({
          severity: 'low',
          category: 'style',
          description: '長いコードにコメントがありません',
          suggestion: '複雑な処理にコメントを追加してください'
        });
        score -= 10;
      }
    }

    // 関数の長さチェック
    const functionMatches = code.match(/function\s+\w+\s*\([^)]*\)\s*{/g) || [];
    if (functionMatches.length > 0 && lines.length / functionMatches.length > 50) {
      issues.push({
        severity: 'medium',
        category: 'style',
        description: '関数が長すぎる可能性があります',
        suggestion: '関数を小さな単位に分割することを検討してください'
      });
      score -= 15;
    }

    return { score: Math.max(0, score), issues };
  }

  private async checkSecurity(result: CodeResult): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];
    let score = 100;

    const code = result.code;

    // 基本的なセキュリティチェック
    const securityPatterns: Array<{pattern: RegExp; severity: 'low' | 'medium' | 'high' | 'critical'; description: string}> = [
      { pattern: /eval\s*\(/, severity: 'critical', description: 'eval()の使用は危険です' },
      { pattern: /innerHTML\s*=/, severity: 'medium', description: 'innerHTML使用時はXSS攻撃に注意してください' },
      { pattern: /document\.write\s*\(/, severity: 'medium', description: 'document.write()の使用は推奨されません' },
      { pattern: /password.*=.*['"][^'"]*['"]/, severity: 'critical', description: 'ハードコードされたパスワードが検出されました' },
      { pattern: /api[_-]?key.*=.*['"][^'"]*['"]/, severity: 'critical', description: 'ハードコードされたAPIキーが検出されました' }
    ];

    securityPatterns.forEach(({ pattern, severity, description }) => {
      if (pattern.test(code)) {
        issues.push({
          severity,
          category: 'security',
          description,
          suggestion: 'セキュリティベストプラクティスに従って修正してください'
        });
        
        switch (severity) {
          case 'critical':
            score -= 30;
            break;
          case 'high':
            score -= 20;
            break;
          case 'medium':
            score -= 15;
            break;
          case 'low':
            score -= 10;
            break;
        }
      }
    });

    // SQL Injection のリスクチェック
    if (code.includes('SELECT') || code.includes('INSERT') || code.includes('UPDATE')) {
      if (code.includes('${') || code.includes('" +')) {
        issues.push({
          severity: 'high',
          category: 'security',
          description: 'SQLインジェクションの脆弱性の可能性があります',
          suggestion: 'パラメータ化クエリまたはORM を使用してください'
        });
        score -= 25;
      }
    }

    return { score: Math.max(0, score), issues };
  }

  private async checkPerformance(result: CodeResult): Promise<{ score: number; issues: QualityIssue[] }> {
    const issues: QualityIssue[] = [];
    let score = 100;

    const code = result.code;

    // 基本的なパフォーマンスチェック
    
    // ループ内でのDOMアクセス
    const domInLoopPattern = /for\s*\([^}]*\{[^}]*document\.|while\s*\([^}]*\{[^}]*document\./g;
    if (domInLoopPattern.test(code)) {
      issues.push({
        severity: 'medium',
        category: 'performance',
        description: 'ループ内でDOM操作が検出されました',
        suggestion: 'DOM操作をループ外に移動するか、DocumentFragmentを使用してください'
      });
      score -= 15;
    }

    // 不要な配列作成
    const unnecessaryArrayPattern = /\.map\s*\([^)]*\)\.map\s*\(/g;
    if (unnecessaryArrayPattern.test(code)) {
      issues.push({
        severity: 'low',
        category: 'performance',
        description: '連続したmap()呼び出しが検出されました',
        suggestion: '単一のmap()呼び出しにまとめることを検討してください'
      });
      score -= 5;
    }

    // メモリリークの可能性
    if (code.includes('setInterval') && !code.includes('clearInterval')) {
      issues.push({
        severity: 'medium',
        category: 'performance',
        description: 'setInterval使用後にclearIntervalが見つかりません',
        suggestion: 'メモリリークを防ぐためclearIntervalを実装してください'
      });
      score -= 15;
    }

    return { score: Math.max(0, score), issues };
  }

  private async getClaudeCodeReview(subtask: Subtask, result: CodeResult): Promise<any> {
    // 実際の実装では Claude Code API を呼び出し
    // ここではモックレビューを返す
    
    const reviewPrompt = `
以下のコードをレビューしてください：

【タスク】: ${subtask.description}
【言語】: ${subtask.language}
【生成モデル】: ${result.metadata.model_used}

【コード】:
\`\`\`${subtask.language}
${result.code}
\`\`\`

以下の観点から評価してください：
1. 要求仕様への適合性
2. コードの正確性
3. 保守性・可読性
4. パフォーマンス
5. セキュリティ

総合スコア（0-100）とともに、具体的な問題点と改善提案をお答えください。
`;

    // モックレビュー結果
    const mockReview = {
      overallScore: Math.random() * 30 + 70, // 70-100の範囲
      strengths: [
        '要求仕様に適合している',
        'コードが読みやすく書かれている',
        '適切なエラーハンドリングがある'
      ],
      weaknesses: [] as string[],
      suggestions: [
        'コメントを追加して可読性を向上させる',
        'テストケースの追加を検討する'
      ],
      issues: [] as QualityIssue[]
    };

    // 生成モデルによる調整
    if (result.metadata.model_used.includes('qwen')) {
      if (Math.random() < 0.3) { // 30%の確率で軽微な問題を追加
        mockReview.weaknesses.push('一部の命名規則が不統一');
        mockReview.issues.push({
          severity: 'low',
          category: 'style',
          description: 'Qwen3生成コードの命名規則確認',
          suggestion: '変数名をより明確にしてください'
        });
        mockReview.overallScore -= 5;
      }
    }

    return mockReview;
  }

  private calculateOverallScore(
    checks: { score: number; issues: QualityIssue[] }[],
    claudeReview: any
  ): number {
    const checkScores = checks.map(check => check.score);
    const averageCheckScore = checkScores.reduce((sum, score) => sum + score, 0) / checkScores.length;
    
    // Claude レビュースコアと機械的チェックスコアの重み付き平均
    const claudeScore = claudeReview.overallScore || averageCheckScore;
    
    return averageCheckScore * 0.6 + claudeScore * 0.4;
  }

  private determineRevisionRequirement(score: number, issues: QualityIssue[]): boolean {
    // 重大な問題がある場合は修正が必要
    const criticalIssues = issues.filter(issue => issue.severity === 'critical');
    if (criticalIssues.length > 0) return true;
    
    // スコアが閾値を下回る場合も修正が必要
    if (score < this.config.qualityThresholds.requiresReview) return true;
    
    // 高severity問題が多い場合
    const highSeverityIssues = issues.filter(issue => 
      issue.severity === 'high' || issue.severity === 'critical'
    );
    if (highSeverityIssues.length >= 3) return true;
    
    return false;
  }

  private generateReviewComments(score: number, issues: QualityIssue[], claudeReview: any): string {
    let comment = `品質スコア: ${score.toFixed(1)}/100\n\n`;
    
    if (issues.length === 0) {
      comment += '✅ コードに問題は検出されませんでした。高品質な実装です。';
    } else {
      comment += `⚠️ ${issues.length}個の問題が検出されました:\n`;
      
      // 重要度別に問題をまとめる
      const criticalIssues = issues.filter(i => i.severity === 'critical');
      const highIssues = issues.filter(i => i.severity === 'high');
      const mediumIssues = issues.filter(i => i.severity === 'medium');
      const lowIssues = issues.filter(i => i.severity === 'low');
      
      if (criticalIssues.length > 0) {
        comment += `\n🚨 Critical (${criticalIssues.length}): ${criticalIssues.map(i => i.description).join(', ')}`;
      }
      if (highIssues.length > 0) {
        comment += `\n🔶 High (${highIssues.length}): ${highIssues.map(i => i.description).join(', ')}`;
      }
      if (mediumIssues.length > 0) {
        comment += `\n🔸 Medium (${mediumIssues.length}): ${mediumIssues.map(i => i.description).join(', ')}`;
      }
      if (lowIssues.length > 0) {
        comment += `\n🔹 Low (${lowIssues.length}): ${lowIssues.slice(0, 3).map(i => i.description).join(', ')}${lowIssues.length > 3 ? '...' : ''}`;
      }
    }
    
    if (claudeReview.strengths?.length > 0) {
      comment += `\n\n✨ 良い点:\n${claudeReview.strengths.map((s: string) => `- ${s}`).join('\n')}`;
    }
    
    return comment;
  }

  private generateSuggestions(subtask: Subtask, result: CodeResult, issues: QualityIssue[]): string[] {
    const suggestions: string[] = [];
    
    // 問題に基づく提案
    const issueCategories = new Set(issues.map(issue => issue.category));
    
    if (issueCategories.has('security')) {
      suggestions.push('セキュリティレビューを実施し、脆弱性を修正してください');
    }
    
    if (issueCategories.has('performance')) {
      suggestions.push('パフォーマンステストを実行し、最適化を検討してください');
    }
    
    if (issueCategories.has('syntax')) {
      suggestions.push('Linterを実行し、構文エラーを修正してください');
    }
    
    if (issueCategories.has('style')) {
      suggestions.push('コードフォーマッターを使用して、一貫したスタイルを適用してください');
    }
    
    // タスクの種類に基づく提案
    if (subtask.description.toLowerCase().includes('api')) {
      suggestions.push('APIドキュメントを更新し、適切なHTTPステータスコードを使用してください');
    }
    
    if (subtask.description.toLowerCase().includes('ui')) {
      suggestions.push('アクセシビリティガイドラインに準拠し、レスポンシブデザインを確認してください');
    }
    
    // 生成モデルに基づく提案
    if (result.metadata.model_used.includes('qwen')) {
      suggestions.push('Qwen3生成コードの特性を考慮し、エッジケースのテストを追加してください');
    }
    
    return suggestions.length > 0 ? suggestions : ['コードの品質を維持し、定期的なレビューを継続してください'];
  }

  private extractRequiredElements(description: string): string[] {
    const elements: string[] = [];
    const desc = description.toLowerCase();
    
    // API関連
    if (desc.includes('get') && desc.includes('api')) elements.push('GET');
    if (desc.includes('post') && desc.includes('api')) elements.push('POST');
    if (desc.includes('put') && desc.includes('api')) elements.push('PUT');
    if (desc.includes('delete') && desc.includes('api')) elements.push('DELETE');
    
    // データベース関連
    if (desc.includes('database') || desc.includes('db')) elements.push('database');
    if (desc.includes('query')) elements.push('query');
    
    // UI関連
    if (desc.includes('button')) elements.push('button');
    if (desc.includes('form')) elements.push('form');
    if (desc.includes('input')) elements.push('input');
    
    // 基本的な機能
    if (desc.includes('validation')) elements.push('validation');
    if (desc.includes('error')) elements.push('error');
    if (desc.includes('test')) elements.push('test');
    
    return elements;
  }
}