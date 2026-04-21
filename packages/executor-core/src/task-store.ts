import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionTask } from "@guanghu/contracts";
import { isTerminalStage } from "./task-policy.js";

export class FileExecutionTaskStore {
  constructor(private readonly stateDir: string) {}

  private get tasksDir(): string {
    return path.join(this.stateDir, "tasks");
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true });
  }

  private getTaskFilePath(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.json`);
  }

  async saveTask(task: ExecutionTask): Promise<ExecutionTask> {
    await this.ensureReady();
    await writeFile(this.getTaskFilePath(task.id), JSON.stringify(task, null, 2), "utf8");
    return task;
  }

  async getTask(taskId: string): Promise<ExecutionTask | null> {
    try {
      const raw = await readFile(this.getTaskFilePath(taskId), "utf8");
      return JSON.parse(raw) as ExecutionTask;
    } catch {
      return null;
    }
  }

  async listTasks(): Promise<ExecutionTask[]> {
    await this.ensureReady();
    const entries = await readdir(this.tasksDir, { withFileTypes: true });
    const tasks = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const raw = await readFile(path.join(this.tasksDir, entry.name), "utf8");
          return JSON.parse(raw) as ExecutionTask;
        })
    );

    return tasks.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async findReusableTask(fingerprint: string): Promise<ExecutionTask | null> {
    const tasks = await this.listTasks();
    return (
      tasks.find((task) => task.fingerprint === fingerprint && !isTerminalStage(task.stage) && task.stage !== "failed") ?? null
    );
  }

  async claimNextQueuedTask(): Promise<ExecutionTask | null> {
    const tasks = await this.listTasks();
    const task = tasks.find((item) => item.stage === "queued");

    if (!task) {
      return null;
    }

    task.stage = "running";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    return task;
  }
}
