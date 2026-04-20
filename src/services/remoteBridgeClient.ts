import { CONTROLLER_NAME, REMOTE_TIMEOUT_MS } from "../constants.js";
import { DeploymentJob, RemoteAgentRecord, RemoteDispatchResult } from "../types.js";

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildExecuteUrl(remoteEndpoint: string): string {
  return new URL("bridge/execute", ensureTrailingSlash(remoteEndpoint)).toString();
}

async function parseResponseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export class RemoteBridgeClient {
  async dispatch(agent: RemoteAgentRecord, job: DeploymentJob, dryRun = false): Promise<RemoteDispatchResult> {
    const targetUrl = buildExecuteUrl(agent.remoteEndpoint);

    if (dryRun) {
      return {
        remoteAgentId: agent.id,
        jobId: job.id,
        status: "dry_run",
        targetUrl,
        summary: "已生成 dry-run 结果，尚未真正向远端执行体派发任务。",
        remoteResponse: {
          blueprint: job.blueprint,
          requestedScopes: agent.requestedScopes
        }
      };
    }

    const payload = {
      controller: CONTROLLER_NAME,
      remote_agent_id: agent.id,
      human_identity: {
        name: agent.humanName,
        code: agent.humanCode
      },
      target_domain: agent.targetDomain,
      target_channel: agent.targetChannel,
      job
    };

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-qiyuan-controller": CONTROLLER_NAME,
        "x-qiyuan-remote-agent-id": agent.id,
        "x-qiyuan-shared-secret": agent.sharedSecret
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS)
    });

    const remoteResponse = await parseResponseBody(response);

    if (!response.ok) {
      const detail = typeof remoteResponse.raw === "string"
        ? remoteResponse.raw
        : JSON.stringify(remoteResponse);
      throw new Error(`远端执行体拒绝任务，HTTP ${response.status}：${detail}`);
    }

    return {
      remoteAgentId: agent.id,
      jobId: job.id,
      status: "accepted",
      targetUrl,
      summary: "远端执行体已接受任务，等待其在对方环境中执行并通过回调返回结果。",
      remoteResponse
    };
  }
}
