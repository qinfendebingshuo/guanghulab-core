import { spawn } from 'node:child_process';
import process from 'node:process';
import type {
  ExecutionPolicy,
  ExecutionResultSummary,
  ExecutionTask,
  ExecutionTaskEvent,
  ExecutionTaskRequest,
  ExecutionTaskStage,
  RepositoryAdapter,
  RepositoryWriteResult,
  TaskHalfAgentState,
  TaskPhaseState
} from '@guanghu/contracts';
import { createRepositoryAdapters } from '@guanghu/repo-adapters';
import {
  canMergePhase,
  createDefaultTaskPhases,
  getCurrentPhase,
  getHalfPair,
  getPhase,
  listMergedPhaseIds,
  listPendingPhaseIds,
  markHalfAwake,
  markHalfCompleted,
  mergeTaskPhase
} from './half-agent.js';
import { cleanupTaskWorkspace, createTaskWorkspace, materializeMutations } from './temp-workspace.js';
import {
  buildTaskFingerprint,
  createTaskEventId,
  createTaskId,
  isAllowedCommand,
  loadExecutionPolicy,
  normalizeExecutionMode,
  resolveTaskRepository,
  shouldBlockTask,
  trimCommandOutput
} from './task-policy.js';
import { FileExecutionTaskStore } from './task-store.js';

interface ExecutorRunnerOptions {
  policy?: Partial<ExecutionPolicy>;
  taskStore?: FileExecutionTaskStore;
  adapters?: Record<string, RepositoryAdapter>;
}

interface HalfExecutionResult {
  summary: string;
  payload?: Record<string, unknown>;
  changedFiles?: string[];
  verificationLogs?: string[];
  commitSha?: string;
}

function buildSummary(
  task: ExecutionTask,
  input: Omit<ExecutionResultSummary, 'taskId' | 'mergedPhases' | 'pendingPhases'>
): ExecutionResultSummary {
  return {
    taskId: task.id,
    mergedPhases: listMergedPhaseIds(task),
    pendingPhases: listPendingPhaseIds(task),
    ...input
  };
}

export class ExecutorRunner {
  readonly policy: ExecutionPolicy;
  readonly taskStore: FileExecutionTaskStore;
  private readonly adapters: Record<string, RepositoryAdapter>;

  constructor(options: ExecutorRunnerOptions = {}) {
    this.policy = loadExecutionPolicy(options.policy);
    this.taskStore = options.taskStore ?? new FileExecutionTaskStore(this.policy.taskStateDir);
    this.adapters = options.adapters ?? createRepositoryAdapters();
  }

  async submitTask(request: ExecutionTaskRequest): Promise<ExecutionTask> {
    const fingerprint = buildTaskFingerprint(request);
    const reusable = await this.taskStore.findReusableTask(fingerprint);

    if (reusable) {
      return reusable;
    }

    const now = new Date().toISOString();
    const mode = normalizeExecutionMode(request.mode, this.policy);
    const task: ExecutionTask = {
      id: createTaskId(),
      fingerprint,
      intent: request.intent,
      workflowName: request.workflowName ?? 'event-driven-half-agent',
      mode,
      targetPaths: request.targetPaths,
      workspaceRoot: request.workspaceRoot,
      relativePaths: request.relativePaths ?? request.targetPaths,
      writeFiles: request.writeFiles ?? [],
      verifyCommands: request.verifyCommands ?? [],
      repository: resolveTaskRepository(request.repository),
      commitSummary: {
        title: request.commitSummary?.title ?? request.intent,
        body: request.commitSummary?.body,
        actor: request.commitSummary?.actor ?? 'qiyuan-executor',
        taskId: request.commitSummary?.taskId,
        mode: request.commitSummary?.mode ?? mode
      },
      attempts: 0,
      maxAttempts: this.policy.maxAttempts,
      stage: 'queued',
      phases: createDefaultTaskPhases(),
      createdAt: now,
      updatedAt: now
    };

    await this.taskStore.saveTask(task);
    await this.queueEvent(this.buildEvent(task, 'task.created', { payload: { trigger: 'submitTask' } }));
    return task;
  }

