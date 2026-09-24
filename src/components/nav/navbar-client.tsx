"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
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
  const [scrolled, setScrolled] = useState(false);

  // Solid at the top of the page; translucent + blurred once the user scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
      <header
        className={cn(
          "sticky top-0 z-40 border-b transition-[background-color,backdrop-filter,box-shadow] duration-300",
          scrolled
            ? "bg-forest/60 border-white/10 shadow-lg shadow-black/10 backdrop-blur-md supports-[backdrop-filter]:bg-forest/55"
            : "bg-forest border-white/10"
        )}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4">
          <Link href={homeHref} aria-label="CloseBy home" className="flex shrink-0 items-center">
            <Logo tone="light" className="h-9" priority />
          </Link>

          {!signedIn && (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="text-cream hover:bg-white/10 hover:text-cream">
                <Link href="/get-started?mode=signin">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/get-started">Sign up</Link>
              </Button>
            </div>
          )}

          {signedIn && (
            <div className="flex min-w-0 items-center gap-1">
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
                        className={cn(
                          "text-cream/80 hover:text-cream relative gap-1.5 hover:bg-white/10",
                          active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                        )}
                      >
                        {/* Icon-only until lg so six tabs never crowd the logo; label as tooltip. */}
                        <Link href={item.href} aria-label={item.label} title={item.label}>
                          <Icon className="size-4" />
                          <span className="hidden lg:inline">{item.label}</span>
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
              {name && <span className="text-cream/70 ml-2 hidden max-w-32 truncate text-sm xl:inline">{name}</span>}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Logout"
                onClick={handleLogout}
                className="text-cream/70 hover:bg-white/10 hover:text-cream"
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
                  active ? "text-primary-ink font-medium" : "text-muted-foreground"
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
