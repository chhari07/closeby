import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { findOrder } from "@/lib/db/rows";
import { ownsShop } from "@/lib/auth/guards";
import { getNearbyShops } from "@/lib/geo/nearby-shops";
import { checkOrderStock } from "@/lib/ai/order-stock";
import type { ToolContext } from "./context";
import { getShopCatalog } from "@/lib/catalog";

/**
 * Read-only tools (roadmap §2.3). Every one of these returns only fields
 * copied straight out of a real database row — the model never gets to
 * assert a price, a stock count, or an order status; it can only read one
 * a tool actually fetched. This is what "stops made-up items."
 */

export function nearbyShopsTool() {
  return betaZodTool({
    name: "nearbyShops",
    description:
      "Find open, live CloseBy shops near a lat/lng, nearest first. radiusInM 0 (the default) " +
      "means any distance. Pass `query` (the buyer's request) to get, per shop, `found` (in-stock " +
      "products grouped by the word they matched) and `notFound` (words with no product there). " +
      "With a query only shops that have matches are returned, nearest first.",
    inputSchema: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      // 0 = any distance (see getNearbyShops).
      radiusInM: z.number().min(0).max(20000).default(0),
      // The whole request, so a long list can be matched in one call.
      query: z.string().trim().min(1).max(4000).optional(),
    }),
    run: async ({ lat, lng, radiusInM, query }) => {
      const results = (await getNearbyShops({ lat, lng }, radiusInM)).slice(0, 15);
      const base = (r: (typeof results)[number]) => ({
        shopId: r.shop.id,
        name: r.shop.name,
        type: r.shop.type,
        distanceInM: Math.round(r.distanceInM),
      });
      if (!query) return JSON.stringify({ shops: results.map(base) });
      const shops = await Promise.all(
        results.map(async (r) => ({ ...base(r), ...(await findProductGroups(r.shop.id, query, 4)) })),
      );
      // Only the 5 nearest shops with matches go back in full — enough to
      // pick from, and keeps a long list's reply within the model's budget.
      return JSON.stringify({ shops: shops.filter((s) => s.found.length).slice(0, 5) });
    },
  });
}

/**
 * Common Hindi/Hinglish grocery words -> the English words shop catalogues
 * usually use. Products rarely carry `aliases`, so without this "chawal"
 * never finds "Basmati Rice" and "daal" never finds "Toor Dal".
 */
const HINDI_SYNONYMS: Record<string, string[]> = {
  daal: ["dal"], dhal: ["dal"], dal: ["dal"],
  chawal: ["rice"], chaawal: ["rice"], chaval: ["rice"],
  aata: ["atta", "flour"], atta: ["atta", "flour"], maida: ["maida", "flour"],
  cheeni: ["sugar"], chini: ["sugar"], namak: ["salt"],
  tel: ["oil"], ghee: ["ghee"], doodh: ["milk"], dudh: ["milk"],
  dahi: ["curd", "dahi", "yogurt"], paneer: ["paneer"], makkhan: ["butter"],
  anda: ["egg"], ande: ["egg"], chai: ["tea"], patti: ["tea"],
  haldi: ["turmeric", "haldi"], mirch: ["chilli", "chili", "mirch"], jeera: ["cumin", "jeera"],
  dhaniya: ["coriander", "dhaniya"], sabun: ["soap"], biscuit: ["biscuit"],
  pyaz: ["onion"], pyaaz: ["onion"], aloo: ["potato"], tamatar: ["tomato"],
  sooji: ["suji", "sooji", "semolina", "rava"], suji: ["suji", "sooji", "semolina", "rava"],
  poha: ["poha"], besan: ["besan", "gram flour"], rajma: ["rajma", "kidney"], chole: ["chana", "chole"],
  // English words catalogues phrase differently.
  headphone: ["headphone", "earphone", "earbud", "headset"], earphone: ["earphone", "earbud", "headphone"],
  earbud: ["earbud", "earphone"], charger: ["charger", "adapter"], cable: ["cable", "charger"],
  mobile: ["phone", "mobile"], notebook: ["notebook", "copy"], pen: ["pen"],
};

/** Filler words in spoken lists ("1 kg dal aur 2 packet ka milk") that would match unrelated names. */
const STOP_WORDS = new Set([
  "aur", "and", "or", "ka", "ki", "ke", "ko", "se", "me", "mein", "hai", "chahiye", "de", "do", "dena",
  "bhi", "ek", "haan", "han", "ha", "to", "mujhe", "hame", "humein", "lana", "lao", "bhej", "bhejo", "for", "the", "of", "to", "with", "some", "any", "please", "want", "need", "is", "there",
  "kg", "gm", "gram", "grams", "litre", "liter", "ltr", "ml", "pc", "pcs", "piece", "pieces", "packet",
  "packets", "pack", "dozen", "half", "aadha", "wala", "wali", "vala", "vali", "also", "get", "me",
]);

