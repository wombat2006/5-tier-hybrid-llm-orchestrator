const { LLMOrchestrator } = require('./dist/orchestrator/LLMOrchestrator');

async function testCollaborativeCoding() {
  console.log('🧪 Testing Collaborative Coding Flow...\n');
  
  const orchestrator = new LLMOrchestrator();
  
  // 協調フロー用のテストリクエスト
  const testRequest = {
    originalPrompt: "Create a TypeScript class for user authentication with JWT tokens. Include login, logout, and token validation methods. Add proper error handling and integrate with Express.js middleware.",
    targetLanguage: 'typescript',
    complexityPreference: 'balanced',
    maxSubtasks: 5,
    context: 'Building an authentication system for a web application'
  };

  try {
    console.log('Starting collaborative coding session...');
    const session = await orchestrator.processCollaborativeCoding(testRequest);
    
    console.log('\n🎉 Collaborative Coding Session Results:');
    console.log(`Session ID: ${session.sessionId}`);
    console.log(`Status: ${session.status}`);
    console.log(`Subtasks: ${session.progress.completed}/${session.progress.total} completed`);
    console.log(`Cost: $${session.metrics.totalCost.toFixed(4)}`);
    console.log(`Quality Score: ${session.metrics.qualityScore.toFixed(1)}/100`);
    console.log(`Qwen3 Usage: ${session.metrics.qwen3Usage} tasks`);
    console.log(`Claude Usage: ${session.metrics.claudeUsage} tasks`);
    
    console.log('\n📋 Subtask Details:');
    session.subtasks.forEach((task, index) => {
      console.log(`${index + 1}. [${task.status.toUpperCase()}] ${task.description} (${task.difficulty})`);
      if (task.result) {
        console.log(`   Code: ${task.result.code.substring(0, 100)}...`);
      }
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCollaborativeCoding();