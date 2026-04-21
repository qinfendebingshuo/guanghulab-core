import { mkdir, readFile, readdir, watch, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExecutionTask, ExecutionTaskEvent } from '@guanghu/contracts';
import { isTerminalStage } from './task-policy.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class FileExecutionTaskStore {
  constructor(private readonly stateDir: string) {}

  private get tasksDir(): string {
    return path.join(this.stateDir, 'tasks');
  }

  private get eventsDir(): string {
    return path.join(this.stateDir, 'events');
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true });
    await mkdir(this.eventsDir, { recursive: true });
  }

  private getTaskFilePath(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.json`);
  }

  private getEventFilePath(eventId: string): string {
    return path.join(this.eventsDir, `${eventId}.json`);
  }

  async saveTask(task: ExecutionTask): Promise<ExecutionTask> {
    await this.ensureReady();
    await writeFile(this.getTaskFilePath(task.id), JSON.stringify(task, null, 2), 'utf8');
    return task;
  }

  async getTask(taskId: string): Promise<ExecutionTask | null> {
    try {
      const raw = await readFile(this.getTaskFilePath(taskId), 'utf8');
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
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const raw = await readFile(path.join(this.tasksDir, entry.name), 'utf8');
          return JSON.parse(raw) as ExecutionTask;
        })
    );

    return tasks.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listActiveTasks(): Promise<ExecutionTask[]> {
    const tasks = await this.listTasks();
    return tasks.filter((task) => !isTerminalStage(task.stage) && task.stage !== 'failed');
  }

  async findReusableTask(fingerprint: string): Promise<ExecutionTask | null> {
    const tasks = await this.listTasks();
    return tasks.find((task) => task.fingerprint === fingerprint && !isTerminalStage(task.stage) && task.stage !== 'failed') ?? null;
  }

  async appendEvent(event: ExecutionTaskEvent): Promise<ExecutionTaskEvent> {
    await this.ensureReady();
    await writeFile(this.getEventFilePath(event.id), JSON.stringify(event, null, 2), 'utf8');
    return event;
  }

  async listEvents(taskId?: string): Promise<ExecutionTaskEvent[]> {
    await this.ensureReady();
    const entries = await readdir(this.eventsDir, { withFileTypes: true });
    const events = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const raw = await readFile(path.join(this.eventsDir, entry.name), 'utf8');
          return JSON.parse(raw) as ExecutionTaskEvent;
        })
    );

    return events
      .filter((event) => (taskId ? event.taskId === taskId : true))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async *watchEvents(options: { signal: AbortSignal; debounceMs: number }): AsyncGenerator<ExecutionTaskEvent> {
    await this.ensureReady();

    for await (const change of watch(this.eventsDir, { signal: options.signal })) {
      const filename = typeof change.filename === 'string' ? change.filename : change.filename?.toString();

      if (!filename || !filename.endsWith('.json')) {
        continue;
      }

      await sleep(options.debounceMs);

      try {
        const raw = await readFile(path.join(this.eventsDir, filename), 'utf8');
        yield JSON.parse(raw) as ExecutionTaskEvent;
      } catch {
        continue;
      }
    }
  }
}
