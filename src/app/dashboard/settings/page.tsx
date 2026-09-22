import { getMyShop } from "@/actions/shops";
import { getMyShopAiSettings } from "@/actions/ai";
import { SettingsForm } from "./settings-form";
import { AiSettingsCard } from "./ai-settings-card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const shop = await getMyShop();
  if (!shop) return null;

  const aiStatuses = await getMyShopAiSettings(shop.id);

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold">Shop settings</h1>
      <SettingsForm shop={shop} />
      <div className="mt-6">
        <AiSettingsCard shopId={shop.id} initialStatuses={aiStatuses} />
      </div>
    </div>
  );
}
