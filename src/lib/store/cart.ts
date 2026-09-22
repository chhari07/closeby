import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  productId: string;
  name: string;
  unit: string;
  price: number; // paise
  qty: number;
}

interface PendingSwitch {
  shopId: string;
  shopName: string;
  item: CartItem;
}

interface CartState {
  shopId: string | null;
  shopName: string | null;
  items: CartItem[];
  pendingSwitch: PendingSwitch | null;
  addItem: (shopId: string, shopName: string, item: CartItem) => void;
  /** Applies several items at once (the AI cart draft) — merges into the
   *  current cart if it's the same shop, otherwise replaces it outright.
   *  The caller (AiCartDialog) is responsible for warning the buyer first
   *  when that would discard a different shop's items; the single-item
   *  pendingSwitch flow above is for the manual "add to cart" button and
   *  doesn't fit a multi-item bulk apply (each item would stomp the last
   *  pending one). */
  applyDraftItems: (shopId: string, shopName: string, items: CartItem[]) => void;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  updateQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  removeItems: (productIds: string[]) => void;
  updateItemPrice: (productId: string, price: number) => void;
  clear: () => void;
}

// Cart rule: exactly one shop at a time. Adding from a different shop stages
// a pendingSwitch instead of mutating items directly — the UI must show a
// confirm dialog before clearing. This is the single file that owns that rule.
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      shopId: null,
      shopName: null,
      items: [],
      pendingSwitch: null,

      addItem: (shopId, shopName, item) => {
        const state = get();
        if (state.shopId && state.shopId !== shopId) {
          set({ pendingSwitch: { shopId, shopName, item } });
          return;
        }
        set((s) => {
          const existing = s.items.find((i) => i.productId === item.productId);
          const items = existing
            ? s.items.map((i) =>
                i.productId === item.productId ? { ...i, qty: i.qty + item.qty } : i
              )
            : [...s.items, item];
          return { shopId, shopName, items };
        });
      },

      applyDraftItems: (shopId, shopName, items) => {
        set((s) => {
          if (s.shopId === shopId) {
            const merged = [...s.items];
            for (const item of items) {
              const idx = merged.findIndex((i) => i.productId === item.productId);
              if (idx >= 0) merged[idx] = { ...merged[idx]!, qty: merged[idx]!.qty + item.qty };
              else merged.push(item);
            }
            return { items: merged };
          }
          return { shopId, shopName, items };
        });
      },

      confirmSwitch: () => {
        const pending = get().pendingSwitch;
        if (!pending) return;
        set({
          shopId: pending.shopId,
          shopName: pending.shopName,
          items: [pending.item],
          pendingSwitch: null,
        });
      },

      cancelSwitch: () => set({ pendingSwitch: null }),

      updateQty: (productId, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.productId !== productId)
              : s.items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
        })),

      removeItem: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),

      removeItems: (productIds) =>
        set((s) => ({ items: s.items.filter((i) => !productIds.includes(i.productId)) })),

      updateItemPrice: (productId, price) =>
        set((s) => ({
          items: s.items.map((i) => (i.productId === productId ? { ...i, price } : i)),
        })),

      clear: () => set({ shopId: null, shopName: null, items: [], pendingSwitch: null }),
    }),
    { name: "closeby-cart" }
  )
);
