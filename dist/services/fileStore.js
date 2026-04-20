import fs from "node:fs/promises";
import path from "node:path";
export async function ensureDirForFile(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}
export async function readJsonFile(filePath, fallback) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            await ensureDirForFile(filePath);
            await writeJsonFile(filePath, fallback);
            return fallback;
        }
        throw error;
    }
}
export async function writeJsonFile(filePath, data) {
    await ensureDirForFile(filePath);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}
//# sourceMappingURL=fileStore.js.map