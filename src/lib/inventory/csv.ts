// Minimal RFC-4180 CSV reader for inventory import. Handles quoted fields,
// escaped quotes ("") and newlines inside quotes; no dependency needed.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const NUMERIC_COLUMNS = new Set(["price", "mrp", "stock"]);

const CANONICAL_HEADERS: Record<string, string> = {
  imageurl: "imageUrl",
  image: "imageUrl",
  photo: "imageUrl",
};

/**
 * Turns CSV text into the same array-of-objects shape the JSON import uses.
 * Header names are matched case-insensitively; numeric columns are coerced
 * and blank cells are dropped so optional fields stay optional.
 */
export function csvToProducts(text: string): Record<string, unknown>[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().replace(/\s+/g, "").toLowerCase());

  return body.map((cells) => {
    const obj: Record<string, unknown> = {};
    keys.forEach((key, i) => {
      const raw = (cells[i] ?? "").trim();
      if (raw === "") return;
      const name = CANONICAL_HEADERS[key] ?? key;
      obj[name] = NUMERIC_COLUMNS.has(name) ? Number(raw) : raw;
    });
    return obj;
  });
}
