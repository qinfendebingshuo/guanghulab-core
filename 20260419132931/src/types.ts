export const remoteAgentStatuses = ["registered", "handshake_pending", "active", "paused", "revoked"] as const;
export type RemoteAgentStatus = typeof remoteAgentStatuses[number];

export const handshakeStatuses = ["pending", "confirmed", "expired", "rejected"] as const;
export type HandshakeStatus = typeof handshakeStatuses[number];

export const deploymentJobStatuses = ["planned", "dispatched", "succeeded", "failed"] as const;
export type DeploymentJobStatus = typeof deploymentJobStatuses[number];

export const heartbeatStatuses = ["alive", "warning", "critical"] as const;
export type HeartbeatStatus = typeof heartbeatStatuses[number];

export const requestedScopes = [
  "deploy",
  "world:init",
  "memory:sync",
  "heartbeat",
  "status:read"
] as const;
export type RequestedScope = typeof requestedScopes[number];

export interface PersonaSeed {
  name: string;
  role: string;
  summary?: string;
}

export interface RemoteAgentRegistrationInput {
  humanName: string;
  humanCode: string;
  targetDomain: string;
  targetChannel: string;
  remoteAgentName: string;
  remoteAgentCode: string;
  remoteEndpoint: string;
  remoteWorkspace?: string;
  personaSeed: PersonaSeed;
  capabilities: string[];
  requestedScopes: RequestedScope[];
  sharedSecret: string;
}

export interface RemoteAgentRecord {
  id: string;
  humanName: string;
  humanCode: string;
  targetDomain: string;
  targetChannel: string;
  remoteAgentName: string;
  remoteAgentCode: string;
  remoteEndpoint: string;
  remoteWorkspace?: string;
  personaSeed: PersonaSeed;
  capabilities: string[];
  requestedScopes: RequestedScope[];
  rootController: string;
  status: RemoteAgentStatus;
  sharedSecret: string;
  createdAt: string;
  updatedAt: string;
  lastHandshakeAt?: string;
  lastSeenAt?: string;
  heartbeatStatus?: HeartbeatStatus;
  activeHandshakeTicketId?: string;
  lastJobSummary?: string;
}

export interface HandshakeTicket {
  id: string;
  remoteAgentId: string;
  nonce: string;
  requestedScopes: RequestedScope[];
  status: HandshakeStatus;
  issuedAt: string;
  expiresAt: string;
  confirmedAt?: string;
  controllerEndpoint: string;
}

export interface HandshakeConfirmationInput {
  ticketId: string;
  remoteAgentId: string;
  proof: string;
  remoteAgentVersion?: string;
  capabilities?: string[];
}

export interface HandshakeConfirmationResult {
  ticketId: string;
  remoteAgentId: string;
  status: HandshakeStatus;
  confirmedAt: string;
  acceptedScopes: RequestedScope[];
}

export interface DeploymentStep {
  id: string;
  order: number;
  title: string;
  action: string;
  details: string;
  payload: Record<string, unknown>;
}

export interface WorldPreparationInput {
  remoteAgentId: string;
  worldName: string;
  personalDomain: string;
  personalChannel: string;
  modules: string[];
  deploymentGoal?: string;
  includeMemorySeed: boolean;
}

export interface DeploymentBlueprint {
  worldName: string;
  personalDomain: string;
  personalChannel: string;
  memoryPartitionPath: string;
  modules: string[];
  personaSeed: PersonaSeed;
  steps: DeploymentStep[];
}

export interface DeploymentJob {
  id: string;
  remoteAgentId: string;
  status: DeploymentJobStatus;
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  blueprint: DeploymentBlueprint;
  deploymentGoal?: string;
  remoteResponse?: Record<string, unknown>;
}

export interface RemoteDispatchResult {
  remoteAgentId: string;
  jobId: string;
  status: "accepted" | "dry_run" | "failed";
  targetUrl: string;
  summary: string;
  remoteResponse?: Record<string, unknown>;
}

export interface RemoteHeartbeatInput {
  remoteAgentId: string;
  status: HeartbeatStatus;
  detail?: string;
}

export interface RemoteJobResultInput {
  jobId: string;
  status: Extract<DeploymentJobStatus, "succeeded" | "failed">;
  summary: string;
  outputs?: Record<string, unknown>;
}

export interface AgentStore {
  agents: Record<string, RemoteAgentRecord>;
}

export interface HandshakeStore {
  tickets: Record<string, HandshakeTicket>;
}

export interface JobStore {
  jobs: Record<string, DeploymentJob>;
}
