export type ModuleRuntime = 'base-shell-plugin';
export type RepositoryProvider = 'github' | 'tencent-cn-repo';
export type RepositoryMutationAction = 'upsert' | 'delete';
export type ExecutionMode = 'github-direct' | 'workspace-follow-sync';
export type ExecutionTaskStage = 'queued' | 'awakened' | 'executing' | 'merging' | 'completed' | 'failed' | 'blocked';
export type ExecutionOutcome = 'success' | 'failed' | 'blocked' | 'in_progress';
export type HalfAgentRole =
  | 'context-loader'
  | 'memory-injector'
  | 'task-executor'
  | 'progress-recorder'
  | 'merge-guard'
  | 'next-waker';
export type HalfAgentStatus = 'sleeping' | 'awake' | 'completed' | 'merged' | 'failed';
export type TaskPhaseStatus = 'pending' | 'active' | 'merged' | 'failed';
export type ExecutionEventType =
  | 'task.created'
  | 'half.awakened'
  | 'half.completed'
  | 'phase.merged'
  | 'task.completed'
  | 'task.failed';

export interface ModuleManifest {
  id: string;
  version: string;
  displayName: string;
  runtime: ModuleRuntime;
  installEntry: string;
  healthCheckPath: string;
  dataScopePrefix: string;
  cnMirrorEligible: boolean;
}

export interface RepositoryTarget {
  provider: RepositoryProvider;
  repository: string;
  branch: string;
  basePath?: string;
}

export interface RepositoryReadResult {
  provider: RepositoryProvider;
  repository: string;
  branch: string;
  path: string;
  content: string;
  sha?: string;
}

export interface RepositoryFileMutation {
  path: string;
  action: RepositoryMutationAction;
  content?: string;
}

export interface RepositoryCommitSummary {
  title: string;
  body?: string;
  actor?: string;
  taskId?: string;
  mode?: ExecutionMode;
}

export interface RepositoryWriteResult {
  provider: RepositoryProvider;
  repository: string;
  branch: string;
  commitSha?: string;
  changedPaths: string[];
}

export interface RepositorySyncPlan {
  sourceRoot: string;
  relativePaths: string[];
  summary: RepositoryCommitSummary;
}

export interface RepositoryAdapter {
  provider: RepositoryProvider;
  exportModuleBundle(moduleId: string, version: string): Promise<string>;
  syncModuleCode(moduleId: string, version: string): Promise<void>;
  publishRegistry(): Promise<void>;
  readTextFile(path: string): Promise<RepositoryReadResult>;
  writeFilesBatch(files: RepositoryFileMutation[], summary: RepositoryCommitSummary): Promise<RepositoryWriteResult>;
  syncWorkspace(plan: RepositorySyncPlan): Promise<RepositoryWriteResult>;
}

export interface SecretCatalogEntry {
  id: string;
  category: 'ssh' | 'api' | 'dns' | 'repo';
  purpose: string;
  path: string;
  status: 'pending_fill' | 'ready' | 'rotated';
}

export interface SecretLocatorConfig {
  platform: 'darwin';
  baseDir: string;
  indexFile: string;
}

export interface StorageBindingRecord {
  moduleId: string;
  userId: string;
  prefix: string;
  indexKey: string;
  version: string;
}

export interface RuntimeHealth {
  status: 'ok' | 'degraded' | 'error';
  message: string;
}

export interface ExecutionPolicy {
  maxAttempts: number;
  allowedCommands: string[];
  logTailLines: number;
  eventDebounceMs: number;
  taskStateDir: string;
  tempWorkspaceDir: string;
  defaultMode: ExecutionMode;
  fallbackMode: ExecutionMode;
  stopLossStages: ExecutionTaskStage[];
}

export interface ExecutionTaskRequest {
  intent: string;
  targetPaths: string[];
  mode?: ExecutionMode;
  workspaceRoot?: string;
  relativePaths?: string[];
  writeFiles?: RepositoryFileMutation[];
  verifyCommands?: string[];
  commitSummary?: Partial<RepositoryCommitSummary>;
  repository?: Partial<RepositoryTarget>;
  workflowName?: 'event-driven-half-agent';
}

export interface TaskHalfAgentState {
  id: string;
  role: HalfAgentRole;
  status: HalfAgentStatus;
  awakenedAt?: string;
  completedAt?: string;
  mergedAt?: string;
  summary?: string;
  payload?: Record<string, unknown>;
}

export interface TaskPhaseState {
  id: string;
  title: string;
  status: TaskPhaseStatus;
  firstHalf: TaskHalfAgentState;
  secondHalf: TaskHalfAgentState;
  nextPhaseId?: string;
  mergedAt?: string;
}

export interface ExecutionTaskEvent {
  id: string;
  taskId: string;
  type: ExecutionEventType;
  createdAt: string;
  phaseId?: string;
  halfId?: string;
  payload?: Record<string, unknown>;
}

export interface ExecutionResultSummary {
  taskId: string;
  stage: ExecutionTaskStage;
  outcome: ExecutionOutcome;
  message: string;
  nextAction: string;
  stopLossTriggered: boolean;
  changedFiles: string[];
  verificationLogs: string[];
  mergedPhases: string[];
  pendingPhases: string[];
  activePhase?: string;
  commitSha?: string;
}

export interface ExecutionTask {
  id: string;
  fingerprint: string;
  intent: string;
  workflowName: 'event-driven-half-agent';
  mode: ExecutionMode;
  targetPaths: string[];
  workspaceRoot?: string;
  relativePaths: string[];
  writeFiles: RepositoryFileMutation[];
  verifyCommands: string[];
  repository: RepositoryTarget;
  commitSummary: RepositoryCommitSummary;
  attempts: number;
  maxAttempts: number;
  stage: ExecutionTaskStage;
  phases: TaskPhaseState[];
  createdAt: string;
  updatedAt: string;
  eventCursor?: string;
  lastEventType?: ExecutionEventType;
  lastError?: string;
  summary?: ExecutionResultSummary;
}
