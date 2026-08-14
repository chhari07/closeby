import { listLocalities, getMyLastLocation } from "@/actions/buyer";
import { SearchExplorer } from "@/components/buyer/search-explorer";

export const dynamic = "force-dynamic";

export default async function ShopSearchPage() {
  const [localities, lastLocation] = await Promise.all([listLocalities(), getMyLastLocation()]);
  return <SearchExplorer initialLocalities={localities} initialLocation={lastLocation} />;
}
