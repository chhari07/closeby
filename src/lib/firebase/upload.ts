"use client";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseStorage } from "./client";

export async function uploadProductImage(
  shopId: string,
  productId: string,
  file: File
): Promise<string> {
  const path = `shops/${shopId}/products/${productId}/${Date.now()}-${file.name}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
