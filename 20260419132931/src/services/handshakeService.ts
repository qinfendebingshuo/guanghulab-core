import { createHash, randomUUID } from "node:crypto";

import { HANDSHAKE_TTL_MINUTES, HANDSHAKES_STORE_FILE } from "../constants.js";
import {
  HandshakeConfirmationInput,
  HandshakeConfirmationResult,
  HandshakeStore,
  HandshakeTicket,
  RequestedScope
} from "../types.js";
import { readJsonFile, writeJsonFile } from "./fileStore.js";
import { RegistryService } from "./registryService.js";

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(base: Date, minutes: number): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

export function buildHandshakeProof(ticketId: string, nonce: string, remoteAgentId: string, sharedSecret: string): string {
  return createHash("sha256")
    .update(`${ticketId}:${nonce}:${remoteAgentId}:${sharedSecret}`)
    .digest("hex");
}

export class HandshakeService {
  constructor(
    private readonly registryService: RegistryService,
    private readonly filePath: string = HANDSHAKES_STORE_FILE
  ) {}

  private async loadStore(): Promise<HandshakeStore> {
    return readJsonFile<HandshakeStore>(this.filePath, { tickets: {} });
  }

  private async saveStore(store: HandshakeStore): Promise<void> {
    await writeJsonFile(this.filePath, store);
  }

  async issueTicket(remoteAgentId: string, requestedScopes: RequestedScope[], expiresInMinutes = HANDSHAKE_TTL_MINUTES): Promise<HandshakeTicket> {
    const agent = await this.registryService.getOrThrow(remoteAgentId);
    const issuedAt = new Date();

    const ticket: HandshakeTicket = {
      id: `hs-${randomUUID()}`,
      remoteAgentId,
      nonce: randomUUID(),
      requestedScopes,
      status: "pending",
      issuedAt: issuedAt.toISOString(),
      expiresAt: addMinutes(issuedAt, expiresInMinutes),
      controllerEndpoint: "/bridge/handshake/confirm"
    };

    const store = await this.loadStore();
    store.tickets[ticket.id] = ticket;
    await this.saveStore(store);

    await this.registryService.setStatus(agent.id, "handshake_pending", {
      activeHandshakeTicketId: ticket.id,
      requestedScopes
    });

    return ticket;
  }

  async confirmTicket(input: HandshakeConfirmationInput): Promise<HandshakeConfirmationResult> {
    const store = await this.loadStore();
    const ticket = store.tickets[input.ticketId];

    if (!ticket) {
      throw new Error(`未找到握手票据：${input.ticketId}`);
    }

    if (ticket.status !== "pending") {
      throw new Error(`握手票据当前状态不可确认：${ticket.status}`);
    }

    if (new Date(ticket.expiresAt).getTime() <= Date.now()) {
      ticket.status = "expired";
      store.tickets[ticket.id] = ticket;
      await this.saveStore(store);
      throw new Error(`握手票据已过期：${ticket.id}`);
    }

    const agent = await this.registryService.getOrThrow(input.remoteAgentId);
    if (agent.id !== ticket.remoteAgentId) {
      throw new Error("握手票据与远端 Agent 不匹配");
    }

    const expectedProof = buildHandshakeProof(ticket.id, ticket.nonce, agent.id, agent.sharedSecret);
    if (input.proof !== expectedProof) {
      throw new Error("握手 proof 校验失败，请检查 shared_secret 与 nonce 是否一致");
    }

    const confirmedAt = nowIso();
    const confirmedTicket: HandshakeTicket = {
      ...ticket,
      status: "confirmed",
      confirmedAt
    };

    store.tickets[ticket.id] = confirmedTicket;
    await this.saveStore(store);

    await this.registryService.setStatus(agent.id, "active", {
      lastHandshakeAt: confirmedAt,
      lastSeenAt: confirmedAt,
      activeHandshakeTicketId: ticket.id,
      capabilities: input.capabilities ?? agent.capabilities
    });

    return {
      ticketId: confirmedTicket.id,
      remoteAgentId: agent.id,
      status: confirmedTicket.status,
      confirmedAt,
      acceptedScopes: confirmedTicket.requestedScopes
    };
  }
}
