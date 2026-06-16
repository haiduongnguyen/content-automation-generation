import { Pool } from "pg";
import { loadDbConfig } from "../config/env";

const cfg = loadDbConfig();

export const pool = new Pool({
  host: cfg.pgHost,
  port: cfg.pgPort,
  database: cfg.pgDatabase,
  user: cfg.pgUser,
  password: cfg.pgPassword,
});
