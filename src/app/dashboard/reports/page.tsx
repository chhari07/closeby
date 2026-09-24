import { getMyShop } from "@/actions/shops";
import { getShopReport } from "@/actions/reports";
import { ReportsView } from "./reports-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const shop = await getMyShop();
  if (!shop) return null; // layout already guards this
  const result = await getShopReport(shop.id);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold">Reports</h1>
      <p className="text-muted-foreground mb-4 text-sm">
        Sales, restock planning, every order and every buyer for {shop.name}.
      </p>
      {result.ok && result.data ? (
        <ReportsView report={result.data} />
      ) : (
        <p className="text-destructive text-sm">{result.error ?? "Could not load reports"}</p>
      )}
    </div>
  );
}
