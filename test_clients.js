const { LLMOrchestrator } = require('./dist/orchestrator/LLMOrchestrator');

console.log('\n🧪 Testing all LLM clients...');

try {
  const orchestrator = new LLMOrchestrator();
  
  console.log('\n📊 Initialized clients verification:');
  const models = orchestrator.getAvailableModels();
  
  // Tier別に分類
  const tierModels = {};
  models.forEach(model => {
    if (!tierModels[model.tier]) tierModels[model.tier] = [];
    tierModels[model.tier].push(model);
  });
  
  for (let tier = 0; tier <= 3; tier++) {
    const tierList = tierModels[tier] || [];
    if (tierList.length > 0) {
      console.log('\nTier ' + tier + ': ' + tierList.length + ' models active');
      tierList.forEach(model => {
        const source = model.api_client === 'UniversalOpenRouterClient' ? '🌐 OpenRouter' : '🔗 Direct API';
        console.log('  ✅ ' + model.id + ' (' + source + ')');
        console.log('     Provider: ' + model.provider + ', Capabilities: ' + model.capabilities.join(', '));
      });
    }
  }
  
  console.log('\n✅ System Status:');
  console.log('  📊 Total active models: ' + models.length);
  console.log('  🌐 OpenRouter models: ' + models.filter(m => m.api_client === 'UniversalOpenRouterClient').length);
  console.log('  🔗 Direct API models: ' + models.filter(m => m.api_client !== 'UniversalOpenRouterClient').length);
  
  // Health check
  console.log('\n🏥 Performing health checks...');
  orchestrator.healthCheck().then(result => {
    console.log('Health check results:');
    Object.entries(result.details).forEach(([modelId, isHealthy]) => {
      console.log('  ' + (isHealthy ? '✅' : '❌') + ' ' + modelId);
    });
    console.log('\nOverall health: ' + (result.healthy ? '✅ Healthy' : '❌ Unhealthy'));
  }).catch(error => {
    console.error('Health check failed:', error.message);
  });
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
}