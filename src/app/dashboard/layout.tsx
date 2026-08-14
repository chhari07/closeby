import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getMyShop } from "@/actions/shops";
import { ShopProvider } from "@/components/dashboard/shop-context";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Buyers get a 404 here, not a redirect loop into shop onboarding.
  await requireRole("shop_owner");

  const shop = await getMyShop();
  if (!shop || shop.status !== "live") {
    redirect("/shop/onboarding");
  }

  return <ShopProvider shop={shop}>{children}</ShopProvider>;
}
