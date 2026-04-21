import process from 'node:process';
import { EventDrivenWorker, ExecutorRunner, FileExecutionTaskStore, loadExecutionPolicy } from '@guanghu/executor-core';

const policy = loadExecutionPolicy();
const taskStore = new FileExecutionTaskStore(policy.taskStateDir);
const runner = new ExecutorRunner({ policy, taskStore });
const worker = new EventDrivenWorker({ runner, taskStore, policy });

async function shutdown(signal: string) {
  worker.stop();
  console.log(JSON.stringify({ worker: 'cloud-executor-worker', signal, status: 'stopping' }));
  process.exit(0);
}

async function main() {
  await taskStore.ensureReady();
  console.log(
    JSON.stringify({
      worker: 'cloud-executor-worker',
      status: 'ready',
      activationMode: 'event-driven-half-agent',
      eventDebounceMs: policy.eventDebounceMs,
      taskStateDir: policy.taskStateDir
    })
  );

  await worker.start();
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
