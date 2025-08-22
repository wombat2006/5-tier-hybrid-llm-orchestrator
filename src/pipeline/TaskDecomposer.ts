import { 
  Subtask, 
  DecompositionRequest, 
  DecompositionResult, 
  CollaborativeConfig 
} from '../types/collaborative';

export class TaskDecomposer {
  private config: CollaborativeConfig;

  constructor(config: CollaborativeConfig) {
    this.config = config;
  }

  async decompose(request: DecompositionRequest): Promise<DecompositionResult> {
    console.log(`[TaskDecomposer] 🔍 Decomposing task: "${request.originalPrompt.substring(0, 100)}..."`);

    const decompositionPrompt = this.buildDecompositionPrompt(request);
    
    try {
      // Claude Codeに分解を依頼（本来はここで実際のAPIを呼び出し）
      const mockResult = this.generateMockDecomposition(request);
      
      console.log(`[TaskDecomposer] ✅ Task decomposed into ${mockResult.subtasks.length} subtasks`);
      console.log(`[TaskDecomposer] 📊 Estimated LOC: ${mockResult.totalEstimatedLOC}, Easy: ${mockResult.estimatedDifficultyDistribution.easy}, Hard: ${mockResult.estimatedDifficultyDistribution.hard}`);
      
      return mockResult;
    } catch (error) {
      console.error(`[TaskDecomposer] ❌ Decomposition failed:`, error);
      throw new Error(`Task decomposition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildDecompositionPrompt(request: DecompositionRequest): string {
    return `
あなたはソフトウェア開発のタスク分解の専門家です。以下のコーディング依頼を、独立して実行可能な小さなタスクに分解してください。

**元の依頼:**
${request.originalPrompt}

**コンテキスト:**
- 対象言語: ${request.targetLanguage || 'TypeScript/JavaScript'}
- 複雑さの好み: ${request.complexityPreference || 'balanced'}
- 最大分割数: ${request.maxSubtasks || this.config.maxSubtasks}
- 追加コンテキスト: ${request.context || 'なし'}

**分解の指針:**
1. 各サブタスクは独立して実行・テスト可能であること
2. サブタスク間の依存関係を明確にすること
3. 各タスクの難易度レベル（easy/hard）を判定すること
4. 推定コード行数を含めること
5. 実装の順序を考慮すること

**出力形式（JSON）:**
{
  "subtasks": [
    {
      "id": "task_1",
      "description": "具体的なタスク説明",
      "difficulty": "easy|hard",
      "estimatedLOC": 数値,
      "language": "言語名",
      "dependencies": ["依存するタスクID"]
    }
  ],
  "totalEstimatedLOC": 総推定行数,
  "suggestedApproach": "実装アプローチの説明",
  "dependencies": ["外部依存関係"]
}

**難易度判定基準:**
- easy: 基本的なCRUD操作、シンプルなデータ変換、既知のパターンの適用
- hard: 複雑なアルゴリズム、アーキテクチャ設計、パフォーマンス最適化、セキュリティ実装

分解を開始してください。
`;
  }

  private generateMockDecomposition(request: DecompositionRequest): DecompositionResult {
    // 実際の実装では Claude Code API を呼び出すが、ここではモックを生成
    const subtasks: Subtask[] = [];
    const prompt = request.originalPrompt.toLowerCase();
    
    if (prompt.includes('api') || prompt.includes('rest')) {
      subtasks.push(
        {
          id: 'task_1',
          description: 'APIエンドポイントの定義とルーティング設定',
          difficulty: 'easy',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 30,
          language: request.targetLanguage || 'typescript',
          dependencies: []
        },
        {
          id: 'task_2', 
          description: 'データバリデーションとスキーマ定義',
          difficulty: 'easy',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 50,
          language: request.targetLanguage || 'typescript',
          dependencies: []
        },
        {
          id: 'task_3',
          description: 'ビジネスロジックの実装',
          difficulty: 'hard',
          status: 'pending', 
          retryCount: 0,
          estimatedLOC: 100,
          language: request.targetLanguage || 'typescript',
          dependencies: ['task_1', 'task_2']
        },
        {
          id: 'task_4',
          description: 'エラーハンドリングとロギングの実装',
          difficulty: 'easy',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 40,
          language: request.targetLanguage || 'typescript',
          dependencies: ['task_3']
        }
      );
    } else if (prompt.includes('ui') || prompt.includes('component')) {
      subtasks.push(
        {
          id: 'task_1',
          description: 'コンポーネントの基本構造とpropsインターフェース定義',
          difficulty: 'easy',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 40,
          language: 'typescript',
          dependencies: []
        },
        {
          id: 'task_2',
          description: 'スタイリングとレスポンシブデザインの実装',
          difficulty: 'hard',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 80,
          language: 'css',
          dependencies: ['task_1']
        },
        {
          id: 'task_3',
          description: 'インタラクション機能とイベントハンドラーの実装',
          difficulty: 'easy',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 60,
          language: 'typescript',
          dependencies: ['task_1']
        }
      );
    } else {
      // 汎用的な分解
      subtasks.push(
        {
          id: 'task_1',
          description: '基本的な関数・クラス構造の定義',
          difficulty: 'easy',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 50,
          language: request.targetLanguage || 'typescript',
          dependencies: []
        },
        {
          id: 'task_2',
          description: 'メインロジックの実装',
          difficulty: 'hard',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 120,
          language: request.targetLanguage || 'typescript',
          dependencies: ['task_1']
        },
        {
          id: 'task_3',
          description: 'エラーハンドリングとテストケース追加',
          difficulty: 'easy',
          status: 'pending',
          retryCount: 0,
          estimatedLOC: 40,
          language: request.targetLanguage || 'typescript',
          dependencies: ['task_2']
        }
      );
    }

    const totalEstimatedLOC = subtasks.reduce((sum, task) => sum + (task.estimatedLOC || 0), 0);
    const easyCount = subtasks.filter(t => t.difficulty === 'easy').length;
    const hardCount = subtasks.filter(t => t.difficulty === 'hard').length;

    return {
      subtasks,
      totalEstimatedLOC,
      estimatedDifficultyDistribution: {
        easy: easyCount,
        hard: hardCount
      },
      suggestedApproach: this.generateSuggestedApproach(request, subtasks),
      dependencies: this.extractDependencies(request)
    };
  }

  private generateSuggestedApproach(request: DecompositionRequest, subtasks: Subtask[]): string {
    const easyCount = subtasks.filter(t => t.difficulty === 'easy').length;
    const hardCount = subtasks.filter(t => t.difficulty === 'hard').length;
    
    return `
実装アプローチ:
1. 簡単なタスク（${easyCount}個）はQwen3 Coderに委任し、高速・低コストで処理
2. 複雑なタスク（${hardCount}個）はClaude Codeが直接処理し、高品質を確保
3. タスク間の依存関係に従い、順次実行
4. 各タスクの成果物を品質チェック後、統合
5. 全体のコード一貫性とアーキテクチャ整合性を最終確認
`;
  }

  private extractDependencies(request: DecompositionRequest): string[] {
    const dependencies: string[] = [];
    const prompt = request.originalPrompt.toLowerCase();
    
    if (prompt.includes('express') || prompt.includes('fastify')) {
      dependencies.push('Express.js または Fastify');
    }
    if (prompt.includes('react') || prompt.includes('vue')) {
      dependencies.push('React または Vue.js');
    }
    if (prompt.includes('database') || prompt.includes('mongodb') || prompt.includes('postgres')) {
      dependencies.push('データベース（MongoDB, PostgreSQL等）');
    }
    if (prompt.includes('typescript')) {
      dependencies.push('TypeScript');
    }
    
    return dependencies;
  }

  // タスク分解の品質を評価するメソッド
  validateDecomposition(result: DecompositionResult): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // サブタスク数のチェック
    if (result.subtasks.length > this.config.maxSubtasks) {
      issues.push(`サブタスク数が上限（${this.config.maxSubtasks}）を超えています`);
    }
    
    if (result.subtasks.length === 0) {
      issues.push('サブタスクが生成されていません');
    }
    
    // 依存関係の循環チェック
    const hasCycle = this.checkCircularDependencies(result.subtasks);
    if (hasCycle) {
      issues.push('サブタスク間に循環依存があります');
    }
    
    // 難易度分布のチェック
    const { easy, hard } = result.estimatedDifficultyDistribution;
    if (easy === 0 && hard === 0) {
      issues.push('すべてのタスクに難易度が設定されていません');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  private checkCircularDependencies(subtasks: Subtask[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycleDFS = (taskId: string): boolean => {
      if (recursionStack.has(taskId)) return true;
      if (visited.has(taskId)) return false;
      
      visited.add(taskId);
      recursionStack.add(taskId);
      
      const task = subtasks.find(t => t.id === taskId);
      if (task?.dependencies) {
        for (const dep of task.dependencies) {
          if (hasCycleDFS(dep)) return true;
        }
      }
      
      recursionStack.delete(taskId);
      return false;
    };
    
    for (const task of subtasks) {
      if (!visited.has(task.id)) {
        if (hasCycleDFS(task.id)) return true;
      }
    }
    
    return false;
  }
}