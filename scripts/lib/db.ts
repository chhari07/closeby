/**
 * Shared setup for the scripts/ folder, which runs outside Next.js: loads
 * .env.local / .env by hand and opens the same kind of Postgres connection
 * as src/lib/db/client.ts (camelCase <-> snake_case columns, bigint as number).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    let content: string;
    try {
      content = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!key || process.env[key]) continue; // .env.local wins over .env
      process.env[key] = rawValue!.replace(/^"|"$/g, "");
    }
  }
}

export function connect() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL in .env.local (Supabase dashboard > Connect > Transaction pooler).");
    process.exit(1);
  }
  return postgres(url, {
    prepare: false,
    max: 1,
    onnotice: () => {},
    transform: { column: { from: postgres.toCamel, to: postgres.fromCamel }, undefined: null },
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}
