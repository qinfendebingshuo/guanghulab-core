import path from "node:path";
export const SERVER_NAME = "qiyuan-bridge-mcp-server";
export const SERVER_VERSION = "0.1.0";
export const CONTROLLER_NAME = "栖渊";
export const PROJECT_ROOT = process.cwd();
export const CONTROL_DIR = path.join(PROJECT_ROOT, ".qiyuan-control");
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const AGENTS_STORE_FILE = path.join(CONTROL_DIR, "remote-agents.json");
export const HANDSHAKES_STORE_FILE = path.join(CONTROL_DIR, "handshakes.json");
export const JOBS_STORE_FILE = path.join(CONTROL_DIR, "deployment-jobs.json");
export const DEFAULT_PORT = Number(process.env.PORT ?? 3030);
export const HANDSHAKE_TTL_MINUTES = Number(process.env.HANDSHAKE_TTL_MINUTES ?? 30);
export const REMOTE_TIMEOUT_MS = Number(process.env.REMOTE_TIMEOUT_MS ?? 15000);
export const DEFAULT_REQUESTED_SCOPES = [
    "deploy",
    "world:init",
    "memory:sync",
    "heartbeat",
    "status:read"
];
export const DEFAULT_WORLD_MODULES = [
    "skills",
    "rules",
    "persona_brain",
    "handshake",
    "channel_agent_shell"
];
//# sourceMappingURL=constants.js.map