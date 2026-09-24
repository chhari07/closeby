/**
 * Gives shop products that have no photo an image from test-shop/images/.
 *
 * Default: imageUrl points at the copy in public/inventory-samples/photos/
 * (served by the app itself; no Storage needed). --upload instead puts each
 * image in Supabase Storage (the product-images bucket).
 *
 * A product matches an image when its name equals an inventory.json item name
 * (case-insensitive). Products that already have an imageUrl are never
 * touched, so an owner's own photo always wins.
 *
 * Usage:
 *   npx tsx scripts/attach-product-images.ts              # dry run: list what would change
 *   npx tsx scripts/attach-product-images.ts --apply      # write imageUrl
 *   npx tsx scripts/attach-product-images.ts --apply --shop <shopId>
 *   npx tsx scripts/attach-product-images.ts --apply --upload   # Supabase Storage
 *
 * Requires DATABASE_URL (and for --upload NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY) in .env.local.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { connect } from "./lib/db";

const sql = connect();

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

/** Same path shape as the app's own uploads (createProductImageUpload). */
async function upload(shopId: string, productId: string, file: string): Promise<string> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const bucket = supabase.storage.from("product-images");
  const path = `shops/${shopId}/products/${productId}/${Date.now()}.jpg`;
  const { error } = await bucket.upload(path, readFileSync(file), { contentType: "image/jpeg" });
  if (error) throw error;
  return bucket.getPublicUrl(path).data.publicUrl;
}

async function main() {
  console.log(`${imageByName.size} local images. Mode: ${APPLY ? "APPLY" : "dry run"}\n`);
  const shops = onlyShop
    ? await sql`select id, name from shops where id = ${onlyShop}`
    : await sql`select id, name from shops`;
  let total = 0;
  for (const shop of shops) {
    const products = await sql`select id, name, image_url from products where shop_id = ${shop.id}`;
    const todo = products.filter((p) => !p.imageUrl && imageByName.has(String(p.name ?? "").trim().toLowerCase()));
    const noImage = products.filter((p) => !p.imageUrl).length;
    console.log(`${shop.name ?? shop.id} (${shop.id}): ${products.length} products, ${noImage} without image, ${todo.length} will get one`);
    for (const p of todo) {
      const name = String(p.name);
      if (!APPLY) {
        console.log(`  would set  ${name}`);
        continue;
      }
      const file = imageByName.get(name.trim().toLowerCase())!;
      const url = UPLOAD ? await upload(shop.id, p.id, file) : `/inventory-samples/photos/${basename(file)}`;
      await sql`update products set image_url = ${url}, updated_at = ${Date.now()} where id = ${p.id}`;
      console.log(`  set        ${name}`);
    }
    total += todo.length;
  }
  console.log(`\n${APPLY ? "Updated" : "Would update"} ${total} products.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
