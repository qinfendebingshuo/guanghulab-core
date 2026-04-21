import Fastify from "fastify";
import type { ExecutionTaskRequest, RuntimeHealth } from "@guanghu/contracts";
import { ExecutorRunner, FileExecutionTaskStore, loadExecutionPolicy } from "@guanghu/executor-core";
import { listModules } from "@guanghu/module-registry";
import { createRepositoryAdapters } from "@guanghu/repo-adapters";
import { readSecretIndex } from "@guanghu/secret-locator";
import { buildBindingRecord } from "@guanghu/storage-binding";

const app = Fastify({ logger: true });
const adapters = createRepositoryAdapters();
const policy = loadExecutionPolicy();
const taskStore = new FileExecutionTaskStore(policy.taskStateDir);
const runner = new ExecutorRunner({ policy, taskStore, adapters });

app.get("/health", async (): Promise<RuntimeHealth & { executor: string }> => ({
  status: "ok",
  message: "base shell runtime is ready",
  executor: "enabled"
}));

app.get("/modules", async () => ({
  modules: listModules()
}));

app.get("/runtime/summary", async () => {
  const modules = listModules();
  const secrets = await readSecretIndex();
  const tasks = await taskStore.listTasks();

  return {
    adapters: Object.keys(adapters),
    secrets: secrets.map((entry) => ({ id: entry.id, category: entry.category, status: entry.status })),
    bindings: modules.map((module) => buildBindingRecord("demo-user", module.id, module.version)),
    execution: {
      activationMode: "event-driven-half-agent",
      defaultMode: policy.defaultMode,
      fallbackMode: policy.fallbackMode,
      queuedTasks: tasks.filter((task) => task.stage === "queued").length,
      awaitingMergeTasks: tasks.filter((task) => task.stage === "merging").length,
      blockedTasks: tasks.filter((task) => task.stage === "blocked").length
    }
  };
});

app.get("/executor/policy", async () => policy);

app.get("/executor/health", async () => {
  const tasks = await taskStore.listTasks();

  return {
    status: "ok",
    stateDir: policy.taskStateDir,
    activationMode: "event-driven-half-agent",
    eventDebounceMs: policy.eventDebounceMs,
    queue: {
      queued: tasks.filter((task) => task.stage === "queued").length,
      awakened: tasks.filter((task) => task.stage === "awakened").length,
      executing: tasks.filter((task) => task.stage === "executing" || task.stage === "merging").length,
      blocked: tasks.filter((task) => task.stage === "blocked").length
    }
  };
});

app.get("/tasks", async () => {
  const tasks = await taskStore.listTasks();
  return { tasks };
});

app.get<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
  const task = await taskStore.getTask(request.params.id);

  if (!task) {
    reply.code(404);
    return { message: `未找到任务 ${request.params.id}` };
  }

  return { task };
});

app.post<{ Body: ExecutionTaskRequest }>("/tasks", async (request, reply) => {
  const task = await runner.submitTask(request.body);
  reply.code(202);
  return { task };
});

const port = Number(process.env.PORT || 3001);

async function main() {
  await taskStore.ensureReady();
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
