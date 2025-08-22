const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testSystem() {
  console.log('🧪 Testing 5-Tier Hybrid LLM System...\n');

  try {
    // 1. ヘルスチェック
    console.log('1. Health Check...');
    const health = await axios.get(`${BASE_URL}/health`);
    console.log(`   Status: ${health.data.success ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`   Details:`, health.data.details);

    // 2. システム情報
    console.log('\n2. System Info...');
    const info = await axios.get(`${BASE_URL}/info`);
    console.log(`   Available Models: ${info.data.data.available_models}`);
    console.log(`   Models by Tier:`, info.data.data.models_by_tier);
    console.log(`   Providers:`, info.data.data.providers);

    // 3. コーディングタスク（Qwen3 Coder優先）
    console.log('\n3. Coding Task (should use Qwen3 Coder - Tier 0)...');
    const codeResponse = await axios.post(`${BASE_URL}/generate`, {
      prompt: 'Pythonでフィボナッチ数列を生成する関数を作成してください',
      task_type: 'coding'
    });
    
    console.log(`   Model Used: ${codeResponse.data.model_used}`);
    console.log(`   Tier Used: ${codeResponse.data.tier_used}`);
    console.log(`   Success: ${codeResponse.data.success}`);
    console.log(`   Cost: $${codeResponse.data.metadata.cost_info.total_cost_usd.toFixed(4)}`);

    // 4. 一般タスク（Gemini Flash優先）
    console.log('\n4. General Task (should use Gemini Flash - Tier 1)...');
    const generalResponse = await axios.post(`${BASE_URL}/generate`, {
      prompt: '人工知能とは何ですか？',
      task_type: 'general'
    });

    console.log(`   Model Used: ${generalResponse.data.model_used}`);
    console.log(`   Tier Used: ${generalResponse.data.tier_used}`);
    console.log(`   Success: ${generalResponse.data.success}`);
    console.log(`   Cost: $${generalResponse.data.metadata.cost_info.total_cost_usd.toFixed(4)}`);

    // 5. コード専用エンドポイント
    console.log('\n5. Code-specific Endpoint...');
    const codeEndpoint = await axios.post(`${BASE_URL}/code`, {
      task: 'FastAPIでHello Worldを作る',
      language: 'python'
    });

    console.log(`   Model Used: ${codeEndpoint.data.model_used}`);
    console.log(`   Success: ${codeEndpoint.data.success}`);
    console.log(`   Response Length: ${codeEndpoint.data.code?.length || 0} chars`);

    // 6. メトリクス確認
    console.log('\n6. System Metrics...');
    const metrics = await axios.get(`${BASE_URL}/metrics`);
    console.log(`   Total Requests by Tier:`, metrics.data.data.requests_per_tier);
    console.log(`   Cost by Tier:`, metrics.data.data.cost_per_tier);
    console.log(`   Budget Utilization: ${metrics.data.data.budget_utilization_percentage.toFixed(2)}%`);

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Connection refused. Make sure the server is running:');
      console.log('   npm run dev');
    } else {
      console.error('❌ Test failed:', error.response?.data || error.message);
    }
  }
}

// 使用方法の表示
function showUsage() {
  console.log('\n💡 Usage Examples:');
  console.log('\n# Start the server first:');
  console.log('npm run dev');
  console.log('\n# Then run tests:');
  console.log('node test.js');
  console.log('\n# Or test individual endpoints:');
  console.log('curl -X POST http://localhost:4000/generate \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"prompt": "Hello Qwen3 Coder!", "task_type": "coding"}\'');
  console.log('\n🚀 Happy coding with 5-Tier Hybrid LLM System!');
}

// メイン実行
if (require.main === module) {
  testSystem().then(() => {
    showUsage();
  });
}

module.exports = { testSystem };