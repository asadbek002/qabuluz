import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");

function resolveUpload(key: string) {
  const normalized = key.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid upload key.");
  }
  const target = path.resolve(uploadRoot, normalized);
  if (!target.startsWith(`${uploadRoot}${path.sep}`)) throw new Error("Invalid upload path.");
  return target;
}

export async function saveUpload(key: string, file: File) {
  const target = resolveUpload(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
}

export async function readUpload(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveUpload(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
