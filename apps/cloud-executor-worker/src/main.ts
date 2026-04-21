import process from "node:process";
import { ExecutorRunner, FileExecutionTaskStore, loadExecutionPolicy } from "@guanghu/executor-core";

const policy = loadExecutionPolicy();
const taskStore = new FileExecutionTaskStore(policy.taskStateDir);
const runner = new ExecutorRunner({ policy, taskStore });

let timer: ReturnType<typeof setInterval> | undefined;

async function tick() {
  const task = await runner.runNextTask();

  if (task) {
    console.log(
      JSON.stringify({
        worker: "cloud-executor-worker",
        taskId: task.id,
        stage: task.stage,
        updatedAt: task.updatedAt
      })
    );
  }
}

async function shutdown(signal: string) {
  if (timer) {
    clearInterval(timer);
  }

  console.log(JSON.stringify({ worker: "cloud-executor-worker", signal, status: "stopping" }));
  process.exit(0);
}

async function main() {
  await taskStore.ensureReady();
  console.log(
    JSON.stringify({
      worker: "cloud-executor-worker",
      status: "ready",
      pollingIntervalMs: policy.pollingIntervalMs,
      taskStateDir: policy.taskStateDir
    })
  );

  await tick();
  timer = setInterval(() => {
    void tick();
  }, policy.pollingIntervalMs);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
