import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HandshakeService } from "../services/handshakeService.js";
import { RegistryService } from "../services/registryService.js";
import { WorldService } from "../services/worldService.js";
interface BridgeServices {
    registryService: RegistryService;
    handshakeService: HandshakeService;
    worldService: WorldService;
}
export declare function registerBridgeTools(server: McpServer, services: BridgeServices): void;
export {};
//# sourceMappingURL=registerTools.d.ts.map