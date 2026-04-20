import { DeploymentJob, RemoteJobResultInput, WorldPreparationInput } from "../types.js";
import { RegistryService } from "./registryService.js";
import { RemoteBridgeClient } from "./remoteBridgeClient.js";
export declare class WorldService {
    private readonly registryService;
    private readonly remoteBridgeClient;
    private readonly filePath;
    constructor(registryService: RegistryService, remoteBridgeClient: RemoteBridgeClient, filePath?: string);
    private loadStore;
    private saveStore;
    private buildBlueprint;
    prepareWorld(input: WorldPreparationInput): Promise<DeploymentJob>;
    getJobOrThrow(jobId: string): Promise<DeploymentJob>;
    listJobs(remoteAgentId?: string): Promise<DeploymentJob[]>;
    dispatchJob(jobId: string, dryRun?: boolean): Promise<DeploymentJob>;
    recordRemoteResult(input: RemoteJobResultInput): Promise<DeploymentJob>;
}
//# sourceMappingURL=worldService.d.ts.map