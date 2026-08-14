import type { LucideIcon } from "lucide-react";
import { LayoutGrid, ClipboardList, Package, Settings, MapPin, ShoppingCart, User } from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shows a live badge (e.g. cart item count) next to this item. */
  badge?: "cart";
}

// Single source of truth for role-based nav destinations — used by both the
// top bar (sm:+) and the mobile bottom tab bar so they never drift apart.
export const ROLE_NAV_ITEMS: Record<Role, NavItem[]> = {
  buyer: [
    { href: "/shops", label: "Shops", icon: MapPin },
    { href: "/orders", label: "Orders", icon: ClipboardList },
    { href: "/cart", label: "Cart", icon: ShoppingCart, badge: "cart" },
    { href: "/profile", label: "Profile", icon: User },
  ],
  shop_owner: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
    { href: "/dashboard/orders", label: "Orders", icon: ClipboardList },
    { href: "/dashboard/inventory", label: "Inventory", icon: Package },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
    { href: "/profile", label: "Profile", icon: User },
  ],
};
