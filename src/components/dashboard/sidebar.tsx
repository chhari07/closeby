"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_NAV_ITEMS } from "@/lib/nav/role-nav-items";
import { useShop } from "./shop-context";

/** Desktop-only seller sidebar; mobile keeps the bottom tab bar from the navbar. */
export function DashboardSidebar() {
  const pathname = usePathname();
  const { shop } = useShop();

  return (
    <aside className="bg-card sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 flex-col gap-1 border-r p-3 md:flex">
      <div className="bg-primary text-primary-foreground mb-3 flex items-center gap-3 rounded-xl p-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-white/20">
          <Store className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{shop.name}</p>
          <p className="flex items-center gap-1.5 text-xs opacity-90">
            <span
              className={cn(
                "size-1.5 rounded-full",
                shop.isOpen ? "bg-green-300" : "bg-red-300",
              )}
            />
            {shop.isOpen ? "Open for orders" : "Closed"}
          </p>
        </div>
      </div>

      <p className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
        Seller workspace
      </p>
      {ROLE_NAV_ITEMS.shop_owner.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/dashboard"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
