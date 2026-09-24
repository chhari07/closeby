/**
 * Gives shop products that have no photo an image from test-shop/images/.
 *
 * Default: imageUrl points at the copy in public/inventory-samples/photos/
 * (served by the app itself; no Storage needed). --upload instead puts each
 * image in Firebase Storage, which must be enabled on the project first.
 *
 * A product matches an image when its name equals an inventory.json item name
 * (case-insensitive). Products that already have an imageUrl are never
 * touched, so an owner's own photo always wins.
 *
 * Usage:
 *   npx tsx scripts/attach-product-images.ts              # dry run: list what would change
 *   npx tsx scripts/attach-product-images.ts --apply      # upload + write imageUrl
 *   npx tsx scripts/attach-product-images.ts --apply --shop <shopId>
 *   npx tsx scripts/attach-product-images.ts --apply --upload   # Firebase Storage
 *
 * Requires FIREBASE_ADMIN_* and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in .env /
 * .env.local (loaded manually below since this runs outside Next.js).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function loadEnv() {
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
      if (!key || process.env[key]) continue;
      process.env[key] = rawValue!.replace(/^"|"$/g, "");
    }
  }
}
loadEnv();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const UPLOAD = args.includes("--upload");
const onlyShop = args.includes("--shop") ? args[args.indexOf("--shop") + 1] : undefined;

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const inventory: { name: string }[] = JSON.parse(readFileSync("test-shop/inventory.json", "utf8"));
const imageByName = new Map<string, string>();
for (const { name } of inventory) {
  const file = resolve("test-shop/images", `${slug(name)}.jpg`);
  if (existsSync(file)) imageByName.set(name.trim().toLowerCase(), file);
}

const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  storageBucket: bucketName,
});
const db = getFirestore();
const bucket = getStorage().bucket();

/** Same path shape and token-style URL as the client's uploadProductImage. */
async function upload(shopId: string, productId: string, file: string): Promise<string> {
  const path = `shops/${shopId}/products/${productId}/${Date.now()}.jpg`;
  const token = randomUUID();
  await bucket.upload(file, {
    destination: path,
    metadata: { contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function main() {
  console.log(`${imageByName.size} local images. Mode: ${APPLY ? "APPLY" : "dry run"}\n`);
  const shops = onlyShop ? [await db.collection("shops").doc(onlyShop).get()] : (await db.collection("shops").get()).docs;
  let total = 0;
  for (const shop of shops) {
    if (!shop.exists) continue;
    const products = await shop.ref.collection("products").get();
    const todo = products.docs.filter((p) => {
      const d = p.data();
      return !d.imageUrl && imageByName.has(String(d.name ?? "").trim().toLowerCase());
    });
    const noImage = products.docs.filter((p) => !p.data().imageUrl).length;
    console.log(`${shop.data()?.name ?? shop.id} (${shop.id}): ${products.size} products, ${noImage} without image, ${todo.length} will get one`);
    for (const p of todo) {
      const name = String(p.data().name);
      if (!APPLY) {
        console.log(`  would set  ${name}`);
        continue;
      }
      const file = imageByName.get(name.trim().toLowerCase())!;
      const url = UPLOAD ? await upload(shop.id, p.id, file) : `/inventory-samples/photos/${basename(file)}`;
      await p.ref.update({ imageUrl: url, updatedAt: Date.now() });
      console.log(`  set        ${name}`);
    }
    total += todo.length;
  }
  console.log(`\n${APPLY ? "Updated" : "Would update"} ${total} products.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
