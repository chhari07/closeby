import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types";

const STYLES: Record<OrderStatus, string> = {
  PLACED: "bg-status-progress/15 text-status-progress",
  ACCEPTED: "bg-status-progress/15 text-status-progress",
  PREPARING: "bg-status-progress/15 text-status-progress",
  READY: "bg-status-ready/15 text-status-ready",
  COMPLETED: "bg-status-ready/15 text-status-ready",
  REJECTED: "bg-status-stopped/15 text-status-stopped",
  CANCELLED: "bg-status-stopped/15 text-status-stopped",
};

const LABELS: Record<OrderStatus, string> = {
  PLACED: "Placed",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", STYLES[status])}>
      {LABELS[status]}
    </span>
  );
}
