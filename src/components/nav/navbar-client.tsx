"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { MapPin, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/lib/store/cart";
import { ROLE_NAV_ITEMS } from "@/lib/nav/role-nav-items";
import type { Role } from "@/types";

export function NavbarClient({
  signedIn,
  role,
  name,
}: {
  signedIn: boolean;
  role: Role | null;
  name: string | null;
}) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const cartCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.qty, 0));

  const homeHref = !signedIn ? "/" : role === "shop_owner" ? "/dashboard" : role ? "/shops" : "/";
  const items = role ? ROLE_NAV_ITEMS[role] : [];

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  }

  async function handleLogout() {
    await signOut({ redirectUrl: "/" });
  }

  return (
    <>
      <header className="bg-background sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href={homeHref} className="flex items-center gap-1.5 font-bold">
            <MapPin className="text-primary size-5" />
            CloseBy
          </Link>

          {!signedIn && (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Sign up</Link>
              </Button>
            </div>
          )}

          {signedIn && (
            <div className="flex items-center gap-1">
              {role && (
                <nav className="hidden items-center gap-1 sm:flex">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Button
                        key={item.href}
                        asChild
                        variant="ghost"
                        size="sm"
                        className={cn("relative gap-1.5", active && "text-primary bg-accent")}
                      >
                        <Link href={item.href}>
                          <Icon className="size-4" />
                          {item.label}
                          {item.badge === "cart" && cartCount > 0 && (
                            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px]">
                              {cartCount}
                            </span>
                          )}
                        </Link>
                      </Button>
                    );
                  })}
                </nav>
              )}
              {name && <span className="text-muted-foreground hidden text-sm sm:inline">{name}</span>}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Logout"
                onClick={handleLogout}
                className="text-muted-foreground"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {signedIn && role && (
        <nav className="bg-background fixed inset-x-0 bottom-0 z-40 flex border-t sm:hidden">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
                  active ? "text-primary font-medium" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                {item.label}
                {item.badge === "cart" && cartCount > 0 && (
                  <span className="bg-primary text-primary-foreground absolute top-1 right-1/4 flex size-4 items-center justify-center rounded-full text-[10px]">
                    {cartCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
