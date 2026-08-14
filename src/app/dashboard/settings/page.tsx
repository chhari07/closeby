import { getMyShop } from "@/actions/shops";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const shop = await getMyShop();
  if (!shop) return null;

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold">Shop settings</h1>
      <SettingsForm shop={shop} />
    </div>
  );
}
