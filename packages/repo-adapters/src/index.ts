import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type {
  RepositoryAdapter,
  RepositoryCommitSummary,
  RepositoryFileMutation,
  RepositoryReadResult,
  RepositorySyncPlan,
  RepositoryTarget,
  RepositoryWriteResult
} from "@guanghu/contracts";

interface GitHubRepositoryAdapterConfig {
  owner?: string;
  repo?: string;
  repository?: string;
  branch?: string;
  token?: string;
  basePath?: string;
  workspaceRoot?: string;
}

interface CnRepositoryAdapterConfig {
  repository?: string;
  branch?: string;
}

interface GitRefResponse {
  object: {
    sha: string;
  };
}

interface GitCommitResponse {
  sha: string;
  tree: {
    sha: string;
  };
}

interface GitTreeResponse {
  sha: string;
}

interface GitHubFileResponse {
  sha: string;
  content: string;
  path: string;
}

const GITHUB_API_ROOT = "https://api.github.com";
const DEFAULT_REPOSITORY = "qinfendebingshuo/guanghulab-core";
const DEFAULT_BRANCH = "main";

function splitRepositoryId(repositoryId: string): { owner: string; repo: string } {
  const [owner, repo] = repositoryId.split("/");

  if (!owner || !repo) {
    throw new Error(`非法仓库标识：${repositoryId}`);
  }

  return { owner, repo };
}

function normalizeRelativePath(value: string): string {
  const normalized = path.posix.normalize(value).replace(/^\/+/, "");

  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new Error(`非法路径：${value}`);
  }

  return normalized;
}

function joinRepoPath(basePath: string | undefined, filePath: string): string {
  const normalizedFile = normalizeRelativePath(filePath);

  if (!basePath) {
    return normalizedFile;
  }

  const normalizedBase = normalizeRelativePath(basePath);
  return path.posix.join(normalizedBase, normalizedFile);
}

function encodeContentPath(filePath: string): string {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function formatCommitMessage(summary: RepositoryCommitSummary): string {
  const lines = [summary.title.trim()];

  if (summary.body?.trim()) {
    lines.push("", summary.body.trim());
  }

  const metadata = [
    summary.actor ? `actor=${summary.actor}` : undefined,
    summary.taskId ? `task=${summary.taskId}` : undefined,
    summary.mode ? `mode=${summary.mode}` : undefined
  ].filter(Boolean);

  if (metadata.length > 0) {
    lines.push("", metadata.join(" | "));
  }

  return lines.join("\n");
}

export function resolveDefaultRepositoryTarget(overrides: Partial<RepositoryTarget> = {}): RepositoryTarget {
  const repository = overrides.repository ?? process.env.GUANGHU_GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;

  return {
    provider: overrides.provider ?? "github",
    repository,
    branch: overrides.branch ?? process.env.GUANGHU_GITHUB_BRANCH ?? DEFAULT_BRANCH,
    basePath: overrides.basePath ?? process.env.GUANGHU_GITHUB_BASE_PATH
  };
}

function resolveGitHubConfig(config: GitHubRepositoryAdapterConfig = {}): Required<GitHubRepositoryAdapterConfig> {
  const repositoryId = config.repository ?? process.env.GUANGHU_GITHUB_REPOSITORY;
  const repository = repositoryId ?? (config.owner && config.repo ? `${config.owner}/${config.repo}` : DEFAULT_REPOSITORY);
  const split = splitRepositoryId(repository);

  return {
    owner: config.owner ?? process.env.GUANGHU_GITHUB_OWNER ?? split.owner,
    repo: config.repo ?? process.env.GUANGHU_GITHUB_REPO ?? split.repo,
    repository,
    branch: config.branch ?? process.env.GUANGHU_GITHUB_BRANCH ?? DEFAULT_BRANCH,
    token: config.token ?? process.env.GUANGHU_GITHUB_TOKEN ?? "",
    basePath: config.basePath ?? process.env.GUANGHU_GITHUB_BASE_PATH ?? "",
    workspaceRoot: config.workspaceRoot ?? process.env.GUANGHU_WORKSPACE_ROOT ?? process.cwd()
  };
}

async function readWorkspaceFiles(sourceRoot: string, relativePaths: string[]): Promise<RepositoryFileMutation[]> {
  const mutations = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const normalized = normalizeRelativePath(relativePath);
      const absolutePath = path.join(sourceRoot, normalized);
      const content = await readFile(absolutePath, "utf8");

      return {
        path: normalized,
        action: "upsert" as const,
        content
      };
    })
  );

  return mutations;
}

export class GitHubRepositoryAdapter implements RepositoryAdapter {
  provider = "github" as const;
  private readonly config: Required<GitHubRepositoryAdapterConfig>;

  constructor(config: GitHubRepositoryAdapterConfig = {}) {
    this.config = resolveGitHubConfig(config);
  }

  private get repositoryId() {
    return `${this.config.owner}/${this.config.repo}`;
  }

