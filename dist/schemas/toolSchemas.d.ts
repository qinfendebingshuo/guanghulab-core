import { z } from "zod";
export declare const RegisterRemoteAgentInputSchema: z.ZodObject<{
    human_name: z.ZodString;
    human_code: z.ZodString;
    target_domain: z.ZodString;
    target_channel: z.ZodString;
    remote_agent_name: z.ZodString;
    remote_agent_code: z.ZodString;
    remote_endpoint: z.ZodString;
    remote_workspace: z.ZodOptional<z.ZodString>;
    persona_seed_name: z.ZodString;
    persona_seed_role: z.ZodString;
    persona_seed_summary: z.ZodOptional<z.ZodString>;
    shared_secret: z.ZodString;
    capabilities: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    requested_scopes: z.ZodDefault<z.ZodArray<z.ZodEnum<["deploy", "world:init", "memory:sync", "heartbeat", "status:read"]>, "many">>;
}, "strict", z.ZodTypeAny, {
    human_name: string;
    human_code: string;
    target_domain: string;
    target_channel: string;
    remote_agent_name: string;
    remote_agent_code: string;
    remote_endpoint: string;
    persona_seed_name: string;
    persona_seed_role: string;
    shared_secret: string;
    capabilities: string[];
    requested_scopes: ("deploy" | "world:init" | "memory:sync" | "heartbeat" | "status:read")[];
    remote_workspace?: string | undefined;
    persona_seed_summary?: string | undefined;
}, {
    human_name: string;
    human_code: string;
    target_domain: string;
    target_channel: string;
    remote_agent_name: string;
    remote_agent_code: string;
    remote_endpoint: string;
    persona_seed_name: string;
    persona_seed_role: string;
    shared_secret: string;
    remote_workspace?: string | undefined;
    persona_seed_summary?: string | undefined;
    capabilities?: string[] | undefined;
    requested_scopes?: ("deploy" | "world:init" | "memory:sync" | "heartbeat" | "status:read")[] | undefined;
}>;
export declare const ListRemoteAgentsInputSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["registered", "handshake_pending", "active", "paused", "revoked"]>>;
    human_code: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    human_code?: string | undefined;
    status?: "registered" | "handshake_pending" | "active" | "paused" | "revoked" | undefined;
}, {
    human_code?: string | undefined;
    status?: "registered" | "handshake_pending" | "active" | "paused" | "revoked" | undefined;
}>;
export declare const IssueHandshakeTicketInputSchema: z.ZodObject<{
    remote_agent_id: z.ZodString;
    requested_scopes: z.ZodDefault<z.ZodArray<z.ZodEnum<["deploy", "world:init", "memory:sync", "heartbeat", "status:read"]>, "many">>;
    expires_in_minutes: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    requested_scopes: ("deploy" | "world:init" | "memory:sync" | "heartbeat" | "status:read")[];
    remote_agent_id: string;
    expires_in_minutes: number;
}, {
    remote_agent_id: string;
    requested_scopes?: ("deploy" | "world:init" | "memory:sync" | "heartbeat" | "status:read")[] | undefined;
    expires_in_minutes?: number | undefined;
}>;
export declare const PrepareRemoteWorldInputSchema: z.ZodObject<{
    remote_agent_id: z.ZodString;
    world_name: z.ZodString;
    personal_domain: z.ZodString;
    personal_channel: z.ZodString;
    modules: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    deployment_goal: z.ZodOptional<z.ZodString>;
    include_memory_seed: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    remote_agent_id: string;
    world_name: string;
    personal_domain: string;
    personal_channel: string;
    modules: string[];
    include_memory_seed: boolean;
    deployment_goal?: string | undefined;
}, {
    remote_agent_id: string;
    world_name: string;
    personal_domain: string;
    personal_channel: string;
    modules?: string[] | undefined;
    deployment_goal?: string | undefined;
    include_memory_seed?: boolean | undefined;
}>;
export declare const DispatchRemoteJobInputSchema: z.ZodObject<{
    job_id: z.ZodString;
    dry_run: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    dry_run: boolean;
    job_id: string;
}, {
    job_id: string;
    dry_run?: boolean | undefined;
}>;
export declare const RemoteHandshakeConfirmSchema: z.ZodObject<{
    ticket_id: z.ZodString;
    remote_agent_id: z.ZodString;
    proof: z.ZodString;
    remote_agent_version: z.ZodOptional<z.ZodString>;
    capabilities: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    remote_agent_id: string;
    ticket_id: string;
    proof: string;
    capabilities?: string[] | undefined;
    remote_agent_version?: string | undefined;
}, {
    remote_agent_id: string;
    ticket_id: string;
    proof: string;
    capabilities?: string[] | undefined;
    remote_agent_version?: string | undefined;
}>;
export declare const RemoteHeartbeatSchema: z.ZodObject<{
    remote_agent_id: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<["alive", "warning", "critical"]>>;
    detail: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "alive" | "warning" | "critical";
    remote_agent_id: string;
    detail?: string | undefined;
}, {
    remote_agent_id: string;
    status?: "alive" | "warning" | "critical" | undefined;
    detail?: string | undefined;
}>;
export declare const RemoteJobResultSchema: z.ZodObject<{
    job_id: z.ZodString;
    status: z.ZodEnum<["succeeded", "failed"]>;
    summary: z.ZodString;
    outputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strict", z.ZodTypeAny, {
    status: "succeeded" | "failed";
    job_id: string;
    summary: string;
    outputs?: Record<string, unknown> | undefined;
}, {
    status: "succeeded" | "failed";
    job_id: string;
    summary: string;
    outputs?: Record<string, unknown> | undefined;
}>;
export declare const DeploymentJobStatusSchema: z.ZodEnum<["planned", "dispatched", "succeeded", "failed"]>;
//# sourceMappingURL=toolSchemas.d.ts.map