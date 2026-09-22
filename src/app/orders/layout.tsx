import { requireOnboardedUser } from "@/lib/auth/guards";

export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both buyers and shop owners land on order detail pages (the shop owner
  // sees a "Call buyer" action there instead of a cancel button).
  await requireOnboardedUser();
  return <>{children}</>;
}
