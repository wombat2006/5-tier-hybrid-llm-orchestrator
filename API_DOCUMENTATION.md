# 🚀 5-Tier Hybrid LLM System API Documentation

## 📋 Overview

The 5-Tier Hybrid LLM System provides a unified API interface for accessing multiple AI models with automatic tier-based routing, cost optimization, and collaborative processing.

**Base URL**: `https://your-domain.com` or `http://localhost:4000`

## 🔐 Authentication

Currently, the API supports basic JWT authentication for secure endpoints (configurable).

```bash
# Example with authentication
curl -H "Authorization: Bearer your-jwt-token" \
     -X POST https://your-domain.com/generate
```

## 📊 System Endpoints

### 1. Health Check
Check system health and model availability.

**GET** `/health`

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-01-20T10:00:00.000Z",
  "details": {
    "legacy_qwen3_coder": true,
    "gpt4o": true,
    "claude_sonnet": false
  }
}
```

### 2. System Information
Get system capabilities and available models.

**GET** `/info`

**Response:**
```json
{
  "success": true,
  "data": {
    "system": "5-Tier Hybrid LLM System",
    "version": "1.0.0",
    "available_models": 2,
    "models_by_tier": {
      "tier0": 1,
      "tier1": 0,
      "tier2": 0,
      "tier3": 1
    },
    "capabilities": [
      "coding", "debugging", "code_review", "refactoring",
      "premium_analysis", "strategic_planning"
    ],
    "providers": ["openrouter", "openai", "anthropic"]
  }
}
```

### 3. Usage Metrics
Monitor system usage and costs.

**GET** `/metrics`

**Response:**
```json
{
  "success": true,
  "data": {
    "requests_per_tier": {"0": 5, "1": 0, "2": 0, "3": 3},
    "success_rate_per_tier": {"0": 1.0, "1": 0, "2": 0, "3": 0.9},
    "average_latency_per_tier": {"0": 450, "1": 0, "2": 0, "3": 1200},
    "cost_per_tier": {"0": 0.05, "1": 0, "2": 0, "3": 1.25},
    "total_monthly_spend": 1.30,
    "budget_utilization_percentage": 1.86,
    "most_used_capabilities": ["coding", "premium_analysis"],
    "error_distribution": {}
  }
}
```

## 🤖 LLM Generation Endpoints

### 4. Main Generation API
Primary endpoint for LLM requests with automatic tier routing.

**POST** `/generate`

**Request Body:**
```json
{
  "prompt": "Write a Python function to calculate fibonacci numbers",
  "task_type": "coding",
  "preferred_tier": 0,
  "user_metadata": {
    "user_id": "user123",
    "session_id": "session456"
  }
}
```

**Parameters:**
- `prompt` (string, required): The input text for the LLM
- `task_type` (string, optional): Task classification
  - Values: `"coding"`, `"general"`, `"complex_analysis"`, `"premium"`, `"auto"`
- `preferred_tier` (number, optional): Force specific tier (0-3)
- `user_metadata` (object, optional): Additional context data

**Response:**
```json
{
  "success": true,
  "model_used": "gpt-4o",
  "tier_used": 3,
  "response": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
  "metadata": {
    "model_id": "gpt-4o",
    "provider": "openai",
    "tokens_used": {"input": 15, "output": 45, "total": 60},
    "generated_at": "2025-01-20T10:00:00.000Z",
    "tier_used": 3,
    "processing_time_ms": 1250,
    "estimated_complexity": 2,
    "cost_info": {
      "total_cost_usd": 0.45,
      "input_cost_usd": 0.0375,
      "output_cost_usd": 0.4125
    },
    "performance_info": {
      "latency_ms": 1250,
      "processing_time_ms": 1250,
      "queue_time_ms": 0,
      "fallback_used": false,
      "tier_escalation": true
    }
  }
}
```

### 5. Code Generation API
Specialized endpoint for coding tasks, forces Tier 0 (Qwen3 Coder).

**POST** `/code`

**Request Body:**
```json
{
  "task": "Create a REST API endpoint for user authentication",
  "language": "python",
  "include_tests": true
}
```

**Parameters:**
- `task` (string, required): Description of the coding task
- `language` (string, optional): Programming language (default: "python")
- `include_tests` (boolean, optional): Include test cases (default: false)

**Response:**
```json
{
  "success": true,
  "code": "from flask import Flask, request, jsonify\n...",
  "language": "python",
  "model_used": "collaborative_pipeline",
  "metadata": {
    "model_id": "collaborative_pipeline",
    "provider": "hybrid",
    "tokens_used": {"input": 25, "output": 150, "total": 175},
    "generated_at": "2025-01-20T10:00:00.000Z",
    "confidence_score": 0.92,
    "session_id": "session_123",
    "subtasks_completed": 3,
    "qwen3_usage": 3,
    "claude_usage": 0
  }
}
```

## 🔍 RAG and Search Endpoints

### 6. RAG Search
Retrieval-Augmented Generation with semantic search.

**POST** `/rag/search`

**Request Body:**
```json
{
  "query": "How to implement authentication in Node.js?",
  "max_results": 5,
  "relevance_threshold": 0.7,
  "context_window_size": 4000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "content": "Authentication implementation guide...",
        "relevance_score": 0.95,
        "source": "docs/auth.md",
        "metadata": {"type": "documentation"}
      }
    ],
    "context_used": 3200,
    "total_results": 5
  },
  "model_used": "vector_search_engine",
  "cost_info": {"total_cost_usd": 0.02},
  "performance_info": {"latency_ms": 450}
}
```

## 🤖 OpenAI Assistant API Integration

### 7. File Search Assistant
Use OpenAI Assistant API for file-based searches.

**POST** `/assistant/file-search`

**Request Body:**
```json
{
  "query": "Find information about user management in the uploaded files",
  "file_paths": ["/docs/user_guide.pdf", "/docs/api_reference.md"],
  "thread_id": "thread_abc123",
  "additional_instructions": "Focus on security considerations"
}
```

**Response:**
```json
{
  "success": true,
  "answer": "Based on the uploaded files, user management involves...",
  "model_used": "gpt-4o",
  "cost_info": {"total_cost_usd": 0.75},
  "performance_info": {"latency_ms": 2500},
  "thread_id": "thread_abc123",
  "files_used": ["/docs/user_guide.pdf"]
}
```

### 8. Code Interpreter
Mathematical calculations and code execution.

**POST** `/assistant/code-interpreter`

**Request Body:**
```json
{
  "query": "Calculate the ROI for a $10,000 investment with 7% annual return over 5 years",
  "code_context": "Consider compound interest",
  "thread_id": "thread_def456"
}
```

**Response:**
```json
{
  "success": true,
  "result": "The ROI calculation shows: Initial: $10,000, Final: $14,025.52, Total ROI: 40.26%",
  "model_used": "gpt-4o",
  "cost_info": {"total_cost_usd": 0.25},
  "performance_info": {"latency_ms": 1800},
  "thread_id": "thread_def456",
  "tools_used": ["code_interpreter"]
}
```

### 9. General Assistant Chat
Multi-purpose conversational AI with file support.

**POST** `/assistant/chat`

**Request Body:**
```json
{
  "message": "Help me understand this error message and suggest a fix",
  "thread_id": "thread_ghi789",
  "assistant_id": "asst_custom123",
  "file_paths": ["/logs/error.log"],
  "additional_instructions": "Provide step-by-step debugging guidance"
}
```

**Response:**
```json
{
  "success": true,
  "message": "I've analyzed your error log. The issue appears to be...",
  "model_used": "gpt-4o",
  "cost_info": {"total_cost_usd": 0.65},
  "performance_info": {"latency_ms": 2200},
  "thread_id": "thread_ghi789",
  "assistant_id": "asst_custom123"
}
```

## 🔧 Administrative Endpoints

### 10. Reset Metrics
Clear usage statistics (development/testing use).

**POST** `/reset-metrics`

**Response:**
```json
{
  "success": true,
  "message": "Metrics reset successfully"
}
```

## 📊 Task Types Reference

| Task Type | Description | Preferred Tier | Use Case |
|-----------|-------------|----------------|----------|
| `coding` | Programming tasks | 0 (Qwen3 Coder) | Code generation, debugging |
| `general` | General inquiries | 1 (Gemini Flash) | Q&A, summaries |
| `complex_analysis` | Deep analysis | 2 (Claude Sonnet) | Research, analysis |
| `premium` | Highest quality | 3 (GPT-4o) | Critical decisions |
| `auto` | Automatic routing | System decides | Let system choose optimal |
| `rag_search` | Vector search | Vector DB | Document retrieval |
| `file_search` | File analysis | Assistant API | Document Q&A |
| `code_interpreter` | Math/Code execution | Assistant API | Calculations |
| `general_assistant` | Multi-purpose chat | Assistant API | Conversational AI |

## 🎯 Model Tiers

| Tier | Models | Cost | Speed | Use Case |
|------|--------|------|-------|----------|
| 0 | Qwen3 Coder | Lowest | Fast | Coding tasks |
| 1 | Gemini Flash | Free/Low | Fastest | General queries |
| 2 | Claude Sonnet | Medium | Medium | Analysis, reasoning |
| 3 | GPT-4o, Claude Opus | Highest | Slower | Premium quality |

## ⚠️ Error Responses

### Common Error Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "provider_error": null,
    "retry_count": 0
  },
  "model_used": "error_handler",
  "tier_used": -1,
  "metadata": {
    "generated_at": "2025-01-20T10:00:00.000Z",
    "tokens_used": {"input": 0, "output": 0, "total": 0}
  }
}
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `COST_LIMIT_EXCEEDED` | Request cost too high | Reduce prompt size or use lower tier |
| `BUDGET_EXCEEDED` | Monthly budget reached | Wait for reset or increase budget |
| `API_KEY_MISSING` | Missing API credentials | Configure environment variables |
| `INVALID_TASK_TYPE` | Unknown task type | Use valid task type from reference |
| `MODEL_UNAVAILABLE` | Model not accessible | Check model configuration |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement request throttling |
| `TIMEOUT` | Request timed out | Reduce prompt complexity |

## 📈 Rate Limits

| Endpoint | Rate Limit | Burst |
|----------|------------|-------|
| `/generate` | 10 req/sec | 20 |
| `/code` | 5 req/sec | 10 |
| `/assistant/*` | 3 req/sec | 5 |
| `/health` | No limit | - |
| `/info` | No limit | - |
| `/metrics` | 1 req/sec | 2 |

## 🔗 SDK and Examples

### cURL Examples

**Basic generation:**
```bash
curl -X POST https://your-domain.com/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing",
    "task_type": "general"
  }'
```

**Code generation with tests:**
```bash
curl -X POST https://your-domain.com/code \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a binary search function",
    "language": "python",
    "include_tests": true
  }'
```

### JavaScript Example

```javascript
const response = await fetch('https://your-domain.com/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    prompt: 'Write a sorting algorithm',
    task_type: 'coding',
    user_metadata: { session_id: 'web-app-123' }
  })
});

const result = await response.json();
console.log(result.response);
```

### Python Example

```python
import requests

response = requests.post('https://your-domain.com/generate', 
  headers={'Content-Type': 'application/json'},
  json={
    'prompt': 'Analyze market trends',
    'task_type': 'complex_analysis',
    'preferred_tier': 2
  }
)

result = response.json()
print(result['response'])
```

---

## 📞 Support

- **Documentation**: Check this API guide
- **Health Status**: Monitor `/health` endpoint
- **Metrics**: Track usage via `/metrics` endpoint
- **Logs**: Check application logs for detailed error information

**API Version**: 1.0.0 | **Status**: Production Ready ✅