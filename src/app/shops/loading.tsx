import { ShopListSkeleton } from "@/components/buyer/shop-list-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <ShopListSkeleton />
    </div>
  );
}
