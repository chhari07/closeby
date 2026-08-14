import { z } from "zod";

export const roleSchema = z.enum(["buyer", "shop_owner"]);

export const indianPhoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const completeOnboardingSchema = z.object({
  role: roleSchema,
  name: z.string().trim().min(2, "Name is too short").max(80),
  phone: indianPhoneSchema,
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  phone: indianPhoneSchema,
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
