import { pool } from "../db/pool";
import { createAdminApp } from "../server/adminApp";

export function getAdminHost(): string {
  return process.env.ADMIN_HOST?.trim() || "127.0.0.1";
}

export function getAdminPort(): number {
  const raw = process.env.ADMIN_PORT?.trim() || "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Invalid ADMIN_PORT.");
  }
  return port;
}

if (require.main === module) {
  const app = createAdminApp();
  const host = getAdminHost();
  const port = getAdminPort();
  app.listen(port, host, () => {
    console.log(`Admin server listening on http://${host}:${port}`);
  });

  const shutdown = async () => {
    app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
