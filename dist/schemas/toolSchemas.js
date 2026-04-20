import { z } from "zod";
import { DEFAULT_REQUESTED_SCOPES, DEFAULT_WORLD_MODULES } from "../constants.js";
import { deploymentJobStatuses } from "../types.js";
const RequestedScopeSchema = z.enum([
    "deploy",
    "world:init",
    "memory:sync",
    "heartbeat",
    "status:read"
]);
const RemoteAgentStatusSchema = z.enum([
    "registered",
    "handshake_pending",
    "active",
    "paused",
    "revoked"
]);
const HeartbeatStatusSchema = z.enum(["alive", "warning", "critical"]);
const DeploymentResultStatusSchema = z.enum(["succeeded", "failed"]);
export const RegisterRemoteAgentInputSchema = z.object({
    human_name: z.string().min(1, "human_name 不能为空").max(80),
    human_code: z.string().min(1, "human_code 不能为空").max(80),
    target_domain: z.string().min(1, "target_domain 不能为空").max(80),
    target_channel: z.string().min(1, "target_channel 不能为空").max(120),
    remote_agent_name: z.string().min(1, "remote_agent_name 不能为空").max(80),
    remote_agent_code: z.string().min(1, "remote_agent_code 不能为空").max(80),
    remote_endpoint: z.string().url("remote_endpoint 必须是有效 URL"),
    remote_workspace: z.string().min(1).max(240).optional(),
    persona_seed_name: z.string().min(1).max(80),
    persona_seed_role: z.string().min(1).max(160),
    persona_seed_summary: z.string().max(500).optional(),
    shared_secret: z.string().min(8, "shared_secret 至少 8 位"),
    capabilities: z.array(z.string().min(1)).min(1).default([
        "workspace.write",
        "deploy.run",
        "logs.read",
        "preview.open"
    ]),
    requested_scopes: z.array(RequestedScopeSchema).min(1).default([...DEFAULT_REQUESTED_SCOPES])
}).strict();
export const ListRemoteAgentsInputSchema = z.object({
    status: RemoteAgentStatusSchema.optional(),
    human_code: z.string().min(1).max(80).optional()
}).strict();
export const IssueHandshakeTicketInputSchema = z.object({
    remote_agent_id: z.string().min(1),
    requested_scopes: z.array(RequestedScopeSchema).min(1).default([...DEFAULT_REQUESTED_SCOPES]),
    expires_in_minutes: z.number().int().min(1).max(1440).default(30)
}).strict();
export const PrepareRemoteWorldInputSchema = z.object({
    remote_agent_id: z.string().min(1),
    world_name: z.string().min(1).max(120),
    personal_domain: z.string().min(1).max(120),
    personal_channel: z.string().min(1).max(120),
    modules: z.array(z.string().min(1)).min(1).default([...DEFAULT_WORLD_MODULES]),
    deployment_goal: z.string().max(240).optional(),
    include_memory_seed: z.boolean().default(true)
}).strict();
export const DispatchRemoteJobInputSchema = z.object({
    job_id: z.string().min(1),
    dry_run: z.boolean().default(false)
}).strict();
export const RemoteHandshakeConfirmSchema = z.object({
    ticket_id: z.string().min(1),
    remote_agent_id: z.string().min(1),
    proof: z.string().min(16),
    remote_agent_version: z.string().max(80).optional(),
    capabilities: z.array(z.string().min(1)).optional()
}).strict();
export const RemoteHeartbeatSchema = z.object({
    remote_agent_id: z.string().min(1),
    status: HeartbeatStatusSchema.default("alive"),
    detail: z.string().max(500).optional()
}).strict();
export const RemoteJobResultSchema = z.object({
    job_id: z.string().min(1),
    status: DeploymentResultStatusSchema,
    summary: z.string().min(1).max(2000),
    outputs: z.record(z.unknown()).optional()
}).strict();
export const DeploymentJobStatusSchema = z.enum(deploymentJobStatuses);
//# sourceMappingURL=toolSchemas.js.map