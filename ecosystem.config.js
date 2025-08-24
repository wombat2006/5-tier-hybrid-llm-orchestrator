module.exports = {
  apps: [{
    name: 'llm-orchestrator',
    script: './dist/index.js',
    cwd: '/opt/llm-orchestrator',
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
      HOST: '0.0.0.0',
      // API Keys are loaded from .env file
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      MONTHLY_BUDGET: '70',
      JWT_SECRET: 'production_jwt_secret_advsec_llm_system_2025'
    },
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    log_file: '/home/rocky/.pm2/logs/llm-orchestrator.log',
    out_file: '/home/rocky/.pm2/logs/llm-orchestrator-out.log',
    error_file: '/home/rocky/.pm2/logs/llm-orchestrator-error.log',
    merge_logs: true,
    time: true
  }]
};
