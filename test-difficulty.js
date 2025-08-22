const { DifficultyClassifier } = require('./dist/pipeline/DifficultyClassifier');

async function testDifficultyClassification() {
  console.log('🎯 === 難易度分類機能詳細テスト ===\n');

  const config = {
    difficultyThreshold: 0.6, // 60%以上easy判定でQwen3に委任
    maxRetries: 2,
    qcDepth: 'full',
    maxSubtasks: 10,
    enableParallelProcessing: true,
    autoEscalateToClaudeAfterRetries: true,
    qualityThresholds: {
      minScore: 70,
      requiresReview: 85
    }
  };

  const classifier = new DifficultyClassifier(config);

  // 様々な複雑度のサブタスクをテスト
  const testSubtasks = [
    {
      id: 'easy_1',
      description: 'Create a simple getter and setter function',
      difficulty: 'easy',
      status: 'pending',
      retryCount: 0,
      estimatedLOC: 15,
      language: 'typescript',
      dependencies: []
    },
    {
      id: 'easy_2',
      description: 'Basic HTML form validation',
      difficulty: 'easy',
      status: 'pending', 
      retryCount: 0,
      estimatedLOC: 25,
      language: 'html',
      dependencies: []
    },
    {
      id: 'medium_1',
      description: 'Implement JWT token authentication middleware',
      difficulty: 'easy',
      status: 'pending',
      retryCount: 0,
      estimatedLOC: 80,
      language: 'typescript',
      dependencies: []
    },
    {
      id: 'hard_1',
      description: 'Implement distributed consistent hashing algorithm with virtual nodes and failover mechanisms',
      difficulty: 'easy',
      status: 'pending',
      retryCount: 0,
      estimatedLOC: 250,
      language: 'typescript',
      dependencies: []
    },
    {
      id: 'hard_2',
      description: 'Design and implement concurrent optimization algorithm for machine learning model training with CUDA acceleration',
      difficulty: 'easy',
      status: 'pending',
      retryCount: 0,
      estimatedLOC: 300,
      language: 'rust',
      dependencies: []
    },
    {
      id: 'hard_3',
      description: 'Build microservices architecture with event sourcing, CQRS pattern, and distributed transaction management',
      difficulty: 'easy',
      status: 'pending',
      retryCount: 0,
      estimatedLOC: 450,
      language: 'typescript',
      dependencies: []
    }
  ];

  console.log('📊 初期設定:');
  console.log(`   難易度閾値: ${config.difficultyThreshold} (${(config.difficultyThreshold * 100).toFixed(0)}%以下でeasy)`);
  console.log(`   テストサブタスク数: ${testSubtasks.length}`);

  try {
    console.log('\n🔍 難易度分類実行中...');
    const classifiedTasks = await classifier.classifyBatch(testSubtasks);
    
    console.log('\n📈 分類結果:');
    classifiedTasks.forEach((task, index) => {
      const metadata = task.metadata || {};
      console.log(`${index + 1}. [${task.difficulty.toUpperCase()}] ${task.id}`);
      console.log(`   📝 説明: ${task.description.substring(0, 80)}...`);
      console.log(`   📏 推定LOC: ${task.estimatedLOC}, 言語: ${task.language}`);
      console.log(`   🎯 スコア: ${(metadata.difficultyScore || 0).toFixed(1)}/100`);
      console.log(`   📊 内訳: ヒューリスティック=${(metadata.heuristicScore || 0).toFixed(1)}, 複雑度=${(metadata.complexityScore || 0).toFixed(1)}, コンテキスト=${(metadata.contextScore || 0).toFixed(1)}`);
      console.log('');
    });

    const stats = classifier.calculateStats(classifiedTasks);
    console.log('📊 統計情報:');
    console.log(`   Easy: ${stats.easy}件 (${(stats.easyPercentage * 100).toFixed(1)}%)`);
    console.log(`   Hard: ${stats.hard}件 (${(stats.hardPercentage * 100).toFixed(1)}%)`);
    console.log(`   Qwen3 Coder割り当て率: ${(stats.easyPercentage * 100).toFixed(1)}%`);

    // 妥当性検証
    const validation = classifier.validateClassification(classifiedTasks);
    console.log('\n🔍 妥当性検証:');
    console.log(`   判定結果: ${validation.isValid ? '✅ 妥当' : '⚠️ 問題あり'}`);
    if (validation.warnings.length > 0) {
      console.log('   警告:');
      validation.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
    }

    // 閾値調整テスト
    console.log('\n🎛️ 閾値調整テスト...');
    
    // より厳しい閾値でテスト
    const strictConfig = { ...config, difficultyThreshold: 0.3 };
    const strictClassifier = new DifficultyClassifier(strictConfig);
    
    console.log(`\n厳しい閾値 (${strictConfig.difficultyThreshold}) でのテスト:`);
    const strictClassified = await strictClassifier.classifyBatch([...testSubtasks]);
    const strictStats = strictClassifier.calculateStats(strictClassified);
    console.log(`   Easy: ${strictStats.easy}件 (${(strictStats.easyPercentage * 100).toFixed(1)}%)`);
    console.log(`   Hard: ${strictStats.hard}件 (${(strictStats.hardPercentage * 100).toFixed(1)}%)`);
    
    // より緩い閾値でテスト
    const relaxedConfig = { ...config, difficultyThreshold: 0.8 };
    const relaxedClassifier = new DifficultyClassifier(relaxedConfig);
    
    console.log(`\n緩い閾値 (${relaxedConfig.difficultyThreshold}) でのテスト:`);
    const relaxedClassified = await relaxedClassifier.classifyBatch([...testSubtasks]);
    const relaxedStats = relaxedClassifier.calculateStats(relaxedClassified);
    console.log(`   Easy: ${relaxedStats.easy}件 (${(relaxedStats.easyPercentage * 100).toFixed(1)}%)`);
    console.log(`   Hard: ${relaxedStats.hard}件 (${(relaxedStats.hardPercentage * 100).toFixed(1)}%)`);

  } catch (error) {
    console.error('❌ 難易度分類テストが失敗:', error.message);
  }

  console.log('\n=========================\n');
}

testDifficultyClassification();