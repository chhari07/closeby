import { requireRole } from "@/lib/auth/guards";
import { CartView } from "./cart-view";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  // Shop owners get a 404 here, matching /checkout.
  await requireRole("buyer");
  return <CartView />;
}
