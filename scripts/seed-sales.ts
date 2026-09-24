/**
 * Test data for the owner's AI ideas (tests/ai/shop-ideas-manual-checklist.md):
 * 30 days of COMPLETED sales for one shop, so restock / price / slow-item
 * ideas have history to work from.
 *
 *   npm run seed:sales                     # the only live shop (or the first one)
 *   npm run seed:sales -- --shop <shopId>
 *   npm run seed:sales -- --undo           # delete these test orders, restore the stock
 *
 * What it does (all printed as it goes):
 * - picks a fast seller (~3/day) and a steady seller (~2/day) and lowers
 *   their stock to 4 and 3 -> restock ideas;
 * - picks a product priced under MRP with plenty of stock and sells ~1.5/day
 *   -> a possible price idea;
 * - sells a little of a few others; everything else sells nothing -> slow items.
 * Orders belong to "Test buyer (sales history)" and never touch stock.
 * Undo info is kept in .seed-sales-undo.json (git-ignored).
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "./lib/db";

const sql = connect();
const BUYER_ID = "test-sales-buyer";
const BUYER_NAME = "Test buyer (sales history)";
const UNDO_FILE = ".seed-sales-undo.json";
const DAY = 86_400_000;

interface Undo {
  shopId: string;
  stock: { productId: string; name: string; stock: number; inStock: boolean }[];
}

type Product = { id: string; name: string; unit: string; price: number; mrp: number | null; stock: number; inStock: boolean };

/** Deterministic pseudo-random, so the same shop always gets the same history. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

async function undo() {
  if (!existsSync(UNDO_FILE)) {
    console.log("Nothing to undo (no .seed-sales-undo.json).");
    return;
  }
  const info = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as Undo;
  await sql.begin(async (tx) => {
    const deleted = await tx`delete from orders where buyer_id = ${BUYER_ID} and shop_id = ${info.shopId} returning id`;
    for (const s of info.stock) {
      await tx`update products set stock = ${s.stock}, in_stock = ${s.inStock}, updated_at = ${Date.now()} where id = ${s.productId}`;
      console.log(`restored  ${s.name}: stock back to ${s.stock}`);
    }
    console.log(`deleted   ${deleted.length} test orders`);
  });
  unlinkSync(UNDO_FILE);
  console.log("Undone. (Refresh the dashboard; product lists refresh within 10 minutes or on the next edit.)");
}

async function seed(shopArg?: string) {
  if (existsSync(UNDO_FILE)) {
    console.error("Test sales are already seeded. Run `npm run seed:sales -- --undo` first.");
    process.exit(1);
  }
  const [shop] = shopArg
    ? await sql`select id, name from shops where id = ${shopArg}`
    : await sql`select id, name from shops where status = 'live' order by created_at limit 1`;
  if (!shop) {
    console.error(shopArg ? `No shop with id ${shopArg}.` : "No live shop found. Pass --shop <shopId>.");
    process.exit(1);
  }
  const products = (await sql`
    select id, name, unit, price, mrp, stock, in_stock from products where shop_id = ${shop.id} order by name
  `) as unknown as Product[];
  if (products.length < 6) {
    console.error("The shop needs at least 6 products.");
    process.exit(1);
  }

  const byName = (n: string) => products.find((p) => p.name.toLowerCase() === n.toLowerCase());
  const taken = new Set<string>();
  const pick = (preferred: string, fallback: (p: Product) => boolean): Product => {
    const p = byName(preferred) ?? products.find((q) => !taken.has(q.id) && fallback(q)) ?? products.find((q) => !taken.has(q.id))!;
    taken.add(p.id);
    return p;
  };
  const fast = pick("LED Bulb 9 W", (p) => p.price < 50000);
  const steady = pick("AA Batteries", (p) => p.price < 50000);
  const priceable = pick("USB-C Cable", (p) => !!p.mrp && p.mrp > p.price && p.stock >= 20);
  const light = products.filter((p) => !taken.has(p.id)).slice(0, 4);

  // [product, units over 30 days]
  const plan: [Product, number][] = [[fast, 90], [steady, 60], [priceable, 45], ...light.map((p, i) => [p, 3 + i * 2] as [Product, number])];

  const now = Date.now();
  const random = rng(42);
  const orders: Record<string, unknown>[] = [];
  // Spread each product's units over the last 29 days, a few per order.
  for (let day = 29; day >= 0; day--) {
    const lines = plan
      .map(([p, total]) => {
        const perDay = total / 30;
        const qty = Math.floor(perDay) + (random() < perDay % 1 ? 1 : 0);
        return qty > 0 ? { productId: p.id, name: p.name, unit: p.unit, price: p.price, qty } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    if (lines.length === 0) continue;
    const placed = now - day * DAY - Math.floor(random() * 8 * 3600_000) - 3600_000;
    const itemTotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    orders.push({
      buyerId: BUYER_ID,
      shopId: shop.id,
      shopName: shop.name,
      buyerName: BUYER_NAME,
      buyerPhone: "0000000000",
      items: sql.json(lines),
      itemTotal,
      status: "COMPLETED",
      timeline: sql.json([
        { status: "PLACED", at: placed, by: "buyer" },
        { status: "ACCEPTED", at: placed + 120_000, by: "shop" },
        { status: "COMPLETED", at: placed + 1_800_000, by: "shop" },
      ]),
      deliveryAddress: sql.json({ line1: "Test address", landmark: "", lat: 0, lng: 0 }),
      paymentMethod: "cod",
      paymentStatus: "none",
      stockReserved: false,
      createdAt: placed,
      updatedAt: placed + 1_800_000,
    });
  }

  const undoInfo: Undo = {
    shopId: shop.id,
    stock: [fast, steady].map((p) => ({ productId: p.id, name: p.name, stock: p.stock, inStock: p.inStock })),
  };
  // Written first, so an undo is possible even if the insert fails part-way.
  writeFileSync(UNDO_FILE, JSON.stringify(undoInfo, null, 2));

  await sql.begin(async (tx) => {
    await tx`insert into orders ${tx(orders)}`;
    await tx`update products set stock = 4, in_stock = true, updated_at = ${now} where id = ${fast.id}`;
    await tx`update products set stock = 3, in_stock = true, updated_at = ${now} where id = ${steady.id}`;
  });

  console.log(`Shop: ${shop.name} (${shop.id})`);
  console.log(`created   ${orders.length} completed test orders over the last 30 days (buyer "${BUYER_NAME}")`);
  for (const [p, total] of plan) console.log(`sold      ${p.name}: ${total} in 30 days (~${(total / 30).toFixed(1)}/day)`);
  console.log(`stock     ${fast.name}: ${fast.stock} -> 4   (expect a RESTOCK idea)`);
  console.log(`stock     ${steady.name}: ${steady.stock} -> 3   (expect a RESTOCK idea)`);
  console.log(`price     ${priceable.name}: ₹${priceable.price / 100}, MRP ${priceable.mrp ? `₹${priceable.mrp / 100}` : "none"}   (may get a PRICE idea)`);
  console.log("Everything else: no sales -> products with 5+ in stock may get SLOW ITEM ideas.");
  console.log("Undo later with: npm run seed:sales -- --undo");
}

const args = process.argv.slice(2);
(args.includes("--undo") ? undo() : seed(args.includes("--shop") ? args[args.indexOf("--shop") + 1] : undefined))
  .then(() => sql.end())
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
