// 協調的コーディング用の型定義

export type DifficultyLevel = 'easy' | 'hard';
export type SubtaskStatus = 'pending' | 'in_progress' | 'review' | 'done' | 'retry' | 'failed';
export type QCDepth = 'quick' | 'full';

export interface Subtask {
  id: string;
  description: string;
  difficulty: DifficultyLevel;
  status: SubtaskStatus;
  result?: CodeResult;
  feedback?: string;
  retryCount: number;
  estimatedLOC?: number;
  language?: string;
  dependencies?: string[];
  metadata?: {
    difficultyScore?: number;
    heuristicScore?: number;
    complexityScore?: number;
    contextScore?: number;
    claudeAnalysis?: any;
  };
}

export interface CodeResult {
  code: string;
  explanation?: string;
  metadata: {
    model_used: string;
    tier_used: number;
    tokens_used: number;
    processing_time_ms: number;
    confidence_score?: number;
    estimated_complexity: number; // 1-10 scale
  };
  tests?: string[];
  documentation?: string;
}

export interface QualityReview {
  passed: boolean;
  score: number; // 0-100
  comments: string;
  issues: QualityIssue[];
  suggestions: string[];
  requiresRevision: boolean;
}

export interface QualityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'syntax' | 'logic' | 'performance' | 'security' | 'style' | 'maintainability';
  description: string;
  line?: number;
  suggestion?: string;
}

export interface DecompositionRequest {
  originalPrompt: string;
  targetLanguage?: string;
  complexityPreference?: 'simple' | 'balanced' | 'comprehensive';
  maxSubtasks?: number;
  context?: string;
}

export interface DecompositionResult {
  subtasks: Subtask[];
  totalEstimatedLOC: number;
  estimatedDifficultyDistribution: {
    easy: number;
    hard: number;
  };
  suggestedApproach: string;
  dependencies: string[];
}

export interface CollaborativeConfig {
  difficultyThreshold: number; // 0-1, proportion of "easy" tasks
  maxRetries: number;
  qcDepth: QCDepth;
  maxSubtasks: number;
  enableParallelProcessing: boolean;
  autoEscalateToClaudeAfterRetries: boolean;
  qualityThresholds: {
    minScore: number;
    requiresReview: number;
  };
}

export interface CodingSession {
  sessionId: string;
  originalRequest: string;
  decomposition: DecompositionResult;
  subtasks: Subtask[];
  progress: {
    completed: number;
    inProgress: number;
    failed: number;
    total: number;
  };
  metrics: {
    totalProcessingTime: number;
    qwen3Usage: number;
    claudeUsage: number;
    totalCost: number;
    qualityScore: number;
  };
  status: 'planning' | 'executing' | 'reviewing' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
}