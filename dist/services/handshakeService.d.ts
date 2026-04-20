import { HandshakeConfirmationInput, HandshakeConfirmationResult, HandshakeTicket, RequestedScope } from "../types.js";
import { RegistryService } from "./registryService.js";
export declare function buildHandshakeProof(ticketId: string, nonce: string, remoteAgentId: string, sharedSecret: string): string;
export declare class HandshakeService {
    private readonly registryService;
    private readonly filePath;
    constructor(registryService: RegistryService, filePath?: string);
    private loadStore;
    private saveStore;
    issueTicket(remoteAgentId: string, requestedScopes: RequestedScope[], expiresInMinutes?: number): Promise<HandshakeTicket>;
    confirmTicket(input: HandshakeConfirmationInput): Promise<HandshakeConfirmationResult>;
}
//# sourceMappingURL=handshakeService.d.ts.map