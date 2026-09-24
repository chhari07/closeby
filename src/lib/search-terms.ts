import type { ProductDoc } from "@/types";

/**
 * Step 4.1 — search text -> product search terms. Pure (unit-tested).
 * The plain search tries the whole query, then its meaningful words; the
 * AI (searchQuery helper) is only asked when neither finds anything.
 */

/** Filler words in Hindi/Hinglish/English shopping queries — never worth matching on their own. */
const FILLER = new Set([
  "aur", "or", "and", "ka", "ki", "ke", "ko", "se", "me", "mein", "hai", "hain", "chahiye", "chaiye", "chahie",
  "dena", "do", "de", "dijiye", "please", "pls", "kuch", "koi", "liye", "wala", "wali", "wale", "ek", "do",
  "for", "the", "a", "an", "of", "some", "want", "need", "i", "me", "my", "with", "to", "buy", "get", "kg", "g",
  "gm", "ml", "l", "litre", "liter", "packet", "pack", "pcs", "piece", "pieces",
]);

/** Lowercase, trimmed, single spaces — the cache key and the plain-search needle. */
export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

/** The words worth matching on their own: 3+ letters, not filler, no numbers. */
export function queryWords(q: string): string[] {
  const words = normalizeQuery(q)
    .split(/[^\p{L}\p{M}]+/u)
    .filter((w) => w.length >= 3 && !FILLER.has(w));
  return [...new Set(words)];
}

/** Cleans the AI's terms: short product words only, max 6, no duplicates. */
export function sanitizeTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const term = normalizeQuery(t).replace(/[^\p{L}\p{M}\p{N} -]/gu, "").trim();
    if (term.length < 2 || term.length > 30 || out.includes(term)) continue;
    out.push(term);
    if (out.length === 6) break;
  }
  return out;
}

/** Crude singular form, so "batteries" meets "battery" and "cables" meets "cable". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).map(stem);

/**
 * Does the product match this term? One word: it appears in the name or an
 * alias (so "chawal" finds rice by its alias, "bulb" finds "LED Bulb 9 W").
 * Several words ("phone charger", "remote battery"): the last word (the
 * thing itself) must appear, and all but one of the others — plurals and word starts count ("charging" ~
 * "charge") — so the AI's wording doesn't have to match the shop's exactly.
 */
function termMatches(haystacks: string[], term: string): boolean {
  const termWords = words(term);
  if (termWords.length <= 1) return haystacks.some((h) => h.includes(term));
  const productWords = new Set(haystacks.flatMap(words));
  // A word start counts only with a short ending ("charge" ~ "charging"),
  // not a different word that happens to begin the same ("light" / "lightning").
  // ("charge" -> "charg" + "ing"): a final "e" may drop before the ending.
  const near = (a: string, b: string) => {
    const base = a.length > 4 && a.endsWith("e") ? a.slice(0, -1) : a;
    return base.length >= 4 && b.startsWith(base) && b.length - base.length <= 3;
  };
  const has = (w: string) => productWords.has(w) || [...productWords].some((p) => near(w, p) || near(p, w));
  // The last word is the thing itself ("phone CABLE", "emergency LIGHT") and
  // must match; of the describing words, one may be missing.
  if (!has(termWords[termWords.length - 1]!)) return false;
  return termWords.filter(has).length >= termWords.length - 1;
}

/** The first term this product matches by name or alias, if any. */
export function matchingTerm(product: Pick<ProductDoc, "name" | "aliases">, terms: string[]): string | null {
  const haystacks = [product.name, ...(product.aliases ?? [])]
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.toLowerCase());
  return terms.find((t) => termMatches(haystacks, t)) ?? null;
}
