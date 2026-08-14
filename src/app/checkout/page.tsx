import { requireRole } from "@/lib/auth/guards";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const me = await requireRole("buyer");
  return <CheckoutForm savedAddresses={me.savedAddresses ?? []} />;
}
