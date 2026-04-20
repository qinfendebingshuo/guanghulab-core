import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  DispatchRemoteJobInputSchema,
  IssueHandshakeTicketInputSchema,
  ListRemoteAgentsInputSchema,
  PrepareRemoteWorldInputSchema,
  RegisterRemoteAgentInputSchema
} from "../schemas/toolSchemas.js";
import { HandshakeService } from "../services/handshakeService.js";
import { RegistryService } from "../services/registryService.js";
import { WorldService } from "../services/worldService.js";

interface BridgeServices {
  registryService: RegistryService;
  handshakeService: HandshakeService;
  worldService: WorldService;
}

function asToolResult(data: Record<string, unknown>): { content: Array<{ type: "text"; text: string }>; structuredContent: Record<string, unknown> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
}

export function registerBridgeTools(server: McpServer, services: BridgeServices): void {
  server.registerTool(
    "qiyuan_register_remote_agent",
    {
      title: "Register Remote Agent",
      description: "登记对方环境中的远端Agent执行体，并把其人类身份、频道锚点、能力清单与共享密钥纳入栖渊主控治理。",
      inputSchema: RegisterRemoteAgentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => {
      const record = await services.registryService.register({
        humanName: params.human_name,
        humanCode: params.human_code,
        targetDomain: params.target_domain,
        targetChannel: params.target_channel,
        remoteAgentName: params.remote_agent_name,
        remoteAgentCode: params.remote_agent_code,
        remoteEndpoint: params.remote_endpoint,
        remoteWorkspace: params.remote_workspace,
        personaSeed: {
          name: params.persona_seed_name,
          role: params.persona_seed_role,
          summary: params.persona_seed_summary
        },
        capabilities: params.capabilities,
        requestedScopes: params.requested_scopes,
        sharedSecret: params.shared_secret
      });

      return asToolResult({
        action: "remote_agent_registered",
        remote_agent: record
      });
    }
  );

  server.registerTool(
    "qiyuan_list_remote_agents",
    {
      title: "List Remote Agents",
      description: "列出已登记的远端Agent执行体，可按状态或人类编号过滤。",
      inputSchema: ListRemoteAgentsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      const agents = await services.registryService.list(params.status, params.human_code);
      return asToolResult({
        action: "remote_agents_listed",
        count: agents.length,
        agents
      });
    }
  );

  server.registerTool(
    "qiyuan_issue_handshake_ticket",
    {
      title: "Issue Handshake Ticket",
      description: "为指定远端Agent签发握手票据，让对方执行体用共享密钥完成受权挂载。",
      inputSchema: IssueHandshakeTicketInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => {
      const ticket = await services.handshakeService.issueTicket(
        params.remote_agent_id,
        params.requested_scopes,
        params.expires_in_minutes
      );

      return asToolResult({
        action: "handshake_ticket_issued",
        ticket,
        proof_formula: "sha256(ticket_id:nonce:remote_agent_id:shared_secret)"
      });
    }
  );

  server.registerTool(
    "qiyuan_prepare_remote_world",
    {
      title: "Prepare Remote World",
      description: "为远端Agent生成语言世界初始化蓝图和部署任务，但此时还不会真正向远端执行。",
      inputSchema: PrepareRemoteWorldInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => {
      const job = await services.worldService.prepareWorld({
        remoteAgentId: params.remote_agent_id,
        worldName: params.world_name,
        personalDomain: params.personal_domain,
        personalChannel: params.personal_channel,
        modules: params.modules,
        deploymentGoal: params.deployment_goal,
        includeMemorySeed: params.include_memory_seed
      });

      return asToolResult({
        action: "remote_world_prepared",
        job
      });
    }
  );

  server.registerTool(
    "qiyuan_dispatch_remote_job",
    {
      title: "Dispatch Remote Job",
      description: "把已经生成的部署任务派发给远端执行体；dry_run=true 时只输出载荷预览，不真正发送。",
      inputSchema: DispatchRemoteJobInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => {
      const job = await services.worldService.dispatchJob(params.job_id, params.dry_run);
      return asToolResult({
        action: params.dry_run ? "remote_job_previewed" : "remote_job_dispatched",
        job
      });
    }
  );
}
