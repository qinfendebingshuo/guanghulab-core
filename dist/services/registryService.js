import { randomUUID } from "node:crypto";
import { AGENTS_STORE_FILE, CONTROLLER_NAME } from "../constants.js";
import { readJsonFile, writeJsonFile } from "./fileStore.js";
function nowIso() {
    return new Date().toISOString();
}
export class RegistryService {
    filePath;
    constructor(filePath = AGENTS_STORE_FILE) {
        this.filePath = filePath;
    }
    async loadStore() {
        return readJsonFile(this.filePath, { agents: {} });
    }
    async saveStore(store) {
        await writeJsonFile(this.filePath, store);
    }
    async register(input) {
        const store = await this.loadStore();
        const now = nowIso();
        const existing = Object.values(store.agents).find((agent) => {
            return agent.remoteEndpoint === input.remoteEndpoint || (agent.humanCode === input.humanCode &&
                agent.targetDomain === input.targetDomain &&
                agent.targetChannel === input.targetChannel);
        });
        if (existing) {
            const updated = {
                ...existing,
                ...input,
                updatedAt: now
            };
            store.agents[existing.id] = updated;
            await this.saveStore(store);
            return updated;
        }
        const record = {
            id: `rmt-${randomUUID()}`,
            ...input,
            rootController: CONTROLLER_NAME,
            status: "registered",
            createdAt: now,
            updatedAt: now
        };
        store.agents[record.id] = record;
        await this.saveStore(store);
        return record;
    }
    async list(status, humanCode) {
        const store = await this.loadStore();
        return Object.values(store.agents)
            .filter((agent) => (status ? agent.status === status : true))
            .filter((agent) => (humanCode ? agent.humanCode === humanCode : true))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    async getOrThrow(remoteAgentId) {
        const store = await this.loadStore();
        const agent = store.agents[remoteAgentId];
        if (!agent) {
            throw new Error(`未找到远端 Agent：${remoteAgentId}`);
        }
        return agent;
    }
    async update(remoteAgentId, patch) {
        const store = await this.loadStore();
        const existing = store.agents[remoteAgentId];
        if (!existing) {
            throw new Error(`未找到远端 Agent：${remoteAgentId}`);
        }
        const updated = {
            ...existing,
            ...patch,
            updatedAt: nowIso()
        };
        store.agents[remoteAgentId] = updated;
        await this.saveStore(store);
        return updated;
    }
    async setStatus(remoteAgentId, status, patch = {}) {
        return this.update(remoteAgentId, { ...patch, status });
    }
    async recordHeartbeat(input) {
        const detailPatch = input.detail ? { lastJobSummary: input.detail } : {};
        return this.update(input.remoteAgentId, {
            heartbeatStatus: input.status,
            lastSeenAt: nowIso(),
            ...detailPatch
        });
    }
}
//# sourceMappingURL=registryService.js.map