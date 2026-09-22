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

// Sign-up form: the account details collected before the email OTP is sent.
// Shop owners also give their shop's name so the draft shop can be seeded.
export const signUpFormSchema = z
  .object({
    role: roleSchema,
    name: z.string().trim().min(2, "Name is too short").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone: indianPhoneSchema,
    shopName: z.string().trim().max(80).optional(),
  })
  .refine((v) => v.role !== "shop_owner" || (v.shopName && v.shopName.length >= 2), {
    message: "Enter your shop's name",
    path: ["shopName"],
  });

export type SignUpFormInput = z.infer<typeof signUpFormSchema>;

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");
