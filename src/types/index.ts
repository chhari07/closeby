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

export type PaymentMethod = "cod" | "pay_at_shop";

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
  itemCount: number;
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
  createdAt: number;
  updatedAt: number;
}

export interface NearbyShopResult {
  shop: ShopDoc;
  distanceInM: number;
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
