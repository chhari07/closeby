import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getMyShop } from "@/actions/shops";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ShopOnboardingPage() {
  await requireRole("shop_owner");
  const shop = await getMyShop();

  if (shop?.status === "live") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto min-h-svh max-w-lg p-4 pb-10 sm:p-6">
      <OnboardingWizard initialShop={shop} />
    </div>
  );
}
