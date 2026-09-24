import { z } from "zod";

export const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(30),
  line1: z.string().trim().min(3, "Address is too short").max(200),
  landmark: z.string().trim().max(100).optional().default(""),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1).max(50),
  price: z.number().int().min(0), // paise, as last shown to the buyer — checked against the live price server-side
});

export const placeOrderSchema = z.object({
  shopId: z.string().min(1),
  items: z.array(orderItemInputSchema).min(1, "Your cart is empty"),
  deliveryAddress: z.object({
    line1: z.string().trim().min(3, "Address is too short").max(200),
    landmark: z.string().trim().max(100).optional().default(""),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  paymentMethod: z.enum(["cod", "pay_at_shop", "online"]),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
