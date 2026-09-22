import { getMyShop } from "@/actions/shops";
import { getShopProducts } from "@/actions/products";
import { InventoryTable } from "./inventory-table";

export default async function InventoryPage() {
  const shop = await getMyShop();
  if (!shop) return null; // layout already guards this
  const products = await getShopProducts(shop.id);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold">Inventory</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Add items one by one or import a JSON / CSV file.
      </p>
      <InventoryTable shopId={shop.id} initialProducts={products} />
    </div>
  );
}
