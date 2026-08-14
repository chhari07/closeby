import Link from "next/link";
import { AlertTriangle, MapPin } from "lucide-react";
import { getMyShop } from "@/actions/shops";
import { getShopProducts } from "@/actions/products";
import { getTodayOrderCounts } from "@/actions/orders";
import { OpenToggle } from "@/components/dashboard/open-toggle";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const shop = await getMyShop();
  if (!shop) return null;

  const [products, counts] = await Promise.all([
    getShopProducts(shop.id),
    getTodayOrderCounts(shop.id),
  ]);
  const lowStock = products.filter((p) => p.stock <= 3);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{shop.name}</h1>
          <p className="text-muted-foreground text-sm">Today&apos;s overview</p>
        </div>
        <OpenToggle />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatCard label="New" value={counts.PLACED} />
        <StatCard label="In progress" value={counts.ACCEPTED + counts.PREPARING + counts.READY} />
        <StatCard label="Completed" value={counts.COMPLETED} />
      </div>

      {lowStock.length > 0 && (
        <div className="mb-6 rounded-xl border border-status-progress/30 bg-status-progress/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-status-progress">
            <AlertTriangle className="size-4" />
            <p className="text-sm font-semibold">Low stock</p>
          </div>
          <ul className="flex flex-col gap-1">
            {lowStock.map((p) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span>{p.name}</span>
                <span className="text-muted-foreground">{p.stock} left · {formatPaise(p.price)}</span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/inventory" className="text-primary mt-2 inline-block text-sm underline">
            Manage inventory
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/orders"
          className="flex items-center justify-between rounded-xl border p-4 hover:bg-accent/50"
        >
          <span className="font-medium">View all orders</span>
          <span className="text-muted-foreground text-sm">→</span>
        </Link>
        <Link
          href="/shops"
          className="flex items-center justify-between rounded-xl border p-4 hover:bg-accent/50"
        >
          <span className="flex items-center gap-2 font-medium">
            <MapPin className="size-4" /> Browse nearby shops
          </span>
          <span className="text-muted-foreground text-sm">→</span>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
