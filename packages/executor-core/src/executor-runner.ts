import { spawn } from "node:child_process";
import process from "node:process";
import type {
  ExecutionPolicy,
  ExecutionResultSummary,
  ExecutionTask,
  ExecutionTaskRequest,
  ExecutionTaskStage,
  RepositoryAdapter,
  RepositoryWriteResult
} from "@guanghu/contracts";
import { createRepositoryAdapters } from "@guanghu/repo-adapters";
import { cleanupTaskWorkspace, createTaskWorkspace, materializeMutations } from "./temp-workspace.js";
import {
  buildTaskFingerprint,
  createTaskId,
  isAllowedCommand,
  loadExecutionPolicy,
  normalizeExecutionMode,
  resolveTaskRepository,
  shouldBlockTask,
  trimCommandOutput
} from "./task-policy.js";
import { FileExecutionTaskStore } from "./task-store.js";

interface ExecutorRunnerOptions {
  policy?: Partial<ExecutionPolicy>;
  taskStore?: FileExecutionTaskStore;
  adapters?: Record<string, RepositoryAdapter>;
}

function buildSummary(task: ExecutionTask, input: Omit<ExecutionResultSummary, "taskId">): ExecutionResultSummary {
  return {
    taskId: task.id,
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
        actor: request.commitSummary?.actor ?? "qiyuan-executor",
        taskId: request.commitSummary?.taskId,
        mode: request.commitSummary?.mode ?? mode
      },
      attempts: 0,
      maxAttempts: this.policy.maxAttempts,
      stage: "queued",
      createdAt: now,
      updatedAt: now
    };

    await this.taskStore.saveTask(task);
    return task;
  }

  async runNextTask(): Promise<ExecutionTask | null> {
    const task = await this.taskStore.claimNextQueuedTask();

    if (!task) {
      return null;
    }

    return this.executeTask(task);
  }

  private getAdapter(task: ExecutionTask): RepositoryAdapter {
    const adapter = this.adapters[task.repository.provider === "github" ? "github" : "cn"];

    if (!adapter) {
      throw new Error(`未找到仓库适配器：${task.repository.provider}`);
    }

    return adapter;
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
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        child.on("error", reject);
        child.on("close", (code) => {
          const merged = [stdout, stderr].filter(Boolean).join("\n");

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

  private async executeTask(task: ExecutionTask): Promise<ExecutionTask> {
    const adapter = this.getAdapter(task);
    let verificationLogs: string[] = [];
    let workspaceDir: string | undefined;
    let writeResult: RepositoryWriteResult | undefined;

    try {
      if (task.mode === "github-direct" && task.verifyCommands.length > 0 && task.writeFiles.length > 0) {
        workspaceDir = await createTaskWorkspace(this.policy.tempWorkspaceDir, task.id);
        await materializeMutations(workspaceDir, task.writeFiles);
        task.stage = "validating";
        task.updatedAt = new Date().toISOString();
        await this.taskStore.saveTask(task);
        verificationLogs = await this.runVerifyCommands(task.verifyCommands, task.workspaceRoot ?? workspaceDir);
      }

      if (task.mode === "workspace-follow-sync") {
        if (!task.workspaceRoot) {
          throw new Error("workspace-follow-sync 模式必须提供 workspaceRoot。");
        }

        if (task.verifyCommands.length > 0) {
          task.stage = "validating";
          task.updatedAt = new Date().toISOString();
          await this.taskStore.saveTask(task);
          verificationLogs = await this.runVerifyCommands(task.verifyCommands, task.workspaceRoot);
        }
      }

      task.stage = "syncing";
      task.updatedAt = new Date().toISOString();
      await this.taskStore.saveTask(task);

      if (task.mode === "github-direct") {
        writeResult = await adapter.writeFilesBatch(task.writeFiles, task.commitSummary);
      } else {
        writeResult = await adapter.syncWorkspace({
          sourceRoot: task.workspaceRoot as string,
          relativePaths: task.relativePaths,
          summary: task.commitSummary
        });
      }

      task.stage = "completed";
      task.updatedAt = new Date().toISOString();
      task.summary = buildSummary(task, {
        stage: "completed",
        outcome: "success",
        message: "任务已完成并写回正式仓库。",
        nextAction: "如需继续开发，请派发下一个任务。",
        stopLossTriggered: false,
        changedFiles: writeResult.changedPaths,
        verificationLogs,
        commitSha: writeResult.commitSha
      });
      await this.taskStore.saveTask(task);
      return task;
    } catch (error) {
      const attempts = task.attempts + 1;
      const blocked = shouldBlockTask(attempts, task.maxAttempts);
      const stage: ExecutionTaskStage = blocked ? "blocked" : "failed";
      const message = error instanceof Error ? error.message : String(error);

      task.attempts = attempts;
      task.stage = stage;
      task.lastError = message;
      task.updatedAt = new Date().toISOString();
      task.summary = buildSummary(task, {
        stage,
        outcome: blocked ? "blocked" : "failed",
        message,
        nextAction: blocked ? "已触发止损，请补充新条件后再重新派发任务。" : "可以在补充最小上下文后重新派发任务。",
        stopLossTriggered: blocked,
        changedFiles: writeResult?.changedPaths ?? [],
        verificationLogs,
        commitSha: writeResult?.commitSha
      });
      await this.taskStore.saveTask(task);
      return task;
    } finally {
      await cleanupTaskWorkspace(workspaceDir);
    }
  }
}
