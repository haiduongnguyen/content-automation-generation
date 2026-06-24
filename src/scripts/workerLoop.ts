import { pool } from "../db/pool";
import { secondsToMs } from "../services/serverScheduler";
import { workerOnce } from "./workerOnce";

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid numeric env var: ${name}`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function workerLoop(): Promise<void> {
  const pollMs = secondsToMs(getNumberEnv("WORKER_POLL_SECONDS", 30));
  console.log(JSON.stringify({ worker: "started", pollSeconds: pollMs / 1000 }, null, 2));

  while (true) {
    try {
      await workerOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown worker loop error";
      console.error("worker loop error", message);
    }
    await sleep(pollMs);
  }
}

if (require.main === module) {
  workerLoop()
    .catch((err) => {
      console.error("worker:loop failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
