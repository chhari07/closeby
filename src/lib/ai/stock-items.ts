/**
 * Step 3.1 post-processing for stockDraft rows (voice, text or shelf photo):
 * tidy units, then merge rows that are the same product so a shelf with two
 * facings of one pack doesn't import twice. Pure — unit-tested directly.
 */

export interface StockDraftItem {
  name: string;
  brand?: string;
  unit: string;
  category: string;
  price: number; // rupees
  mrp?: number; // rupees, as printed on the pack
  stock: number;
  confidence: number;
}

const UNIT_WORDS: [RegExp, string][] = [
  [/^(kgs?|kilo(gram)?s?)$/, "kg"],
  [/^(g|gm|gms|grams?)$/, "g"],
  [/^(l|ltr|ltrs|litres?|liters?)$/, "L"],
  [/^(ml|mls|millilitres?|milliliters?)$/, "ml"],
  [/^(pc|pcs|piece|pieces|nos?|units?)$/, "pcs"],
];

/** "5 KG" -> "5 kg", "500gm" -> "500 g", "1 litre" -> "1 L", "Pack" -> "Pack". */
export function normalizeUnit(raw: string): string {
  const unit = raw.trim().replace(/\s+/g, " ");
  const match = unit.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/) ?? unit.match(/^()([a-zA-Z]+)$/);
  if (!match) return unit;
  const [, qty, word] = match;
  const lower = word!.toLowerCase();
  for (const [re, canonical] of UNIT_WORDS) {
    if (re.test(lower)) return qty ? `${qty} ${canonical}` : canonical;
  }
  return unit;
}

const key = (i: StockDraftItem) =>
  `${(i.brand ?? "").trim().toLowerCase()}|${i.name.trim().toLowerCase()}|${i.unit.toLowerCase()}`;

/** Normalise units and merge repeats (stock adds up, the lower confidence wins). */
export function normalizeStockItems(items: StockDraftItem[]): StockDraftItem[] {
  const merged = new Map<string, StockDraftItem>();
  for (const raw of items) {
    const item = { ...raw, name: raw.name.trim(), unit: normalizeUnit(raw.unit) };
    const existing = merged.get(key(item));
    if (!existing) {
      merged.set(key(item), item);
      continue;
    }
    existing.stock += item.stock;
    existing.confidence = Math.min(existing.confidence, item.confidence);
    existing.mrp ??= item.mrp;
  }
  return [...merged.values()];
}
