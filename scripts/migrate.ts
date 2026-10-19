// Applies pending SQL migrations from ./drizzle. Bundled into dist/migrate.mjs at build
// time so the production image does not need drizzle-kit or the dev dependencies.
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url && !process.env.PGHOST) {
  console.error("DATABASE_URL or PGHOST environment variable is required.");
  process.exit(1);
}

const migrationsFolder = path.resolve(process.env.MIGRATIONS_DIR || "./drizzle");
const attempts = Number(process.env.MIGRATE_RETRIES || 30);

for (let attempt = 1; ; attempt++) {
  const options = { max: 1, connect_timeout: 10, onnotice: () => {} };
  const client = url ? postgres(url, options) : postgres(options);
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("Database migrations applied.");
    await client.end();
    break;
  } catch (error) {
    await client.end({ timeout: 1 }).catch(() => {});
    const code = (error as { code?: string }).code;
    const retryable = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "CONNECT_TIMEOUT", "57P03"].includes(code || "");
    if (!retryable || attempt >= attempts) {
      console.error("Database migration failed:", error);
      process.exit(1);
    }
    console.log(`Database is not reachable yet (${code}), retrying in 2s... [${attempt}/${attempts}]`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