  async resumeActiveTasks(): Promise<void> {
    const tasks = await this.taskStore.listActiveTasks();

    for (const task of tasks) {
      if (task.stage === 'queued') {
        await this.queueEvent(this.buildEvent(task, 'task.created', { payload: { trigger: 'resume' } }));
        continue;
      }

      const phase = getCurrentPhase(task);

      if (!phase) {
        await this.queueEvent(this.buildEvent(task, 'task.completed', { payload: { trigger: 'resume' } }));
        continue;
      }

      if (canMergePhase(phase) && phase.status !== 'merged') {
        await this.queueEvent(this.buildEvent(task, 'phase.merged', { phaseId: phase.id, payload: { trigger: 'resume' } }));
        continue;
      }

      if (phase.firstHalf.status === 'awake') {
        await this.queueEvent(this.buildEvent(task, 'half.awakened', { phaseId: phase.id, halfId: phase.firstHalf.id, payload: { trigger: 'resume' } }));
        continue;
      }

      if (phase.secondHalf.status === 'awake') {
        await this.queueEvent(this.buildEvent(task, 'half.awakened', { phaseId: phase.id, halfId: phase.secondHalf.id, payload: { trigger: 'resume' } }));
        continue;
      }

      if (phase.firstHalf.status === 'sleeping') {
        await this.awakenHalfAndQueue(task, phase, phase.firstHalf, 'resume');
        continue;
      }

      if (phase.firstHalf.status === 'completed' && phase.secondHalf.status === 'sleeping') {
        await this.awakenHalfAndQueue(task, phase, phase.secondHalf, 'resume');
      }
    }
  }

  async handleEvent(event: ExecutionTaskEvent): Promise<ExecutionTask | null> {
    const task = await this.taskStore.getTask(event.taskId);

    if (!task) {
      return null;
    }

    if (task.eventCursor === event.id) {
      return task;
    }

    let followUps: ExecutionTaskEvent[] = [];

    try {
      followUps = await this.dispatchEvent(task, event);
    } catch (error) {
      followUps = this.handleTaskFailure(task, error, event);
    }

    task.eventCursor = event.id;
    task.lastEventType = event.type;
    task.updatedAt = new Date().toISOString();
    await this.taskStore.saveTask(task);

    for (const nextEvent of followUps) {
      await this.queueEvent(nextEvent);
    }

    return task;
  }

  private async dispatchEvent(task: ExecutionTask, event: ExecutionTaskEvent): Promise<ExecutionTaskEvent[]> {
    switch (event.type) {
      case 'task.created':
        return this.onTaskCreated(task);
      case 'half.awakened':
        return this.onHalfAwakened(task, event);
      case 'half.completed':
        return this.onHalfCompleted(task, event);
      case 'phase.merged':
        return this.onPhaseMerged(task, event);
      case 'task.completed':
        return this.onTaskCompleted(task);
      case 'task.failed':
      default:
        return [];
    }
  }

  private async awakenHalfAndQueue(
    task: ExecutionTask,
    phase: TaskPhaseState,
    half: TaskHalfAgentState,
    trigger: string
  ): Promise<void> {
    const nextEvent = this.prepareHalfWake(task, phase, half, trigger);
    task.updatedAt = new Date().toISOString();
    await this.taskStore.saveTask(task);
    await this.queueEvent(nextEvent);
  }

  private prepareHalfWake(
    task: ExecutionTask,
    phase: TaskPhaseState,
    half: TaskHalfAgentState,
    trigger: string
  ): ExecutionTaskEvent {
    const now = new Date().toISOString();
    markHalfAwake(phase, half, now, { trigger });
    task.stage = half.role === 'task-executor' ? 'executing' : 'awakened';
    task.summary = buildSummary(task, {
      stage: task.stage,
      outcome: 'in_progress',
      message: `已唤醒 ${phase.title} 的 ${half.role}。`,
      nextAction: '等待这一半完成，再与另一半合并。',
      stopLossTriggered: false,
      changedFiles: task.summary?.changedFiles ?? [],
      verificationLogs: task.summary?.verificationLogs ?? [],
      commitSha: task.summary?.commitSha,
      activePhase: phase.id
    });

    return this.buildEvent(task, 'half.awakened', {
      phaseId: phase.id,
      halfId: half.id,
      payload: { trigger }
    });
  }

  private buildEvent(
    task: ExecutionTask,
    type: ExecutionTaskEvent['type'],
    options: { phaseId?: string; halfId?: string; payload?: Record<string, unknown> } = {}
  ): ExecutionTaskEvent {
    return {
      id: createTaskEventId(),
      taskId: task.id,
      type,
      createdAt: new Date().toISOString(),
      phaseId: options.phaseId,
      halfId: options.halfId,
      payload: options.payload
    };
  }

