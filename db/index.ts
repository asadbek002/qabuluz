import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;

export function getDb() {
  if (database) return database;
  // Either DATABASE_URL or the standard PGHOST/PGUSER/PGPASSWORD/PGDATABASE variables
  // (the latter let the password contain characters such as # or @ without URL-encoding).
  const url = process.env.DATABASE_URL;
  if (!url && !process.env.PGHOST) throw new Error("DATABASE_URL or PGHOST environment variable is required.");
  const options = { max: 5, idle_timeout: 20, connect_timeout: 10 };
  client = url ? postgres(url, options) : postgres(options);
  database = drizzle(client, { schema });
  return database;
}
