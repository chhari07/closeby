import { z } from "zod";

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  price: z.number().int().min(1, "Price must be at least 1 paisa"),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  category: z.string().trim().min(1, "Category is required").max(40),
  stock: z.number().int().min(0),
  imageUrl: z.string().url().nullable().optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

// JSON bulk-import format: price in rupees (decimal), matching what the
// manual "Add product" form collects — converted to paise server-side by
// bulkImportProducts, same as the manual form does on submit.
export const productImportItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  price: z.number().positive("Price must be greater than 0"),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  category: z.string().trim().min(1, "Category is required").max(40),
  stock: z.number().int().min(0).default(0),
});

export const productImportSchema = z
  .array(productImportItemSchema)
  .min(1, "The file has no products in it")
  .max(200, "Import is limited to 200 products at a time");

export type ProductImportItem = z.infer<typeof productImportItemSchema>;
