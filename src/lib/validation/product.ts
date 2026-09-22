import { z } from "zod";

// Product images are either an uploaded/remote https URL or a path served
// from this app's own /public folder (e.g. the bundled sample catalog).
export const productImageSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "Image must be an https URL or a /path");

// One alias: trimmed, non-empty, short — a search term, not a sentence.
const aliasSchema = z.string().trim().min(1).max(40);
export const aliasesSchema = z.array(aliasSchema).max(10).optional();

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  price: z.number().int().min(1, "Price must be at least 1 paisa"),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  category: z.string().trim().min(1, "Category is required").max(40),
  stock: z.number().int().min(0),
  imageUrl: productImageSchema.nullable().optional(),
  brand: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  mrp: z.number().int().min(1).optional(),
  aliases: aliasesSchema,
});

export type ProductInput = z.infer<typeof productSchema>;

// Bulk-import format (JSON or CSV): prices in rupees (decimal), matching
// what the manual "Add product" form collects — converted to paise
// server-side by bulkImportProducts. Unknown columns (e.g. shopType in the
// bundled sample files) are ignored.
// CSV cells are flat strings (aliases arrive as "chawal; chaval"), JSON can
// give a real array — accept either and normalise to a trimmed string[].
const importAliasesSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v): string[] | undefined => {
    if (v === undefined) return undefined;
    const list = Array.isArray(v) ? v : v.split(/[;,]/);
    const cleaned = list.map((a) => a.trim()).filter(Boolean).slice(0, 10);
    return cleaned.length ? cleaned : undefined;
  });

export const productImportItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  price: z.number().positive("Price must be greater than 0"),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  category: z.string().trim().min(1, "Category is required").max(40),
  stock: z.number().int().min(0).default(0),
  imageUrl: productImageSchema.optional(),
  brand: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  mrp: z.number().positive().optional(),
  aliases: importAliasesSchema,
});

export const productImportSchema = z
  .array(productImportItemSchema)
  .min(1, "The file has no products in it")
  .max(200, "Import is limited to 200 products at a time");

export type ProductImportItem = z.infer<typeof productImportItemSchema>;
