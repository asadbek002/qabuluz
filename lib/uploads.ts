import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

export async function saveUpload(key: string, bytes: Uint8Array) {
  const target = resolveUpload(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}

export async function readUpload(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveUpload(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Remove every file stored for one application (used when saving the record fails). */
export async function removeApplicationUploads(applicationId: string) {
  await rm(resolveUpload(`applications/${applicationId}`), { recursive: true, force: true });
}

const signatures: { type: string; ext: string; bytes: number[] }[] = [
  { type: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Detect the real file type from its first bytes instead of trusting the browser. */
export function detectFileType(bytes: Uint8Array) {
  return signatures.find((s) => s.bytes.every((b, i) => bytes[i] === b)) || null;
}
