import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getMyShop } from "@/actions/shops";
import { ShopProvider } from "@/components/dashboard/shop-context";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { OrderAlerts } from "@/components/dashboard/order-alerts";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Buyers get a 404 here, not a redirect loop into shop onboarding.
  await requireRole("shop_owner");

  const shop = await getMyShop();
  if (!shop || shop.status !== "live") {
    redirect("/shop/onboarding");
  }

  return (
    <ShopProvider shop={shop}>
      <OrderAlerts shopId={shop.id} />
      <div className="bg-secondary/30 flex min-h-[calc(100svh-3.5rem)]">
        <DashboardSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </ShopProvider>
  );
}
