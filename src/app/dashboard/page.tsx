import Link from "next/link";
import {
  AlertTriangle,
  MapPin,
  BellRing,
  ChefHat,
  CircleCheckBig,
  Package,
  ClipboardList,
  Settings,
  ArrowRight,
  IndianRupee,
  ChartColumn,
} from "lucide-react";
import { getMyShop } from "@/actions/shops";
import { getLowStockProducts } from "@/actions/products";
import { getTodayOrderCounts } from "@/actions/orders";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { OpenToggle } from "@/components/dashboard/open-toggle";
import { formatPaise } from "@/lib/money";
import { getShopIdeasStatus, listMyShopIdeas } from "@/actions/ai";
import { ShopIdeasCard } from "@/components/dashboard/shop-ideas-card";
import { getOwnerStats } from "@/actions/stats";
import { OwnerStatsCard } from "@/components/dashboard/owner-stats-card";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const shop = await getMyShop();
  if (!shop) return null;

  // Step 1.3: read the running product counter + a bounded low-stock query
  // instead of fetching the whole catalog just to count/filter it in memory.
  const [lowStock, { counts, revenueToday }, ideas, ideasStatus, ownerStats] = await Promise.all([
    getLowStockProducts(shop.id),
    getTodayOrderCounts(shop.id),
    listMyShopIdeas(shop.id),
    getShopIdeasStatus(shop.id),
    getOwnerStats(shop.id),
  ]);
  const inProgress = counts.ACCEPTED + counts.PREPARING + counts.READY;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 sm:p-6">
        <div>
          <p className="text-sm opacity-80">Today&apos;s overview</p>
          <h1 className="text-2xl font-bold">{shop.name}</h1>
          <p className="mt-1 text-sm opacity-80">
            {shop.itemCount} product{shop.itemCount === 1 ? "" : "s"} in your catalog
            {typeof shop.orderCount === "number" && shop.orderCount > 0
              ? ` · ${shop.orderCount} order${shop.orderCount === 1 ? "" : "s"} all-time`
              : ""}
          </p>
        </div>
        <div className="text-foreground rounded-full bg-white px-4 py-2 shadow-sm">
          <OpenToggle />
        </div>
      </div>

      {/* Stats */}
      <AutoRefresh intervalMs={15000} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="New orders"
          value={counts.PLACED}
          Icon={BellRing}
          tone="bg-orange-100 text-orange-700"
        />
        <StatCard
          label="In progress"
          value={inProgress}
          Icon={ChefHat}
          tone="bg-blue-100 text-blue-700"
        />
        <StatCard
          label="Completed today"
          value={counts.COMPLETED}
          Icon={CircleCheckBig}
          tone="bg-green-100 text-green-700"
        />
        <StatCard
          label="Sales today"
          value={formatPaise(revenueToday)}
          Icon={IndianRupee}
          tone="bg-emerald-100 text-emerald-700"
        />
      </div>

      <div className="mb-6">
        <OwnerStatsCard stats={ownerStats} />
      </div>

      <div className="mb-6">
        <ShopIdeasCard shopId={shop.id} initialIdeas={ideas} initialStatus={ideasStatus} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Low stock */}
        <div className="bg-card rounded-2xl border p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="text-status-progress size-4" />
            <p className="font-semibold">Low stock</p>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Everything is well stocked. 🎉
            </p>
          ) : (
            <>
              <ul className="flex flex-col divide-y">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex justify-between py-2 text-sm">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">
                      {p.stock} left · {formatPaise(p.price)}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/inventory"
                className="text-primary-ink mt-3 inline-block text-sm font-medium underline"
              >
                Restock in inventory
              </Link>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex flex-col gap-2">
          <ActionLink
            href="/dashboard/orders"
            label="View all orders"
            Icon={ClipboardList}
          />
          <ActionLink
            href="/dashboard/reports"
            label="Sales & reports"
            Icon={ChartColumn}
          />
          <ActionLink
            href="/dashboard/inventory"
            label="Manage inventory"
            Icon={Package}
          />
          <ActionLink
            href="/dashboard/settings"
            label="Shop settings"
            Icon={Settings}
          />
          <ActionLink href="/shops" label="Browse nearby shops" Icon={MapPin} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number | string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="bg-card flex items-center gap-4 rounded-2xl border p-4">
      <span
        className={`flex size-12 items-center justify-center rounded-xl ${tone}`}
      >
        <Icon className="size-6" />
      </span>
      <div>
        <p className="text-3xl leading-none font-bold">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{label}</p>
      </div>
    </div>
  );
}

function ActionLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="bg-card hover:bg-accent/60 flex min-h-12 items-center justify-between rounded-xl border p-3 text-sm font-medium transition-colors"
    >
      <span className="flex items-center gap-3">
        <Icon className="text-primary size-4" /> {label}
      </span>
      <ArrowRight className="text-muted-foreground size-4" />
    </Link>
  );
}
