const { GeminiAPIClient } = require('./dist/clients/GeminiClient');

async function testGeminiProExp() {
  console.log('=== Gemini 2.5 Pro Exp テスト開始 ===');
  
  // 実験版モデルでテスト
  const client = new GeminiAPIClient('gemini-2.5-pro-002');
  
  try {
    console.log('1. ヘルスチェックテスト');
    const health = await client.isHealthy();
    console.log(`ヘルス状態: ${health ? '✅ OK' : '❌ NG'}`);
    
    console.log('\n2. 複雑推論タスクテスト');
    const complexResponse = await client.generate('複雑なアーキテクチャ設計について説明してください。マイクロサービスとモノリス、どちらがスケーラビリティに優れているか分析してください。', {
      temperature: 0.7,
      max_tokens: 1024
    });
    
    console.log(`成功: ${complexResponse.success}`);
    console.log(`使用モデル: ${complexResponse.model_used}`);
    console.log(`Tier: ${complexResponse.tier_used}`);
    console.log(`コスト: $${complexResponse.cost_info?.total_cost_usd || 0}`);
    console.log(`レスポンス: ${complexResponse.response_text?.substring(0, 200)}...`);
    
    console.log('\n3. フォールバックテスト (無効なモデル名)');
    const fallbackClient = new GeminiAPIClient('gemini-2.5-pro-exp');
    const fallbackResponse = await fallbackClient.generate('簡単なテストクエリです', {
      max_tokens: 50
    });
    
    console.log(`フォールバック成功: ${fallbackResponse.success}`);
    console.log(`フォールバック後モデル: ${fallbackResponse.model_used}`);
    
    console.log('\n4. 統計情報確認');
    const stats = await client.getUsageStats();
    console.log('使用統計:', stats);
    
  } catch (error) {
    console.error('テストエラー:', error);
  }
  
  console.log('\n=== Gemini 2.5 Pro Exp テスト完了 ===');
}

testGeminiProExp();