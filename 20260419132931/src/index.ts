#!/usr/bin/env node

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import {
  CONTROLLER_NAME,
  DEFAULT_PORT,
  PUBLIC_DIR,
  SERVER_NAME,
  SERVER_VERSION
} from "./constants.js";
import {
  RemoteHandshakeConfirmSchema,
  RemoteHeartbeatSchema,
  RemoteJobResultSchema
} from "./schemas/toolSchemas.js";
import { HandshakeService } from "./services/handshakeService.js";
import { RegistryService } from "./services/registryService.js";
import { RemoteBridgeClient } from "./services/remoteBridgeClient.js";
import { WorldService } from "./services/worldService.js";
import { registerBridgeTools } from "./tools/registerTools.js";

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION
});

const registryService = new RegistryService();
const handshakeService = new HandshakeService(registryService);
const worldService = new WorldService(registryService, new RemoteBridgeClient());

registerBridgeTools(server, {
  registryService,
  handshakeService,
  worldService
});

function respondWithError(error: unknown, res: express.Response): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      ok: false,
      error: "请求参数不合法",
      issues: error.issues
    });
    return;
  }

  res.status(500).json({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  });
}

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} running via stdio`);
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get(["/", "/index.html"], (_req, res) => {
    res.sendFile("index.html", { root: PUBLIC_DIR });
  });

  app.use(express.static(PUBLIC_DIR));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      controller: CONTROLLER_NAME,
      server: SERVER_NAME,
      version: SERVER_VERSION
    });
  });

  app.get("/bridge/manifest", (_req, res) => {
    res.json({
      ok: true,
      controller: CONTROLLER_NAME,
      routes: {
        handshake_confirm: "/bridge/handshake/confirm",
        heartbeat: "/bridge/heartbeat",
        job_result: "/bridge/job-result",
        mcp: "/mcp"
      },
      notes: [
        "远端执行体先登记，再申请握手票据。",
        "握手完成后，栖渊才会向其派发部署任务。"
      ]
    });
  });

  app.post("/bridge/handshake/confirm", async (req, res) => {
    try {
      const payload = RemoteHandshakeConfirmSchema.parse(req.body);
      const result = await handshakeService.confirmTicket({
        ticketId: payload.ticket_id,
        remoteAgentId: payload.remote_agent_id,
        proof: payload.proof,
        remoteAgentVersion: payload.remote_agent_version,
        capabilities: payload.capabilities
      });

      res.json({ ok: true, result });
    } catch (error) {
      respondWithError(error, res);
    }
  });

  app.post("/bridge/heartbeat", async (req, res) => {
    try {
      const payload = RemoteHeartbeatSchema.parse(req.body);
      const agent = await registryService.recordHeartbeat({
        remoteAgentId: payload.remote_agent_id,
        status: payload.status,
        detail: payload.detail
      });

      res.json({ ok: true, remote_agent: agent });
    } catch (error) {
      respondWithError(error, res);
    }
  });

  app.post("/bridge/job-result", async (req, res) => {
    try {
      const payload = RemoteJobResultSchema.parse(req.body);
      const job = await worldService.recordRemoteResult({
        jobId: payload.job_id,
        status: payload.status,
        summary: payload.summary,
        outputs: payload.outputs
      });

      res.json({ ok: true, job });
    } catch (error) {
      respondWithError(error, res);
    }
  });

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => {
      transport.close().catch((error) => {
        console.error("transport close error", error);
      });
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("mcp transport error", error);
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  });

  app.listen(DEFAULT_PORT, () => {
    console.error(`${SERVER_NAME} running on http://localhost:${DEFAULT_PORT}`);
  });
}

const transport = process.env.TRANSPORT ?? "stdio";

if (transport === "http") {
  runHttp().catch((error) => {
    console.error("HTTP server error", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("STDIO server error", error);
    process.exit(1);
  });
}
