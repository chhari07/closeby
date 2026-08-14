import { getMyShop } from "@/actions/shops";
import { getShopProducts } from "@/actions/products";
import { InventoryTable } from "./inventory-table";

export default async function InventoryPage() {
  const shop = await getMyShop();
  if (!shop) return null; // layout already guards this
  const products = await getShopProducts(shop.id);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold">Inventory</h1>
      <InventoryTable shopId={shop.id} initialProducts={products} />
    </div>
  );
}
