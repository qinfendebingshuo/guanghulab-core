import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDirForFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await ensureDirForFile(filePath);
      await writeJsonFile(filePath, fallback);
      return fallback;
    }

    throw error;
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDirForFile(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}