  private async queueEvent(event: ExecutionTaskEvent): Promise<void> {
    await this.taskStore.appendEvent(event);
  }

  private async onTaskCreated(task: ExecutionTask): Promise<ExecutionTaskEvent[]> {
    const phase = getCurrentPhase(task);

    if (!phase) {
      return [this.buildEvent(task, 'task.completed', { payload: { trigger: 'task.created.no-pending-phase' } })];
    }

    if (phase.firstHalf.status === 'sleeping') {
      return [this.prepareHalfWake(task, phase, phase.firstHalf, 'task.created')];
    }

    if (phase.firstHalf.status === 'completed' && phase.secondHalf.status === 'sleeping') {
      return [this.prepareHalfWake(task, phase, phase.secondHalf, 'task.created')];
    }

    if (canMergePhase(phase) && phase.status !== 'merged') {
      mergeTaskPhase(phase, new Date().toISOString());
      task.stage = 'merging';
      task.summary = buildSummary(task, {
        stage: 'merging',
        outcome: 'in_progress',
        message: `${phase.title} 的两半已经具备合并条件。`,
        nextAction: '写入 phase.merged 事件，进入下一阶段。',
        stopLossTriggered: false,
        changedFiles: task.summary?.changedFiles ?? [],
        verificationLogs: task.summary?.verificationLogs ?? [],
        commitSha: task.summary?.commitSha,
        activePhase: phase.id
      });

      return [this.buildEvent(task, 'phase.merged', { phaseId: phase.id, payload: { trigger: 'task.created' } })];
    }

    return [];
  }

  private async onHalfAwakened(task: ExecutionTask, event: ExecutionTaskEvent): Promise<ExecutionTaskEvent[]> {
    if (!event.phaseId || !event.halfId) {
      return [];
    }

    const phase = getPhase(task, event.phaseId);

    if (!phase) {
      return [];
    }

    const { current } = getHalfPair(phase, event.halfId);

    if (current.status !== 'awake') {
      return [];
    }

    const result = await this.runHalfAgent(task, phase, current);
    const now = new Date().toISOString();
    markHalfCompleted(current, now, result.summary, result.payload);
    task.stage = phase.id === 'execution-delivery' ? 'merging' : 'awakened';
    task.lastError = undefined;
    task.summary = buildSummary(task, {
      stage: task.stage,
      outcome: 'in_progress',
      message: `${phase.title} 的 ${current.role} 已完成，等待与另一半合并。`,
      nextAction: '等待另一半被唤醒并完成。',
      stopLossTriggered: false,
      changedFiles: result.changedFiles ?? task.summary?.changedFiles ?? [],
      verificationLogs: result.verificationLogs ?? task.summary?.verificationLogs ?? [],
      commitSha: result.commitSha ?? task.summary?.commitSha,
      activePhase: phase.id
    });

    return [this.buildEvent(task, 'half.completed', { phaseId: phase.id, halfId: current.id, payload: result.payload })];
  }

  private async onHalfCompleted(task: ExecutionTask, event: ExecutionTaskEvent): Promise<ExecutionTaskEvent[]> {
    if (!event.phaseId || !event.halfId) {
      return [];
    }

    const phase = getPhase(task, event.phaseId);

    if (!phase) {
      return [];
    }

    const { counterpart } = getHalfPair(phase, event.halfId);

    if (canMergePhase(phase) && phase.status !== 'merged') {
      mergeTaskPhase(phase, new Date().toISOString());
      task.stage = 'merging';
      task.summary = buildSummary(task, {
        stage: 'merging',
        outcome: 'in_progress',
        message: `${phase.title} 的两半已合并。`,
        nextAction: phase.nextPhaseId ? '触发下一阶段的前半 Agent。' : '发布 task.completed 事件。',
        stopLossTriggered: false,
        changedFiles: task.summary?.changedFiles ?? [],
        verificationLogs: task.summary?.verificationLogs ?? [],
        commitSha: task.summary?.commitSha,
        activePhase: phase.id
      });

      return [this.buildEvent(task, 'phase.merged', { phaseId: phase.id, payload: { trigger: 'half.completed' } })];
    }

    if (counterpart.status === 'sleeping') {
      return [this.prepareHalfWake(task, phase, counterpart, 'half.completed')];
    }

    return [];
  }

