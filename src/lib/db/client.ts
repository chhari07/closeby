import "server-only";
import postgres from "postgres";

/**
 * The server's connection to Supabase Postgres (replaces the Firebase Admin
 * SDK). Every read and write in src/actions/* and src/lib/* goes through
 * this, after the caller's own Clerk auth + ownership checks — the browser
 * never talks to the database directly (see supabase/migrations/0001_init.sql).
 *
 * - Column names are snake_case in SQL and camelCase in JS: result rows and
 *   `sql(obj)` inserts/updates are converted both ways. jsonb columns must be
 *   passed as `sql.json(value)`.
 * - bigint (epoch-ms timestamps) comes back as a plain number, not a string.
 * - Lazy, and kept on globalThis so dev hot reloads don't open a new pool
 *   each time (same reason src/lib/firebase/admin.ts was lazy: importing
 *   this during `next build` must not need real credentials).
 */

type Sql = postgres.Sql<{ bigint: number }>;

const globalForDb = globalThis as unknown as { __closebySql?: Sql };

function createSql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL. Set it in .env.local (Supabase dashboard > Connect > Transaction pooler).",
    );
  }
  return postgres(url, {
    // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
    prepare: false,
    max: 5,
    idle_timeout: 20,
    // Column names only — jsonb contents (hours, location, items, AI drafts)
    // are stored exactly as the app wrote them and come back untouched.
    transform: {
      column: { from: postgres.toCamel, to: postgres.fromCamel },
      undefined: null,
    },
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  });
}

export function db(): Sql {
  globalForDb.__closebySql ??= createSql();
  return globalForDb.__closebySql;
}

/** A transaction handle, for helpers that take either `db()` or a `tx`. */
export type Tx = postgres.TransactionSql<{ bigint: number }>;
