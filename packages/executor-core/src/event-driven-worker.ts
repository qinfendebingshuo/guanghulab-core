import type { ExecutionPolicy } from '@guanghu/contracts';
import { ExecutorRunner } from './executor-runner.js';
import { FileExecutionTaskStore } from './task-store.js';

interface EventDrivenWorkerOptions {
  runner: ExecutorRunner;
  taskStore: FileExecutionTaskStore;
  policy: ExecutionPolicy;
}

export class EventDrivenWorker {
  private readonly abortController = new AbortController();
  private readonly seenEventIds = new Set<string>();

  constructor(private readonly options: EventDrivenWorkerOptions) {}

  async start(): Promise<void> {
    await this.options.taskStore.ensureReady();
    const watchLoop = this.consumeEvents();
    await this.options.runner.resumeActiveTasks();
    await watchLoop;
  }

  stop(): void {
    this.abortController.abort();
  }

  private async consumeEvents(): Promise<void> {
    try {
      for await (const event of this.options.taskStore.watchEvents({
        signal: this.abortController.signal,
        debounceMs: this.options.policy.eventDebounceMs
      })) {
        if (this.seenEventIds.has(event.id)) {
          continue;
        }

        this.seenEventIds.add(event.id);
        await this.options.runner.handleEvent(event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('AbortError') || message.includes('aborted')) {
        return;
      }

      throw error;
    }
  }
}
