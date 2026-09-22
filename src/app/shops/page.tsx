import { listLocalities, getMyLastLocation } from "@/actions/buyer";
import { ShoppingBag } from "lucide-react";
import { ShopsExplorer } from "@/components/buyer/shops-explorer";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const [localities, lastLocation] = await Promise.all([listLocalities(), getMyLastLocation()]);

  return (
    <>
      <section className="from-primary to-primary/70 text-primary-foreground bg-gradient-to-r px-4 py-8 sm:py-10">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 sm:flex">
            <ShoppingBag className="size-7" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Shop from stores near you</h1>
            <p className="mt-1 text-sm opacity-90">
              Kirana, pharmacy, stationery, bakery and more — delivered or ready for pickup.
            </p>
          </div>
        </div>
      </section>
      <ShopsExplorer initialLocalities={localities} initialLocation={lastLocation} />
    </>
  );
}
