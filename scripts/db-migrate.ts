/**
 * Applies supabase/migrations/*.sql to the database in DATABASE_URL, in file
 * order, each exactly once (tracked in the `_migrations` table). Safe to
 * re-run: already-applied files are skipped.
 *
 * Usage: npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { connect } from "./lib/db";

async function main() {
  const sql = connect();
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table _migrations enable row level security`;
  const applied = new Set((await sql`select name from _migrations`).map((r) => r.name as string));

  const dir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(resolve(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${file})`;
    });
    console.log(`applied  ${file}`);
    ran++;
  }
  console.log(ran ? `Done: ${ran} migration(s) applied.` : "Database is already up to date.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
