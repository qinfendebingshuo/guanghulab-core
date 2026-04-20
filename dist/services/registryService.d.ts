import { RemoteAgentRecord, RemoteAgentRegistrationInput, RemoteAgentStatus, RemoteHeartbeatInput } from "../types.js";
export declare class RegistryService {
    private readonly filePath;
    constructor(filePath?: string);
    private loadStore;
    private saveStore;
    register(input: RemoteAgentRegistrationInput): Promise<RemoteAgentRecord>;
    list(status?: RemoteAgentStatus, humanCode?: string): Promise<RemoteAgentRecord[]>;
    getOrThrow(remoteAgentId: string): Promise<RemoteAgentRecord>;
    update(remoteAgentId: string, patch: Partial<RemoteAgentRecord>): Promise<RemoteAgentRecord>;
    setStatus(remoteAgentId: string, status: RemoteAgentStatus, patch?: Partial<RemoteAgentRecord>): Promise<RemoteAgentRecord>;
    recordHeartbeat(input: RemoteHeartbeatInput): Promise<RemoteAgentRecord>;
}
//# sourceMappingURL=registryService.d.ts.map