/**
 * Loads the test catalog into the LOCAL Firebase emulator (never the real
 * project — it refuses to run unless it's pointed at the emulator).
 *
 *   npm run dev:emu            # terminal 1
 *   npm run seed:emu           # terminal 2: localities + "Sharma General Store" (106 products, with photos)
 *   npm run seed:emu -- --claim
 *       After you sign in on the local app and pick "Shop owner": makes that
 *       newest shop-owner account the owner of Sharma General Store (its empty
 *       draft shop is removed), so you can test the dashboard with real data.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { geohashForLocation } from "geofire-common";

const EMULATOR = "127.0.0.1:8080";
process.env.FIRESTORE_EMULATOR_HOST ??= EMULATOR;
if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) {
  console.error(`Refusing to seed: FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST} is not local.`);
  process.exit(1);
}

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    let content = "";
    try {
      content = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]!] = m[2]!.replace(/^"|"$/g, ""); // .env.local wins
    }
  }
  return env;
}

const env = readEnv();
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? env.FIREBASE_ADMIN_PROJECT_ID;
if (!projectId) {
  console.error("Set NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env first.");
  process.exit(1);
}

// No credential needed: the emulator accepts any caller.
const db = getFirestore(initializeApp({ projectId }));
const SHOP_ID = "sharma-general-store";
const PLACEHOLDER_OWNER = "seed-owner";

async function seedShop() {
  const details = JSON.parse(readFileSync("test-shop/shop-details.json", "utf8"));
  const items = JSON.parse(readFileSync("test-shop/inventory-with-images.json", "utf8")) as Record<string, unknown>[];
  const now = Date.now();
  const shopRef = db.collection("shops").doc(SHOP_ID);
  const existing = await shopRef.get();

  const { lat, lng, address } = details.location;
  await shopRef.set({
    ownerId: existing.data()?.ownerId ?? PLACEHOLDER_OWNER,
    status: "live",
    onboardingStep: 4,
    isOpen: true,
    type: details.type,
    name: details.name,
    phone: details.phone,
    hours: details.hours,
    location: { lat, lng, address, geohash: geohashForLocation([lat, lng]), localityId: "bus-stand-area" },
    itemCount: items.length,
    orderCount: existing.data()?.orderCount ?? 0,
    pendingOrderCount: existing.data()?.pendingOrderCount ?? 0,
    createdAt: existing.data()?.createdAt ?? now,
    updatedAt: now,
  });

  // Replace the catalog wholesale so re-running never duplicates products.
  const old = await shopRef.collection("products").get();
  const batch = db.batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  items.forEach((item, i) => {
    const stock = Number(item.stock ?? 0);
    batch.set(shopRef.collection("products").doc(`p${String(i + 1).padStart(3, "0")}`), {
      name: item.name,
      price: Math.round(Number(item.price) * 100),
      unit: item.unit,
      category: item.category,
      stock,
      inStock: stock > 0,
      imageUrl: item.imageUrl ?? null,
      ...(item.brand ? { brand: item.brand } : {}),
      ...(item.description ? { description: item.description } : {}),
      ...(item.mrp ? { mrp: Math.round(Number(item.mrp) * 100) } : {}),
      ...(Array.isArray(item.aliases) && item.aliases.length ? { aliases: item.aliases } : {}),
      ...(stock > 0 ? { lastRestockedAt: now } : {}),
      updatedAt: now - i, // keep file order in the "newest first" lists
    });
  });
  await batch.commit();
  console.log(`Seeded "${details.name}" with ${items.length} products (shop id: ${SHOP_ID}).`);
}

async function claim() {
  const owners = await db.collection("users").where("role", "==", "shop_owner").get();
  // createdAt may be a number or a Firestore Timestamp depending on how the account was made.
  const millis = (v: unknown) =>
    typeof v === "number" ? v : typeof (v as { toMillis?: unknown })?.toMillis === "function" ? (v as { toMillis(): number }).toMillis() : 0;
  const newest = owners.docs.sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt))[0];
  if (!newest) {
    console.error('No shop-owner account yet. Sign in on the local app, pick "Shop owner", then run this again.');
    process.exit(1);
  }
  // getMyShop() returns the owner's first shop — drop their empty draft so Sharma is the one they get.
  const theirs = await db.collection("shops").where("ownerId", "==", newest.id).get();
  for (const shop of theirs.docs) {
    if (shop.id === SHOP_ID) continue;
    if (shop.data().status === "live") {
      console.error(`That account already has a live shop (${shop.data().name}); not changing anything.`);
      process.exit(1);
    }
    await db.recursiveDelete(shop.ref);
  }
  await db.collection("shops").doc(SHOP_ID).update({ ownerId: newest.id, updatedAt: Date.now() });
  console.log(`Sharma General Store now belongs to ${newest.data().email ?? newest.data().phone ?? newest.id}.`);
}

async function main() {
  // Localities (area picker / nearest-locality lookup) via the existing seeder, pointed at the emulator.
  execFileSync("npx", ["tsx", "scripts/seed-localities.ts"], {
    stdio: "inherit",
    env: { ...process.env, ...env, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST },
  });
  await seedShop();
  if (process.argv.includes("--claim")) await claim();
}

main().catch((err) => {
  if (String(err).includes("ECONNREFUSED")) {
    console.error("Can't reach the emulator — start it first with `npm run dev:emu`.");
  } else {
    console.error(err);
  }
  process.exit(1);
});
