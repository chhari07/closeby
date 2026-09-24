import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PRODUCT_IMAGES_BUCKET = "product-images";

let admin: SupabaseClient | undefined;

/**
 * Server-only Supabase client with the secret (service role) key — used for
 * Storage only; database reads/writes go through src/lib/db/client.ts.
 * Lazy so importing this during `next build` needs no real keys.
 */
export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** A one-time signed upload URL for `path` in the product photo bucket, plus the file's public URL. */
export async function productImageUploadTarget(
  path: string,
): Promise<{ path: string; token: string; publicUrl: string }> {
  const bucket = supabaseAdmin().storage.from(PRODUCT_IMAGES_BUCKET);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not start upload: ${error?.message ?? "unknown error"}`);
  return { path: data.path, token: data.token, publicUrl: bucket.getPublicUrl(data.path).data.publicUrl };
}
