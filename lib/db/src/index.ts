import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const pool: pg.Pool | null = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const db: NodePgDatabase<typeof schema> | null = pool
  ? drizzle(pool, { schema })
  : null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  return db;
}

export * from "./schema";
