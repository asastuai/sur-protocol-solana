import pg from "pg";
import { config } from "./config.js";

// Single shared pool. Schema lives in db/schema.sql (`npm run migrate`).
export const db = new pg.Pool({ connectionString: config.databaseUrl });
