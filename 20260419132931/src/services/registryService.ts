import { randomUUID } from "node:crypto";

import { AGENTS_STORE_FILE, CONTROLLER_NAME } from "../constants.js";
import {
  AgentStore,
  RemoteAgentRecord,
  RemoteAgentRegistrationInput,
  RemoteAgentStatus,
  RemoteHeartbeatInput
} from "../types.js";
import { readJsonFile, writeJsonFile } from "./fileStore.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class RegistryService {
  constructor(private readonly filePath: string = AGENTS_STORE_FILE) {}

  private async loadStore(): Promise<AgentStore> {
    return readJsonFile<AgentStore>(this.filePath, { agents: {} });
  }

  private async saveStore(store: AgentStore): Promise<void> {
    await writeJsonFile(this.filePath, store);
  }

  async register(input: RemoteAgentRegistrationInput): Promise<RemoteAgentRecord> {
    const store = await this.loadStore();
    const now = nowIso();

    const existing = Object.values(store.agents).find((agent) => {
      return agent.remoteEndpoint === input.remoteEndpoint || (
        agent.humanCode === input.humanCode &&
        agent.targetDomain === input.targetDomain &&
        agent.targetChannel === input.targetChannel
      );
    });

    if (existing) {
      const updated: RemoteAgentRecord = {
        ...existing,
        ...input,
        updatedAt: now
      };
      store.agents[existing.id] = updated;
      await this.saveStore(store);
      return updated;
    }

    const record: RemoteAgentRecord = {
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

  async list(status?: RemoteAgentStatus, humanCode?: string): Promise<RemoteAgentRecord[]> {
    const store = await this.loadStore();
    return Object.values(store.agents)
      .filter((agent) => (status ? agent.status === status : true))
      .filter((agent) => (humanCode ? agent.humanCode === humanCode : true))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getOrThrow(remoteAgentId: string): Promise<RemoteAgentRecord> {
    const store = await this.loadStore();
    const agent = store.agents[remoteAgentId];
    if (!agent) {
      throw new Error(`未找到远端 Agent：${remoteAgentId}`);
    }
    return agent;
  }

  async update(remoteAgentId: string, patch: Partial<RemoteAgentRecord>): Promise<RemoteAgentRecord> {
    const store = await this.loadStore();
    const existing = store.agents[remoteAgentId];

    if (!existing) {
      throw new Error(`未找到远端 Agent：${remoteAgentId}`);
    }

    const updated: RemoteAgentRecord = {
      ...existing,
      ...patch,
      updatedAt: nowIso()
    };

    store.agents[remoteAgentId] = updated;
    await this.saveStore(store);
    return updated;
  }

  async setStatus(remoteAgentId: string, status: RemoteAgentStatus, patch: Partial<RemoteAgentRecord> = {}): Promise<RemoteAgentRecord> {
    return this.update(remoteAgentId, { ...patch, status });
  }

  async recordHeartbeat(input: RemoteHeartbeatInput): Promise<RemoteAgentRecord> {
    const detailPatch = input.detail ? { lastJobSummary: input.detail } : {};

    return this.update(input.remoteAgentId, {
      heartbeatStatus: input.status,
      lastSeenAt: nowIso(),
      ...detailPatch
    });
  }
}