  private async onPhaseMerged(task: ExecutionTask, event: ExecutionTaskEvent): Promise<ExecutionTaskEvent[]> {
    const phase = event.phaseId ? getPhase(task, event.phaseId) : undefined;
    const nextPhase = phase?.nextPhaseId ? getPhase(task, phase.nextPhaseId) : getCurrentPhase(task);

    if (nextPhase && nextPhase.status !== 'merged') {
      const nextHalf = nextPhase.firstHalf.status === 'sleeping' ? nextPhase.firstHalf : nextPhase.secondHalf.status === 'sleeping' ? nextPhase.secondHalf : undefined;

      if (nextHalf) {
        return [this.prepareHalfWake(task, nextPhase, nextHalf, 'phase.merged')];
      }
    }

    task.stage = 'completed';
    task.summary = buildSummary(task, {
      stage: 'completed',
      outcome: 'success',
      message: '当前任务的所有半 Agent 都已合并完成，任务闭环成立。',
      nextAction: '如需继续任务链，请监听 task.completed 事件并派发下一个任务。',
      stopLossTriggered: false,
      changedFiles: task.summary?.changedFiles ?? [],
      verificationLogs: task.summary?.verificationLogs ?? [],
      commitSha: task.summary?.commitSha,
      activePhase: undefined
    });

    return [this.buildEvent(task, 'task.completed', { phaseId: phase?.id, payload: { trigger: 'phase.merged' } })];
  }

  private async onTaskCompleted(task: ExecutionTask): Promise<ExecutionTaskEvent[]> {
    task.stage = 'completed';
    task.summary = buildSummary(task, {
      stage: 'completed',
      outcome: 'success',
      message: '任务已完成，完整 Agent 已由两半合并而成。',
      nextAction: '可以用 task.completed 作为下一个半 Agent 的唤醒源。',
      stopLossTriggered: false,
      changedFiles: task.summary?.changedFiles ?? [],
      verificationLogs: task.summary?.verificationLogs ?? [],
      commitSha: task.summary?.commitSha,
      activePhase: undefined
    });

    return [];
  }

  private handleTaskFailure(task: ExecutionTask, error: unknown, event: ExecutionTaskEvent): ExecutionTaskEvent[] {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = task.attempts + 1;
    const blocked = shouldBlockTask(attempts, task.maxAttempts);
    const stage: ExecutionTaskStage = blocked ? 'blocked' : 'failed';
    const phase = event.phaseId ? getPhase(task, event.phaseId) : getCurrentPhase(task);

    if (phase) {
      phase.status = 'failed';

      if (event.halfId) {
        try {
          const { current } = getHalfPair(phase, event.halfId);
          current.status = 'failed';
        } catch {
          // ignore invalid half id
        }
      }
    }

    task.attempts = attempts;
    task.stage = stage;
    task.lastError = message;
    task.summary = buildSummary(task, {
      stage,
      outcome: blocked ? 'blocked' : 'failed',
      message,
      nextAction: blocked ? '已触发止损，请补充新条件后重新派发任务。' : '当前任务停在未合并状态，需要人工确认后重新提交。',
      stopLossTriggered: blocked,
      changedFiles: task.summary?.changedFiles ?? [],
      verificationLogs: task.summary?.verificationLogs ?? [],
      commitSha: task.summary?.commitSha,
      activePhase: phase?.id
    });

    return blocked ? [this.buildEvent(task, 'task.failed', { phaseId: phase?.id, halfId: event.halfId, payload: { message } })] : [];
  }

  private getAdapter(task: ExecutionTask): RepositoryAdapter {
    const adapter = this.adapters[task.repository.provider === 'github' ? 'github' : 'cn'];

    if (!adapter) {
      throw new Error(`未找到仓库适配器：${task.repository.provider}`);
    }

    return adapter;
  }

  private buildNoopWriteResult(task: ExecutionTask): RepositoryWriteResult {
    return {
      provider: task.repository.provider,
      repository: task.repository.repository,
      branch: task.repository.branch,
      changedPaths: []
    };
  }

  private async runVerifyCommands(commands: string[], cwd: string): Promise<string[]> {
    const logs: string[] = [];

    for (const command of commands) {
      if (!isAllowedCommand(command, this.policy)) {
        throw new Error(`命令不在白名单中：${command}`);
      }

      const [executable, ...args] = command.trim().split(/\s+/);
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(executable, args, {
          cwd,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        child.on('error', reject);
        child.on('close', (code) => {
          const merged = [stdout, stderr].filter(Boolean).join('\n');

          if (code === 0) {
            resolve(merged);
            return;
          }

          reject(new Error(`命令执行失败：${command}\n${merged}`));
        });
      });

      logs.push(trimCommandOutput(output, this.policy.logTailLines));
    }

    return logs;
  }

