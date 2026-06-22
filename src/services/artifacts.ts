import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_ARTIFACT_ROOT = "storage/jobs";
const SECRET_KEY_PATTERN = /(api[_-]?key|access[_-]?token|password|secret|smtp[_-]?pass|authorization)/i;

export function getArtifactRoot(): string {
  return process.env.ARTIFACT_ROOT?.trim() || DEFAULT_ARTIFACT_ROOT;
}

export function resolveArtifactPath(jobId: number, unsafeRelativePath = ""): string {
  const root = path.resolve(process.cwd(), getArtifactRoot());
  const jobDir = path.resolve(root, String(jobId));
  const resolved = path.resolve(jobDir, unsafeRelativePath);
  const relative = path.relative(jobDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Artifact path is outside the job artifact directory.");
  }
  return resolved;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(item);
    }
    return redacted;
  }
  return value;
}

export async function ensureJobArtifactDir(jobId: number): Promise<string> {
  const dir = resolveArtifactPath(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJsonArtifact(jobId: number, relativePath: string, value: unknown): Promise<string> {
  const filePath = resolveArtifactPath(jobId, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(redactSecrets(value), null, 2)}\n`, "utf8");
  return filePath;
}

export async function writeTextArtifact(jobId: number, relativePath: string, value: string): Promise<string> {
  const filePath = resolveArtifactPath(jobId, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
  return filePath;
}

export async function writeBinaryArtifact(jobId: number, relativePath: string, value: Buffer): Promise<string> {
  const filePath = resolveArtifactPath(jobId, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value);
  return filePath;
}

export async function writeArtifactBestEffort(jobId: number | undefined, relativePath: string, value: unknown): Promise<void> {
  if (!jobId) {
    return;
  }
  try {
    await writeJsonArtifact(jobId, relativePath, value);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown artifact write error";
    console.warn(`artifact write skipped: ${message}`);
  }
}

export async function writeTextArtifactBestEffort(
  jobId: number | undefined,
  relativePath: string,
  value: string
): Promise<void> {
  if (!jobId) {
    return;
  }
  try {
    await writeTextArtifact(jobId, relativePath, value);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown artifact write error";
    console.warn(`artifact write skipped: ${message}`);
  }
}
