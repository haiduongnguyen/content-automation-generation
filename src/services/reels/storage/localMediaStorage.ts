import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MediaStorage, StoredMedia } from "./types";

const DEFAULT_MEDIA_STORAGE_ROOT = "storage/media";

function mediaOwner(): { uid: number; gid: number } | null {
  const uid = Number(process.env.MEDIA_OWNER_UID || "1000");
  const gid = Number(process.env.MEDIA_OWNER_GID || "1000");
  if (!Number.isInteger(uid) || uid < 0 || !Number.isInteger(gid) || gid < 0) {
    return null;
  }
  return { uid, gid };
}

export async function applyMediaOwnership(filePath: string): Promise<void> {
  const owner = mediaOwner();
  if (!owner || typeof process.getuid !== "function" || process.getuid() !== 0) {
    return;
  }
  await fs.chown(filePath, owner.uid, owner.gid);
}

export async function ensureMediaDirectory(directoryPath: string, root = getMediaStorageRoot()): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, path.resolve(directoryPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Media directory is outside MEDIA_STORAGE_ROOT.");
  }
  let current = resolvedRoot;
  await applyMediaOwnership(current);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    await applyMediaOwnership(current);
  }
}

export function getMediaStorageRoot(): string {
  return path.resolve(process.cwd(), process.env.MEDIA_STORAGE_ROOT?.trim() || DEFAULT_MEDIA_STORAGE_ROOT);
}

export function normalizeMediaKey(unsafeKey: string): string {
  const normalized = unsafeKey.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.endsWith("/")) {
    throw new Error("Media key must point to a file or directory name.");
  }
  return normalized;
}

export function resolveMediaPath(unsafeKey: string, root = getMediaStorageRoot()): string {
  const key = normalizeMediaKey(unsafeKey);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, key);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Media path is outside MEDIA_STORAGE_ROOT.");
  }
  return resolved;
}

async function sha256File(filePath: string): Promise<string> {
  const contents = await fs.readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly root = getMediaStorageRoot()) {}

  resolve(key: string): string {
    return resolveMediaPath(key, this.root);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async ensureDirectory(key: string): Promise<string> {
    const directory = this.resolve(key);
    await ensureMediaDirectory(directory, this.root);
    return directory;
  }

  async saveFile(sourcePath: string, key: string): Promise<StoredMedia> {
    const destination = this.resolve(key);
    await ensureMediaDirectory(path.dirname(destination), this.root);
    await fs.copyFile(sourcePath, destination);
    await applyMediaOwnership(destination);
    const stat = await fs.stat(destination);
    return {
      key: normalizeMediaKey(key),
      absolutePath: destination,
      sizeBytes: stat.size,
      sha256: await sha256File(destination),
    };
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}
