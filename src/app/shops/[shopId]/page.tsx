import { notFound } from "next/navigation";
import { Phone, Clock } from "lucide-react";
import { findShop } from "@/lib/db/rows";
import { getShopProducts } from "@/actions/products";
import type { ShopDoc } from "@/types";
import { SHOP_TYPES } from "@/types";
import { ProductCatalog } from "./product-catalog";
import { BackButton } from "@/components/buyer/back-button";

export const dynamic = "force-dynamic";

async function getLiveShop(shopId: string): Promise<ShopDoc | null> {
  const shop = await findShop(shopId);
  // Rule: draft shops must 404 for buyers, even by direct URL.
  if (!shop || shop.status !== "live") return null;
  return shop;
}

export default async function ShopPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const shop = await getLiveShop(shopId);
  if (!shop) notFound();

  const products = await getShopProducts(shopId);
  const typeLabel = SHOP_TYPES.find((t) => t.value === shop.type)?.label ?? shop.type;

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <header className="border-b p-4">
        <BackButton />
        <div className="mt-2 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{shop.name}</h1>
            <p className="text-muted-foreground text-sm">{typeLabel}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              shop.isOpen ? "bg-status-ready/15 text-status-ready" : "bg-status-stopped/15 text-status-stopped"
            }`}
          >
            {shop.isOpen ? "Open" : "Closed"}
          </span>
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {shop.hours && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {shop.hours.open} - {shop.hours.close}
            </span>
          )}
          <a href={`tel:${shop.phone}`} className="flex items-center gap-1">
            <Phone className="size-3.5" /> {shop.phone}
          </a>
        </div>
        {!shop.isOpen && (
          <p className="bg-status-stopped/10 text-status-stopped mt-3 rounded-lg p-2 text-sm">
            This shop is currently closed and not accepting orders.
          </p>
        )}
      </header>

      <ProductCatalog shop={shop} products={products} />
    </div>
  );
}
