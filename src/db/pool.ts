import { Pool } from "pg";
import { loadConfig } from "../config/env";

const cfg = loadConfig();

export const pool = new Pool({
  host: cfg.pgHost,
  port: cfg.pgPort,
  database: cfg.pgDatabase,
  user: cfg.pgUser,
  password: cfg.pgPassword,
});