  private get headers(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {})
    };
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.headers,
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API 请求失败 (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }

  private async getBranchHeadSha(): Promise<string> {
    const ref = await this.request<GitRefResponse>(
      `${GITHUB_API_ROOT}/repos/${this.repositoryId}/git/ref/heads/${encodeURIComponent(this.config.branch)}`
    );

    return ref.object.sha;
  }

  private async getTreeSha(commitSha: string): Promise<string> {
    const commit = await this.request<GitCommitResponse>(`${GITHUB_API_ROOT}/repos/${this.repositoryId}/git/commits/${commitSha}`);
    return commit.tree.sha;
  }

  async exportModuleBundle(moduleId: string, version: string): Promise<string> {
    return `github://${this.repositoryId}/${moduleId}@${version}`;
  }

  async syncModuleCode(moduleId: string, version: string): Promise<void> {
    const moduleRoot = `packages/${moduleId}`;
    await this.syncWorkspace({
      sourceRoot: this.config.workspaceRoot,
      relativePaths: [moduleRoot],
      summary: {
        title: `sync ${moduleId}@${version}`,
        body: "workspace follow sync to github"
      }
    });
  }

  async publishRegistry(): Promise<void> {
    await this.syncWorkspace({
      sourceRoot: this.config.workspaceRoot,
      relativePaths: ["packages/module-registry/registry/modules.json"],
      summary: {
        title: "publish module registry",
        body: "sync registry to github"
      }
    });
  }

  async readTextFile(filePath: string): Promise<RepositoryReadResult> {
    const repositoryPath = joinRepoPath(this.config.basePath, filePath);
    const file = await this.request<GitHubFileResponse>(
      `${GITHUB_API_ROOT}/repos/${this.repositoryId}/contents/${encodeContentPath(repositoryPath)}?ref=${encodeURIComponent(this.config.branch)}`
    );

    return {
      provider: this.provider,
      repository: this.repositoryId,
      branch: this.config.branch,
      path: file.path,
      sha: file.sha,
      content: Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")
    };
  }

  async writeFilesBatch(files: RepositoryFileMutation[], summary: RepositoryCommitSummary): Promise<RepositoryWriteResult> {
    if (files.length === 0) {
      return {
        provider: this.provider,
        repository: this.repositoryId,
        branch: this.config.branch,
        changedPaths: []
      };
    }

    const parentCommitSha = await this.getBranchHeadSha();
    const baseTreeSha = await this.getTreeSha(parentCommitSha);
    const tree = files.map((file) => {
      const targetPath = joinRepoPath(this.config.basePath, file.path);

      if (file.action === "delete") {
        return {
          path: targetPath,
          mode: "100644",
          type: "blob",
          sha: null
        };
      }

      return {
        path: targetPath,
        mode: "100644",
        type: "blob",
        content: file.content ?? ""
      };
    });

    const createdTree = await this.request<GitTreeResponse>(`${GITHUB_API_ROOT}/repos/${this.repositoryId}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree
      })
    });

    const commit = await this.request<{ sha: string }>(`${GITHUB_API_ROOT}/repos/${this.repositoryId}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: formatCommitMessage(summary),
        tree: createdTree.sha,
        parents: [parentCommitSha]
      })
    });

    await this.request(`${GITHUB_API_ROOT}/repos/${this.repositoryId}/git/refs/heads/${encodeURIComponent(this.config.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({
        sha: commit.sha,
        force: false
      })
    });

    return {
      provider: this.provider,
      repository: this.repositoryId,
      branch: this.config.branch,
      commitSha: commit.sha,
      changedPaths: files.map((file) => joinRepoPath(this.config.basePath, file.path))
    };
  }

  async syncWorkspace(plan: RepositorySyncPlan): Promise<RepositoryWriteResult> {
    const files = await readWorkspaceFiles(plan.sourceRoot, plan.relativePaths);
    return this.writeFilesBatch(files, plan.summary);
  }
}

export class CnRepositoryAdapter implements RepositoryAdapter {
  provider = "tencent-cn-repo" as const;
  private readonly repository: string;
  private readonly branch: string;

  constructor(config: CnRepositoryAdapterConfig = {}) {
    this.repository = config.repository ?? "pending-cn-repo";
    this.branch = config.branch ?? "main";
  }

  async exportModuleBundle(moduleId: string, version: string): Promise<string> {
    return `cn-repo://${this.repository}/${moduleId}@${version}`;
  }

  async syncModuleCode(moduleId: string, version: string): Promise<void> {
    console.info(`sync ${moduleId}@${version} to cn repository placeholder`);
  }

  async publishRegistry(): Promise<void> {
    console.info("publish registry to cn repository placeholder");
  }

  async readTextFile(filePath: string): Promise<RepositoryReadResult> {
    throw new Error(`国内仓适配器当前不支持直接读取 ${filePath}，请先从 GitHub 主仓读取。`);
  }

  async writeFilesBatch(files: RepositoryFileMutation[], summary: RepositoryCommitSummary): Promise<RepositoryWriteResult> {
    throw new Error(
      `国内仓适配器当前不支持主写入，试图写入 ${files.length} 个文件失败。请先写 GitHub 主仓。提交摘要：${summary.title}`
    );
  }

  async syncWorkspace(plan: RepositorySyncPlan): Promise<RepositoryWriteResult> {
    return {
      provider: this.provider,
      repository: this.repository,
      branch: this.branch,
      changedPaths: plan.relativePaths.map((relativePath) => normalizeRelativePath(relativePath))
    };
  }
}

export function createRepositoryAdapters(options: {
  github?: GitHubRepositoryAdapterConfig;
  cn?: CnRepositoryAdapterConfig;
} = {}) {
  return {
    github: new GitHubRepositoryAdapter(options.github),
    cn: new CnRepositoryAdapter(options.cn)
  };
}
