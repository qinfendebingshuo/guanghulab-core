import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RepositoryFileMutation } from "@guanghu/contracts";

function normalizeWorkspacePath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath).replace(/^\/+/, "");

  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new Error(`非法工作区路径：${relativePath}`);
  }

  return normalized;
}

export async function createTaskWorkspace(baseDir: string, taskId: string): Promise<string> {
  await mkdir(baseDir, { recursive: true });
  return mkdtemp(path.join(baseDir, `${taskId}-`));
}

export async function materializeMutations(workspaceDir: string, files: RepositoryFileMutation[]): Promise<void> {
  await Promise.all(
    files
      .filter((file) => file.action === "upsert")
      .map(async (file) => {
        const targetPath = path.join(workspaceDir, normalizeWorkspacePath(file.path));
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, file.content ?? "", "utf8");
      })
  );
}

export async function cleanupTaskWorkspace(workspaceDir?: string): Promise<void> {
  if (!workspaceDir) {
    return;
  }

  await rm(workspaceDir, { recursive: true, force: true });
}