  private async runHalfAgent(
    task: ExecutionTask,
    phase: TaskPhaseState,
    half: TaskHalfAgentState
  ): Promise<HalfExecutionResult> {
    switch (half.role) {
      case 'context-loader':
        return {
          summary: '已装载任务意图、目标路径与正式仓库边界。',
          payload: {
            intent: task.intent,
            targetPathCount: task.targetPaths.length,
            repository: task.repository.repository
          }
        };
      case 'memory-injector':
        return {
          summary: '已注入本任务所需的记忆入口、路径映射与编号边界。',
          payload: {
            workflowName: task.workflowName,
            activePhase: phase.id
          }
        };
      case 'task-executor':
        return this.performTaskExecution(task);
      case 'progress-recorder':
        return {
          summary: '已把执行结果收束为过程记录，等待与执行半 Agent 合并。',
          changedFiles: task.summary?.changedFiles ?? [],
          verificationLogs: task.summary?.verificationLogs ?? [],
          commitSha: task.summary?.commitSha,
          payload: {
            changedFileCount: task.summary?.changedFiles.length ?? 0
          }
        };
      case 'merge-guard': {
        const pendingBeforeCompletion = listPendingPhaseIds(task).filter((phaseId) => phaseId !== phase.id);

        if (pendingBeforeCompletion.length > 0) {
          throw new Error(`仍有未合并阶段：${pendingBeforeCompletion.join(', ')}`);
        }

        return {
          summary: '已确认前序阶段全部完成合并，可以执行最终收口。',
          payload: {
            mergedPhases: listMergedPhaseIds(task)
          }
        };
      }
      case 'next-waker':
        return {
          summary: '当前完整任务已经闭环，可把合并事件交给下一个半 Agent。',
          payload: {
            nextEvent: 'task.completed'
          }
        };
      default:
        throw new Error(`未知 half agent 角色：${half.role}`);
    }
  }

  private async performTaskExecution(task: ExecutionTask): Promise<HalfExecutionResult> {
    const adapter = this.getAdapter(task);
    let verificationLogs: string[] = [];
    let workspaceDir: string | undefined;
    let writeResult = this.buildNoopWriteResult(task);

    try {
      if (task.mode === 'github-direct' && task.verifyCommands.length > 0 && task.writeFiles.length > 0) {
        workspaceDir = await createTaskWorkspace(this.policy.tempWorkspaceDir, task.id);
        await materializeMutations(workspaceDir, task.writeFiles);
        verificationLogs = await this.runVerifyCommands(task.verifyCommands, task.workspaceRoot ?? workspaceDir);
      }

      if (task.mode === 'workspace-follow-sync') {
        if (!task.workspaceRoot) {
          throw new Error('workspace-follow-sync 模式必须提供 workspaceRoot。');
        }

        if (task.verifyCommands.length > 0) {
          verificationLogs = await this.runVerifyCommands(task.verifyCommands, task.workspaceRoot);
        }
      }

      if (task.mode === 'github-direct') {
        writeResult = task.writeFiles.length > 0 ? await adapter.writeFilesBatch(task.writeFiles, task.commitSummary) : this.buildNoopWriteResult(task);
      } else {
        writeResult =
          task.relativePaths.length > 0
            ? await adapter.syncWorkspace({
                sourceRoot: task.workspaceRoot as string,
                relativePaths: task.relativePaths,
                summary: task.commitSummary
              })
            : this.buildNoopWriteResult(task);
      }

      task.lastError = undefined;
      task.summary = buildSummary(task, {
        stage: 'executing',
        outcome: 'in_progress',
        message: '核心开发改动已执行并写回正式仓库，等待过程记录半 Agent 与其合并。',
        nextAction: '等待 progress-recorder 半 Agent 完成后进入最终合并。',
        stopLossTriggered: false,
        changedFiles: writeResult.changedPaths,
        verificationLogs,
        commitSha: writeResult.commitSha,
        activePhase: 'execution-delivery'
      });

      return {
        summary: '已完成核心改动执行与正式仓库写回。',
        changedFiles: writeResult.changedPaths,
        verificationLogs,
        commitSha: writeResult.commitSha,
        payload: {
          changedFileCount: writeResult.changedPaths.length
        }
      };
    } finally {
      await cleanupTaskWorkspace(workspaceDir);
    }
  }
}
