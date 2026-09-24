"use client";

import { createProductImageUpload } from "@/actions/products";
import { supabaseBrowser } from "./browser";

const PRODUCT_IMAGES_BUCKET = "product-images";

/** Uploads a product photo and returns its public URL (same contract as the old Firebase helper). */
export async function uploadProductImage(shopId: string, productId: string, file: File): Promise<string> {
  const target = await createProductImageUpload(shopId, productId, file.name, file.type);
  if (!target.ok || !target.data) throw new Error(target.error ?? "Could not start upload");
  const { error } = await supabaseBrowser()
    .storage.from(PRODUCT_IMAGES_BUCKET)
    .uploadToSignedUrl(target.data.path, target.data.token, file, { contentType: file.type });
  if (error) throw error;
  return target.data.publicUrl;
}
