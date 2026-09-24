/**
 * Loads the test catalog ("Sharma General Store", 106 products with photos
 * from test-shop/) into the database in DATABASE_URL.
 *
 *   npm run seed:test-shop
 *       Creates/updates the shop (owned by a placeholder account) and its
 *       products. Safe to re-run: rows are upserted by fixed ids, nothing
 *       is deleted.
 *   npm run seed:test-shop -- --claim
 *       After you sign in on the app and pick "Shop owner": makes that
 *       newest shop-owner account the owner of Sharma General Store, so you
 *       can test the dashboard with real data. Their own empty draft shop is
 *       kept, just detached from the account (never deleted); an account
 *       that already has a LIVE shop is left alone.
 */
import { readFileSync } from "node:fs";
import { geohashForLocation } from "geofire-common";
import { connect } from "./lib/db";

const sql = connect();
const SHOP_ID = "sharma-general-store";
const PLACEHOLDER_OWNER = "seed-owner";

async function seedShop() {
  const details = JSON.parse(readFileSync("test-shop/shop-details.json", "utf8"));
  const items = JSON.parse(readFileSync("test-shop/inventory-with-images.json", "utf8")) as Record<string, unknown>[];
  const now = Date.now();
  const { lat, lng, address } = details.location;

  await sql.begin(async (tx) => {
    await tx`
      insert into shops ${tx({
        id: SHOP_ID,
        ownerId: PLACEHOLDER_OWNER,
        status: "live",
        onboardingStep: 4,
        isOpen: true,
        type: details.type,
        name: details.name,
        phone: details.phone,
        hours: tx.json(details.hours),
        location: tx.json({ lat, lng, address, geohash: geohashForLocation([lat, lng]), localityId: "bus-stand-area" }),
        itemCount: items.length,
        createdAt: now,
        updatedAt: now,
      })}
      on conflict (id) do update set
        status = excluded.status, is_open = excluded.is_open, type = excluded.type, name = excluded.name,
        phone = excluded.phone, hours = excluded.hours, location = excluded.location,
        item_count = excluded.item_count, updated_at = excluded.updated_at
    `;

    const rows = items.map((item, i) => {
      const stock = Number(item.stock ?? 0);
      return {
        id: `${SHOP_ID}-p${String(i + 1).padStart(3, "0")}`,
        shopId: SHOP_ID,
        name: String(item.name),
        price: Math.round(Number(item.price) * 100),
        unit: String(item.unit),
        category: String(item.category),
        stock,
        inStock: stock > 0,
        imageUrl: (item.imageUrl as string | undefined) ?? null,
        brand: (item.brand as string | undefined) || null,
        description: (item.description as string | undefined) || null,
        mrp: item.mrp ? Math.round(Number(item.mrp) * 100) : null,
        aliases: Array.isArray(item.aliases) && item.aliases.length ? (item.aliases as string[]) : null,
        lastRestockedAt: stock > 0 ? now : null,
        updatedAt: now - i, // keep file order in the "newest first" lists
      };
    });
    await tx`
      insert into products ${tx(rows)}
      on conflict (id) do update set
        name = excluded.name, price = excluded.price, unit = excluded.unit, category = excluded.category,
        stock = excluded.stock, in_stock = excluded.in_stock, image_url = excluded.image_url,
        brand = excluded.brand, description = excluded.description, mrp = excluded.mrp,
        aliases = excluded.aliases, last_restocked_at = excluded.last_restocked_at, updated_at = excluded.updated_at
    `;
  });
  console.log(`Seeded "${details.name}" with ${items.length} products (shop id: ${SHOP_ID}).`);
}

async function claim() {
  const [owner] = await sql`
    select id, name, phone from users where role = 'shop_owner' order by created_at desc limit 1
  `;
  if (!owner) {
    console.error('No shop-owner account yet. Sign in on the app, pick "Shop owner", then run this again.');
    process.exit(1);
  }
  await sql.begin(async (tx) => {
    const [theirs] = await tx`select id, name, status from shops where owner_id = ${owner.id} and id <> ${SHOP_ID}`;
    if (theirs?.status === "live") {
      console.error(`That account already has a live shop (${theirs.name}); not changing anything.`);
      process.exit(1);
    }
    // One shop per owner: move their empty draft aside (kept, not deleted).
    if (theirs) await tx`update shops set owner_id = ${`detached:${owner.id}:${theirs.id}`} where id = ${theirs.id}`;
    await tx`update shops set owner_id = ${owner.id}, updated_at = ${Date.now()} where id = ${SHOP_ID}`;
  });
  console.log(`Sharma General Store now belongs to ${owner.name || owner.phone || owner.id}.`);
}

async function main() {
  await seedShop();
  if (process.argv.includes("--claim")) await claim();
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
