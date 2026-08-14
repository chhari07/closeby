import { listLocalities, getMyLastLocation } from "@/actions/buyer";
import { ShopsExplorer } from "@/components/buyer/shops-explorer";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const [localities, lastLocation] = await Promise.all([listLocalities(), getMyLastLocation()]);

  return (
    <ShopsExplorer initialLocalities={localities} initialLocation={lastLocation} />
  );
}