/**
 * One group per word of the query: the word itself plus its synonyms
 * ("chawal" -> ["chawal", "rice"]). Plurals also try the singular.
 */
function searchGroups(query: string): { word: string; terms: string[] }[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  const groups = new Map<string, string[]>();
  for (const w of words) {
    // "headphones" -> also "headphone", so plurals hit singular names.
    const forms = w.length > 3 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w];
    groups.set(w, [...new Set(forms.flatMap((f) => [f, ...(HINDI_SYNONYMS[f] ?? [])]))]);
  }
  return [...groups].map(([word, terms]) => ({ word, terms }));
}

type ProductHit = { productId: string; name: string; unit: string; price: number; stock: number };

/**
 * In-stock products in one shop, grouped by which word of the query they
 * matched. Each word gets its own `perWord` share, so in a long list
 * ("dal chawal aata ... toothpaste") the last items aren't crowded out by
 * the first ones, and words with no match come back in `notFound`.
 */
async function findProductGroups(shopId: string, query: string, perWord: number) {
  // Cached catalog: an AI cart run scans up to 15 shops, so live reads here add up fast.
  const products = (await getShopCatalog(shopId))
    .slice(0, 300)
    .filter((p) => p.inStock)
    .map((p) => ({ p, words: [p.name, ...(p.aliases ?? [])].join(" ").toLowerCase().split(/[^a-z0-9\u0900-\u097f]+/) }));
  const found: { word: string; products: ProductHit[] }[] = [];
  const notFound: string[] = [];
  for (const { word, terms } of searchGroups(query)) {
    // Match at the start of a word ("anda" must not hit "bAndages", "tel" not
    // "toiLET"), and put whole-word hits ("tel" alias) before prefix ones.
    const score = (words: string[]) =>
      Math.max(0, ...terms.map((t) => (words.includes(t) ? 2 : words.some((w) => w.startsWith(t)) ? 1 : 0)));
    const hits = products
      .map((x) => ({ ...x, score: score(x.words) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, perWord)
      .map(({ p }) => ({ productId: p.id, name: p.name, unit: p.unit, price: p.price, stock: p.stock }));
    if (hits.length) found.push({ word, products: hits });
    else notFound.push(word);
  }
  return { found, notFound };
}

/** Flat, de-duplicated form of findProductGroups for a single-shop search. */
async function findProducts(shopId: string, query: string, perWord = 20): Promise<ProductHit[]> {
  const { found } = await findProductGroups(shopId, query, perWord);
  const byId = new Map(found.flatMap((g) => g.products).map((p) => [p.productId, p]));
  return [...byId.values()];
}

export function searchProductsTool() {
  return betaZodTool({
    name: "searchProducts",
    description:
      "Search real, in-stock products inside one specific shop. Matches any word of the query " +
      "against product names and aliases, and understands common Hindi/Hinglish grocery words " +
      '(e.g. "daal chawal" finds dals and rice), so one call can cover several items.',
    inputSchema: z.object({
      shopId: z.string().trim().min(1).max(80),
      query: z.string().trim().min(1).max(200),
    }),
    run: async ({ shopId, query }) => JSON.stringify({ products: await findProducts(shopId, query) }),
  });
}

export function orderStatusTool(ctx: ToolContext) {
  return betaZodTool({
    name: "orderStatus",
    description:
      "Look up the real status of one order — only if the caller has access to it. For the " +
      "shop owner it also returns `items`: each line's ordered qty, the shop's real `available` " +
      "stock and `shortBy` (how many are missing; 0 = fully in stock).",
    inputSchema: z.object({ orderId: z.string().trim().min(1).max(80) }),
    run: async ({ orderId }) => {
      const order = await findOrder(orderId);
      if (!order) return JSON.stringify({ found: false });

      const isBuyer = order.buyerId === ctx.userId;
      const isShop = ctx.role === "shop_owner" && (await ownsShop(ctx.userId, order.shopId));
      if (!isBuyer && !isShop) return JSON.stringify({ found: false });

      return JSON.stringify({
        found: true,
        status: order.status,
        itemCount: order.items.length,
        itemTotal: order.itemTotal,
        createdAt: order.createdAt,
        ...(isShop ? { items: await checkOrderStock(order) } : {}),
      });
    },
  });
}

export function shopStockTool(ctx: ToolContext) {
  return betaZodTool({
    name: "shopStock",
    description: "List real stock levels for the caller's own shop, lowest stock first.",
    inputSchema: z.object({ shopId: z.string().trim().min(1).max(80) }),
    run: async ({ shopId }) => {
      // Never trust a shopId argument that doesn't match the run's injected
      // context — an owner AI helper can only ever see its own shop's stock.
      if (shopId !== ctx.shopId) return JSON.stringify({ products: [] });
      const products = [...(await getShopCatalog(shopId))]
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 100)
        .map((p) => ({ productId: p.id, name: p.name, unit: p.unit, stock: p.stock, price: p.price }));
      return JSON.stringify({ products });
    },
  });
}
