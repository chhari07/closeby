export type Role = "buyer" | "shop_owner";

export type ShopType =
  | "kirana"
  | "pharmacy"
  | "stationery"
  | "bakery"
  | "electronics"
  | "other";

export type ShopStatus = "draft" | "live";

export type OrderStatus =
  | "PLACED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type PaymentMethod = "cod" | "pay_at_shop" | "online";

/** See supabase/migrations/0002_payments.sql. "none" = not an online order. */
export type PaymentStatus =
  | "none"
  | "pending"
  | "paid"
  | "expired"
  | "refund_pending"
  | "refunded"
  | "refund_failed";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  line1: string;
  landmark: string;
  lat: number;
  lng: number;
}

export interface LastKnownLocation extends GeoPoint {
  geohash: string;
  localityId?: string;
  source: "gps" | "manual";
}

export interface UserDoc {
  role: Role;
  name: string;
  phone: string;
  createdAt: number;
  savedAddresses?: SavedAddress[];
  lastKnownLocation?: LastKnownLocation;
}

export interface Locality {
  id: string;
  name: string;
  city: string;
  center: GeoPoint;
  geohash: string;
}

export interface ShopHours {
  open: string; // "09:00"
  close: string; // "21:00"
  days: number[]; // 0=Sun .. 6=Sat
}

export interface ShopLocation extends GeoPoint {
  geohash: string;
  address: string;
  localityId: string;
}

export interface ShopDoc {
  id: string;
  ownerId: string;
  status: ShopStatus;
  onboardingStep: 1 | 2 | 3 | 4;
  isOpen: boolean;
  type: ShopType;
  name: string;
  phone: string;
  hours?: ShopHours;
  location?: ShopLocation;
  /** Running counter of products in the catalog — this IS "productCount"
   *  from the roadmap's Step 1.3, kept under its original name. */
  itemCount: number;
  /** Running counters, updated inside the same transaction that writes an
   *  order (Step 1.3) — read these instead of scanning the orders
   *  collection. Optional so shops created before this field existed keep
   *  working (treat missing as 0). */
  orderCount?: number;
  pendingOrderCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProductDoc {
  id: string;
  shopId: string;
  name: string;
  price: number; // paise
  unit: string;
  category: string;
  stock: number;
  inStock: boolean;
  imageUrl: string | null;
  // Storefront presentation fields. Optional so products created before
  // the e-commerce catalog redesign keep working unchanged.
  brand?: string;
  description?: string;
  mrp?: number; // paise, list price before discount; only shown when > price
  /** Hindi/Hinglish alternate names (e.g. "chawal", "chaval" for rice) —
   *  the search index Step 4's AI helpers will read from. Optional so
   *  products created before this field existed keep working unchanged. */
  aliases?: string[];
  /** When stock last went UP (added, imported, or edited to a higher count).
   *  Optional: products from before this field existed have no record. */
  lastRestockedAt?: number;
  updatedAt: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  unit: string;
  price: number; // paise, frozen at order time
  qty: number;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: number;
  by: "buyer" | "shop";
  reason?: string;
}

export interface DeliveryAddress {
  line1: string;
  landmark: string;
  lat: number;
  lng: number;
}

export interface OrderDoc {
  id: string;
  buyerId: string;
  shopId: string;
  shopName: string;
  buyerName: string;
  buyerPhone: string;
  items: OrderItem[];
  itemTotal: number; // paise
  status: OrderStatus;
  timeline: OrderTimelineEntry[];
  deliveryAddress: DeliveryAddress;
  paymentMethod: PaymentMethod;
  rejectionReason?: string;
  /** True once stock was deducted at placement; reject/cancel then returns it. */
  stockReserved?: boolean;
  /** Online (Razorpay) payment state; "none" for cash / pay at shop. */
  paymentStatus?: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  paidAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface NearbyShopResult {
  shop: ShopDoc;
  distanceInM: number;
}

/** A browse-list row: distance is null when the buyer hasn't set a location
 *  or the shop has none on file ("Any distance" lists those too). */
export interface ShopListResult {
  shop: ShopDoc;
  distanceInM: number | null;
}

export const SHOP_TYPES: { value: ShopType; label: string }[] = [
  { value: "kirana", label: "Kirana Store" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "stationery", label: "Stationery" },
  { value: "bakery", label: "Bakery" },
  { value: "electronics", label: "Electronics" },
  { value: "other", label: "Other" },
];

export const REJECTION_REASONS = [
  "Item(s) out of stock",
  "Shop is too busy right now",
  "Unable to deliver to this address",
  "Price mismatch, please re-order",
  "Other",
] as const;
