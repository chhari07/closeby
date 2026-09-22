import { z } from "zod";
import { indianPhoneSchema } from "./user";

export const shopTypeSchema = z.enum([
  "kirana",
  "pharmacy",
  "stationery",
  "bakery",
  "electronics",
  "other",
]);

export const shopTypeStepSchema = z.object({
  type: shopTypeSchema,
});

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use 24-hour HH:mm format");

const shopNameSchema = z.string().trim().min(2, "Shop name is too short").max(80);

/** Name + phone only — used to seed the draft shop at sign-up. */
export const shopSeedSchema = z.object({
  name: shopNameSchema,
  phone: indianPhoneSchema,
});

/** Working hours as edited from shop settings (same rules as the setup step). */
export const shopHoursSchema = z
  .object({
    open: timeSchema,
    close: timeSchema,
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day"),
  })
  .refine((v) => v.open !== v.close, {
    message: "Opening and closing time can't be the same",
    path: ["close"],
  });

export const shopDetailsStepSchema = z
  .object({
    name: shopNameSchema,
    phone: indianPhoneSchema,
    open: timeSchema,
    close: timeSchema,
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day"),
  })
  .refine((v) => v.open !== v.close, {
    message: "Opening and closing time can't be the same",
    path: ["close"],
  });

export const shopLocationStepSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Empty means "no address yet at these coordinates" — the server fills
  // it in via reverse geocoding. Only the final, resolved address (checked
  // after that fallback) must be non-empty.
  address: z.string().trim().max(200).optional().default(""),
});
