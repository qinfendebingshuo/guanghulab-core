import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import type { ExecutionMode, ExecutionPolicy, ExecutionTaskRequest, ExecutionTaskStage, RepositoryTarget } from "@guanghu/contracts";
import { resolveDefaultRepositoryTarget } from "@guanghu/repo-adapters";

export const defaultExecutionPolicy: ExecutionPolicy = {
  maxAttempts: 2,
  allowedCommands: ["pnpm", "node", "tsx"],
  logTailLines: 40,
  eventDebounceMs: Number(process.env.GUANGHU_EXECUTION_EVENT_DEBOUNCE_MS ?? 150),
  taskStateDir: process.env.GUANGHU_EXECUTION_STATE_DIR ?? "/tmp/guanghulab-executor/state",
  tempWorkspaceDir: process.env.GUANGHU_TEMP_WORKSPACE_DIR ?? "/tmp/guanghulab-executor/tmp",
  defaultMode: "github-direct",
  fallbackMode: "workspace-follow-sync",
  stopLossStages: ["failed", "blocked"]
};

export function loadExecutionPolicy(overrides: Partial<ExecutionPolicy> = {}): ExecutionPolicy {
  return {
    ...defaultExecutionPolicy,
    ...overrides,
    allowedCommands: overrides.allowedCommands ?? defaultExecutionPolicy.allowedCommands,
    stopLossStages: overrides.stopLossStages ?? defaultExecutionPolicy.stopLossStages
  };
}

export function createTaskId(): string {
  return `zy-task-${randomUUID()}`;
}

export function createTaskEventId(): string {
  return `zy-event-${randomUUID()}`;
}

export function buildTaskFingerprint(request: ExecutionTaskRequest): string {
  const payload = JSON.stringify({
    intent: request.intent,
    targetPaths: [...request.targetPaths].sort(),
    mode: request.mode ?? defaultExecutionPolicy.defaultMode,
    workspaceRoot: request.workspaceRoot ?? "",
    relativePaths: [...(request.relativePaths ?? [])].sort(),
    writeFiles: (request.writeFiles ?? []).map((file) => ({ path: file.path, action: file.action })),
    verifyCommands: request.verifyCommands ?? [],
    repository: request.repository ?? {},
    workflowName: request.workflowName ?? "event-driven-half-agent"
  });

  return createHash("sha256").update(payload).digest("hex");
}

export function trimCommandOutput(output: string, maxLines: number): string {
  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

export function isAllowedCommand(command: string, policy: ExecutionPolicy): boolean {
  const executable = command.trim().split(/\s+/)[0];
  return policy.allowedCommands.includes(executable);
}

export function shouldBlockTask(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

export function normalizeExecutionMode(mode: ExecutionMode | undefined, policy: ExecutionPolicy): ExecutionMode {
  return mode ?? policy.defaultMode;
}

export function resolveTaskRepository(repository?: Partial<RepositoryTarget>): RepositoryTarget {
  return resolveDefaultRepositoryTarget(repository);
}

export function isTerminalStage(stage: ExecutionTaskStage): boolean {
  return stage === "completed" || stage === "blocked";
}
