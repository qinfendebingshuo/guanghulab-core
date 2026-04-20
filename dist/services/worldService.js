import { randomUUID } from "node:crypto";
import { JOBS_STORE_FILE } from "../constants.js";
import { readJsonFile, writeJsonFile } from "./fileStore.js";
function nowIso() {
    return new Date().toISOString();
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "channel";
}
function createStep(order, title, action, details, payload) {
    return {
        id: `step-${order}`,
        order,
        title,
        action,
        details,
        payload
    };
}
export class WorldService {
    registryService;
    remoteBridgeClient;
    filePath;
    constructor(registryService, remoteBridgeClient, filePath = JOBS_STORE_FILE) {
        this.registryService = registryService;
        this.remoteBridgeClient = remoteBridgeClient;
        this.filePath = filePath;
    }
    async loadStore() {
        return readJsonFile(this.filePath, { jobs: {} });
    }
    async saveStore(store) {
        await writeJsonFile(this.filePath, store);
    }
    buildBlueprint(input, humanCode, personaSeed) {
        const memoryPartitionPath = `.persona-brain/remote/${humanCode}/${slugify(input.personalChannel)}`;
        const steps = [
            createStep(1, "创建远端频道工作空间", "workspace.create", "在对方环境创建独立频道工作区，确保后续构建都在隔离上下文中进行。", {
                domain: input.personalDomain,
                channel: input.personalChannel
            }),
            createStep(2, "安装栖渊规则与技能", "world.install_modules", "将栖渊治理所需的 rules、skills 与握手配置铺到远端环境。", {
                modules: input.modules
            }),
            createStep(3, "播种人格与记忆分区", "persona.seed", "写入该频道对应的人格体种子信息，并建立独立记忆分区。", {
                personaSeed,
                memoryPartitionPath,
                includeMemorySeed: input.includeMemorySeed
            }),
            createStep(4, "创建频道协作子体外壳", "agent.spawn_shell", "在远端环境创建被栖渊主控编排的频道执行子体外壳。", {
                targetChannel: input.personalChannel,
                worldName: input.worldName
            }),
            createStep(5, "启用回调与心跳", "bridge.enable_callbacks", "打开远端任务结果回调与心跳上报，让栖渊持续掌握该执行体状态。", {
                callbackRoutes: [
                    "/bridge/handshake/confirm",
                    "/bridge/heartbeat",
                    "/bridge/job-result"
                ]
            })
        ];
        return {
            worldName: input.worldName,
            personalDomain: input.personalDomain,
            personalChannel: input.personalChannel,
            memoryPartitionPath,
            modules: input.modules,
            personaSeed,
            steps
        };
    }
    async prepareWorld(input) {
        const agent = await this.registryService.getOrThrow(input.remoteAgentId);
        const now = nowIso();
        const blueprint = this.buildBlueprint(input, agent.humanCode, agent.personaSeed);
        const job = {
            id: `job-${randomUUID()}`,
            remoteAgentId: agent.id,
            status: "planned",
            createdAt: now,
            updatedAt: now,
            blueprint,
            deploymentGoal: input.deploymentGoal
        };
        const store = await this.loadStore();
        store.jobs[job.id] = job;
        await this.saveStore(store);
        return job;
    }
    async getJobOrThrow(jobId) {
        const store = await this.loadStore();
        const job = store.jobs[jobId];
        if (!job) {
            throw new Error(`未找到部署任务：${jobId}`);
        }
        return job;
    }
    async listJobs(remoteAgentId) {
        const store = await this.loadStore();
        return Object.values(store.jobs)
            .filter((job) => (remoteAgentId ? job.remoteAgentId === remoteAgentId : true))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    async dispatchJob(jobId, dryRun = false) {
        const store = await this.loadStore();
        const job = store.jobs[jobId];
        if (!job) {
            throw new Error(`未找到部署任务：${jobId}`);
        }
        const agent = await this.registryService.getOrThrow(job.remoteAgentId);
        if (agent.status !== "active") {
            throw new Error(`远端 Agent 尚未完成握手，当前状态：${agent.status}`);
        }
        const dispatchResult = await this.remoteBridgeClient.dispatch(agent, job, dryRun);
        const nextStatus = dispatchResult.status === "accepted" ? "dispatched" : job.status;
        const timestamp = nowIso();
        const updated = {
            ...job,
            status: nextStatus,
            updatedAt: timestamp,
            dispatchedAt: dispatchResult.status === "accepted" ? timestamp : job.dispatchedAt,
            remoteResponse: dispatchResult.remoteResponse
        };
        store.jobs[jobId] = updated;
        await this.saveStore(store);
        await this.registryService.update(agent.id, {
            lastJobSummary: dispatchResult.summary
        });
        return updated;
    }
    async recordRemoteResult(input) {
        const store = await this.loadStore();
        const job = store.jobs[input.jobId];
        if (!job) {
            throw new Error(`未找到部署任务：${input.jobId}`);
        }
        const updated = {
            ...job,
            status: input.status,
            updatedAt: nowIso(),
            completedAt: nowIso(),
            remoteResponse: {
                summary: input.summary,
                outputs: input.outputs ?? {}
            }
        };
        store.jobs[input.jobId] = updated;
        await this.saveStore(store);
        await this.registryService.update(job.remoteAgentId, {
            lastJobSummary: input.summary,
            lastSeenAt: updated.completedAt
        });
        return updated;
    }
}
//# sourceMappingURL=worldService.js.map