// Applies pending SQL migrations from scripts/db/migrations in filename order.
// Usage: pnpm db:migrate
// Reads the connection string from the DATABASE_MIGRATE_URL environment
// variable, falling back to DATABASE_URL. Point it at the Supabase SESSION
// connection (port 5432) — DDL through the transaction pooler is unreliable.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_MIGRATE_URL (or DATABASE_URL) to run migrations.");
  process.exit(1);
}

const migrationsDir = path.join(process.cwd(), "scripts/db/migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const sql = postgres(connectionString, { max: 1, prepare: false });

try {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  const applied = new Set((await sql`select name from schema_migrations`).map((row) => row.name));
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const statements = readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`applying ${file} ...`);
    await sql.begin(async (transaction) => {
      await transaction.unsafe(statements);
      await transaction`insert into schema_migrations (name) values (${file})`;
    });
    ran += 1;
  }
  console.log(ran === 0 ? "No pending migrations." : `Applied ${ran} migration(s).`);
} finally {
  await sql.end({ timeout: 5 });
}
