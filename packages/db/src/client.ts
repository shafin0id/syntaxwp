import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — see LOCAL-DEVELOPMENT-SETUP.md §4");
  }
  return url;
}

export const sql = postgres(requireDatabaseUrl());
export const db = drizzle(sql, { schema });
export type Database = typeof db;
