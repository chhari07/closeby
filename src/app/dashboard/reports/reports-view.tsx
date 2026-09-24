"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CircleCheckBig,
  Clock,
  MoonStar,
  Phone,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ReportOrder, RestockRow, SalesDay, ShopReport } from "@/actions/reports";
import { SalesChart, type ChartBar } from "./sales-chart";

export function ReportsView({ report }: { report: ShopReport }) {
  const restockNow = report.restock.filter((r) => r.urgency === "now").length;

  return (
    <Tabs defaultValue="sales">
      <TabsList className="w-full">
        <TabsTrigger value="sales" className="flex-1">
          Sales
        </TabsTrigger>
        <TabsTrigger value="restock" className="flex-1">
          Restock
          {restockNow > 0 && (
            <span className="bg-destructive text-destructive-foreground ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
              {restockNow}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="orders" className="flex-1">
          Orders
        </TabsTrigger>
        <TabsTrigger value="buyers" className="flex-1">
          Buyers
        </TabsTrigger>
      </TabsList>

      {report.truncated && (
        <p className="text-muted-foreground pt-2 text-xs">
          Based on your latest {report.orders.length} orders — older ones aren&apos;t included.
        </p>
      )}

      <TabsContent value="sales" className="pt-3">
        <SalesTab report={report} />
      </TabsContent>
      <TabsContent value="restock" className="pt-3">
        <RestockTab rows={report.restock} />
      </TabsContent>
      <TabsContent value="orders" className="pt-3">
        <OrdersTab orders={report.orders} />
      </TabsContent>
      <TabsContent value="buyers" className="pt-3">
        <BuyersTab report={report} />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ Sales */

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

/** 7 / 30 days: one bar per day. 90 days: one bar per week, so bars stay readable on a phone. */
function toBars(days: SalesDay[], range: number): ChartBar[] {
  const slice = days.slice(-range);
  if (range <= 30) return slice.map((d) => ({ start: d.day, end: d.day, revenue: d.revenue, orders: d.orders }));
  const bars: ChartBar[] = [];
  // Group from the newest day backwards so the last bar is always "this week".
  for (let end = slice.length; end > 0; end -= 7) {
    const week = slice.slice(Math.max(0, end - 7), end);
    bars.unshift({
      start: week[0]!.day,
      end: week[week.length - 1]!.day,
      revenue: week.reduce((s, d) => s + d.revenue, 0),
      orders: week.reduce((s, d) => s + d.orders, 0),
    });
  }
  return bars;
}

function SalesTab({ report }: { report: ShopReport }) {
  const [range, setRange] = useState<number>(30);
  const [showTable, setShowTable] = useState(false);
  const bars = useMemo(() => toBars(report.sales, range), [report.sales, range]);

  const current = report.sales.slice(-range);
  const revenue = current.reduce((s, d) => s + d.revenue, 0);
  const orders = current.reduce((s, d) => s + d.orders, 0);
  // Previous period of the same length, when the 90 days of data cover it.
  const prev = range * 2 <= report.sales.length ? report.sales.slice(-range * 2, -range) : null;
  const prevRevenue = prev?.reduce((s, d) => s + d.revenue, 0) ?? 0;
  const change = prev && prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setRange(r.days)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-sm",
              range === r.days ? "border-primary bg-accent" : "border-border",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Sales (completed orders)" value={formatPaise(revenue)}>
          {change !== null && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              {change >= 0 ? (
                <TrendingUp className="text-status-ready size-3.5" />
              ) : (
                <TrendingDown className="text-status-stopped size-3.5" />
              )}
              {change >= 0 ? "+" : ""}
              {change.toFixed(0)}% vs previous {range} days
            </span>
          )}
        </Stat>
        <Stat label="Completed orders" value={String(orders)} />
        <Stat label="Average order" value={orders ? formatPaise(Math.round(revenue / orders)) : "—"} />
      </div>

      <div className="bg-card rounded-2xl border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-semibold">
            {range <= 30 ? "Daily sales" : "Weekly sales"}{" "}
            <span className="text-muted-foreground text-sm font-normal">· last {range} days</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Show graph" : "Show table"}
          </Button>
        </div>
        {showTable ? (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-1 font-medium">{range <= 30 ? "Day" : "Week"}</th>
                  <th className="py-1 text-right font-medium">Orders</th>
                  <th className="py-1 text-right font-medium">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...bars].reverse().map((b) => (
                  <tr key={b.start}>
                    <td className="py-1.5">
                      {b.start === b.end
                        ? format(b.start, "EEE, d MMM")
                        : `${format(b.start, "d MMM")} – ${format(b.end, "d MMM")}`}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{b.orders}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatPaise(b.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <SalesChart bars={bars} />
        )}
      </div>

      <div className="bg-card rounded-2xl border p-4">
        <p className="mb-2 font-semibold">
          Top products <span className="text-muted-foreground text-sm font-normal">· last 30 days</span>
        </p>
        {report.topProducts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No completed sales in the last 30 days yet.</p>
        ) : (
          <ul className="divide-y">
            {report.topProducts.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
                  {p.name} <span className="text-muted-foreground">({p.unit})</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-muted-foreground mr-3">{p.qty} sold</span>
                  {formatPaise(p.revenue)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-2xl leading-none font-bold tabular-nums">{value}</p>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Restock */

const URGENCY: Record<
  RestockRow["urgency"],
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  now: { label: "Restock now", className: "bg-status-stopped/15 text-status-stopped", Icon: AlertTriangle },
  soon: { label: "This week", className: "bg-status-progress/15 text-status-progress", Icon: Clock },
  ok: { label: "Stocked", className: "bg-status-ready/15 text-status-ready", Icon: CircleCheckBig },
  idle: { label: "No recent sales", className: "bg-muted text-muted-foreground", Icon: MoonStar },
};

function RestockTab({ rows }: { rows: RestockRow[] }) {
  const [filter, setFilter] = useState<"due" | "all">("due");
  const due = rows.filter((r) => r.urgency === "now" || r.urgency === "soon");
  const shown = filter === "due" ? due : rows;

  if (rows.length === 0) {
    return (
      <Empty>
        No products yet.{" "}
        <Link href="/dashboard/inventory" className="text-primary-ink underline">
          Add some in Inventory
        </Link>
        .
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Restock dates are worked out from how fast each product sold over the last 30 days, with a 2-day buffer
        before it&apos;s expected to run out.
      </p>
      <div className="flex gap-2">
        <Chip active={filter === "due"} onClick={() => setFilter("due")}>
          Due soon ({due.length})
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All products ({rows.length})
        </Chip>
      </div>

      {shown.length === 0 ? (
        <Empty>Nothing needs restocking this week. 🎉</Empty>
      ) : (
        <ul className="bg-card divide-y rounded-2xl border">
          {shown.map((r) => {
            const u = URGENCY[r.urgency];
            return (
              <li key={r.productId} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.name} <span className="text-muted-foreground font-normal">({r.unit})</span>
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {r.stock} in stock · {r.sold30d} sold in 30 days
                    {r.daysLeft !== null && r.stock > 0 && ` · lasts ~${Math.max(1, Math.round(r.daysLeft))} days`}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Last restocked:{" "}
                    {r.lastRestockedAt ? format(r.lastRestockedAt, "d MMM yyyy") : "not recorded yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", u.className)}>
                    <u.Icon className="size-3.5" />
                    {u.label}
                  </span>
                  {r.restockBy !== null && (
                    <span className="flex items-center gap-1 text-xs tabular-nums">
                      <CalendarClock className="text-muted-foreground size-3.5" />
                      Restock by {format(r.restockBy, "d MMM")}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/dashboard/inventory" className="text-primary-ink text-sm font-medium underline">
        Update stock in Inventory
      </Link>
    </div>
  );
}

/* ----------------------------------------------------------------- Orders */

const ORDER_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "done", label: "Completed" },
  { key: "closed", label: "Rejected / cancelled" },
] as const;
type OrderFilter = (typeof ORDER_FILTERS)[number]["key"];

function matchesFilter(o: ReportOrder, f: OrderFilter): boolean {
  if (f === "all") return true;
  if (f === "done") return o.status === "COMPLETED";
  if (f === "closed") return o.status === "REJECTED" || o.status === "CANCELLED";
  return !["COMPLETED", "REJECTED", "CANCELLED"].includes(o.status);
}

const PAGE = 50;

function OrdersTab({ orders }: { orders: ReportOrder[] }) {
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const q = query.trim().toLowerCase();
  const filtered = orders.filter(
    (o) =>
      matchesFilter(o, filter) &&
      (!q ||
        o.buyerName.toLowerCase().includes(q) ||
        o.buyerPhone.includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.items.toLowerCase().includes(q)),
  );
  const total = filtered.reduce((s, o) => s + (o.status === "COMPLETED" ? o.itemTotal : 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={query} onChange={setQuery} placeholder="Search buyer, phone, order ID or item" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ORDER_FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} ({orders.filter((o) => matchesFilter(o, f.key)).length})
          </Chip>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {filtered.length} order{filtered.length === 1 ? "" : "s"} · {formatPaise(total)} from completed ones
      </p>

      {filtered.length === 0 ? (
        <Empty>No orders match.</Empty>
      ) : (
        <ul className="bg-card divide-y rounded-2xl border">
          {filtered.slice(0, limit).map((o) => (
            <li key={o.id} className="flex flex-col gap-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">
                  {o.buyerName}
                  <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">
                    #{o.id.slice(-6).toUpperCase()}
                  </span>
                </p>
                <OrderStatusBadge status={o.status} />
              </div>
              <p className="text-muted-foreground truncate text-xs">{o.items}</p>
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>
                  {format(o.createdAt, "d MMM yyyy, h:mm a")} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"} ·{" "}
                  {o.paymentMethod.toUpperCase()}
                </span>
                <span className="text-foreground text-sm font-medium tabular-nums">{formatPaise(o.itemTotal)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > limit && (
        <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({filtered.length - limit} left)
        </Button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Buyers */

function BuyersTab({ report }: { report: ShopReport }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const buyers = report.buyers.filter((b) => !q || b.name.toLowerCase().includes(q) || b.phone.includes(q));
  const repeat = report.buyers.filter((b) => b.orders >= 2).length;

  if (report.buyers.length === 0) return <Empty>No buyers yet — they&apos;ll show up after the first order.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Buyers" value={String(report.buyers.length)} />
        <Stat label="Repeat buyers (2+ orders)" value={String(repeat)} />
      </div>
      <SearchBox value={query} onChange={setQuery} placeholder="Search by name or phone" />

      {buyers.length === 0 ? (
        <Empty>No buyers match.</Empty>
      ) : (
        <ul className="bg-card divide-y rounded-2xl border">
          {buyers.map((b) => (
            <li key={b.buyerId} className="flex items-center gap-3 p-3">
              <span className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                {b.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.name}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {b.orders} order{b.orders === 1 ? "" : "s"} · last{" "}
                  {formatDistanceToNowStrict(b.lastOrderAt, { addSuffix: true })} · since{" "}
                  {format(b.firstOrderAt, "MMM yyyy")}
                </p>
                {b.phone && (
                  <a href={`tel:${b.phone}`} className="text-primary-ink inline-flex items-center gap-1 text-xs">
                    <Phone className="size-3" />
                    {b.phone}
                  </a>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{formatPaise(b.totalSpent)}</p>
                <p className="text-muted-foreground text-[11px]">spent</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 shrink-0 rounded-full border px-3 text-sm",
        active ? "border-primary bg-accent" : "border-border",
      )}
    >
      {children}
    </button>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 pl-9" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground py-12 text-center text-sm">{children}</div>;
}
