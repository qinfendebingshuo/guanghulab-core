import type { ExecutionTask, HalfAgentRole, TaskHalfAgentState, TaskPhaseState } from "@guanghu/contracts";

function createHalf(id: string, role: HalfAgentRole): TaskHalfAgentState {
  return {
    id,
    role,
    status: "sleeping"
  };
}

export function createDefaultTaskPhases(): TaskPhaseState[] {
  return [
    {
      id: "context-restore",
      title: "唤醒与上下文注入",
      status: "pending",
      firstHalf: createHalf("context-loader", "context-loader"),
      secondHalf: createHalf("memory-injector", "memory-injector"),
      nextPhaseId: "execution-delivery"
    },
    {
      id: "execution-delivery",
      title: "开发执行与过程记录",
      status: "pending",
      firstHalf: createHalf("task-executor", "task-executor"),
      secondHalf: createHalf("progress-recorder", "progress-recorder"),
      nextPhaseId: "completion-relay"
    },
    {
      id: "completion-relay",
      title: "合并确认与下个事件释放",
      status: "pending",
      firstHalf: createHalf("merge-guard", "merge-guard"),
      secondHalf: createHalf("next-waker", "next-waker")
    }
  ];
}

export function getPhase(task: ExecutionTask, phaseId: string): TaskPhaseState | undefined {
  return task.phases.find((phase) => phase.id === phaseId);
}

export function getCurrentPhase(task: ExecutionTask): TaskPhaseState | undefined {
  return task.phases.find((phase) => phase.status !== "merged" && phase.status !== "failed");
}

export function getHalfPair(phase: TaskPhaseState, halfId: string): { current: TaskHalfAgentState; counterpart: TaskHalfAgentState } {
  if (phase.firstHalf.id === halfId) {
    return { current: phase.firstHalf, counterpart: phase.secondHalf };
  }

  if (phase.secondHalf.id === halfId) {
    return { current: phase.secondHalf, counterpart: phase.firstHalf };
  }

  throw new Error(`未找到 half agent: ${halfId}`);
}

export function markHalfAwake(
  phase: TaskPhaseState,
  half: TaskHalfAgentState,
  now: string,
  payload?: Record<string, unknown>
): void {
  if (phase.status === "pending") {
    phase.status = "active";
  }

  half.status = "awake";
  half.awakenedAt ??= now;

  if (payload) {
    half.payload = payload;
  }
}

export function markHalfCompleted(
  half: TaskHalfAgentState,
  now: string,
  summary: string,
  payload?: Record<string, unknown>
): void {
  half.status = "completed";
  half.completedAt = now;
  half.summary = summary;

  if (payload) {
    half.payload = payload;
  }
}

export function canMergePhase(phase: TaskPhaseState): boolean {
  return phase.firstHalf.status === "completed" && phase.secondHalf.status === "completed";
}

export function mergeTaskPhase(phase: TaskPhaseState, now: string): void {
  phase.status = "merged";
  phase.mergedAt = now;

  for (const half of [phase.firstHalf, phase.secondHalf]) {
    half.status = "merged";
    half.mergedAt = now;
  }
}

export function listMergedPhaseIds(task: ExecutionTask): string[] {
  return task.phases.filter((phase) => phase.status === "merged").map((phase) => phase.id);
}

export function listPendingPhaseIds(task: ExecutionTask): string[] {
  return task.phases.filter((phase) => phase.status !== "merged").map((phase) => phase.id);
}
