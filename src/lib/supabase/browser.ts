"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client with the public anon key. It can't read or write
 * any table (RLS is on with no policies — see supabase/migrations/0001_init.sql);
 * it's only used to receive live order signals and to upload a photo to a
 * signed URL the server handed out.
 */

/** False until the NEXT_PUBLIC_SUPABASE_* keys are set in .env.local. */
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

let client: SupabaseClient | undefined;

export function supabaseBrowser(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
