import { notFound } from "next/navigation";
import { getOrder } from "@/actions/orders";
import { BackButton } from "@/components/buyer/back-button";
import { OrderTimeline } from "./order-timeline";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await getOrder(orderId);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-lg p-4">
      <BackButton />
      <OrderTimeline initialOrder={order} orderId={orderId} />
    </div>
  );
}
