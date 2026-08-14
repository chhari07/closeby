"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ShopDoc } from "@/types";

const ShopContext = createContext<{
  shop: ShopDoc;
  setShop: (shop: ShopDoc) => void;
} | null>(null);

export function ShopProvider({ shop: initial, children }: { shop: ShopDoc; children: ReactNode }) {
  const [shop, setShop] = useState(initial);
  return <ShopContext.Provider value={{ shop, setShop }}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}
