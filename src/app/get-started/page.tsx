import Link from "next/link";
import { ArrowRight, ShoppingBag, Store } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";

const OPTIONS = [
  {
    role: "buyer",
    title: "I'm a Buyer",
    tagline: "Shop from stores around you",
    Icon: ShoppingBag,
    card: "border-brand-orange/40 bg-brand-orange/10 hover:border-brand-orange",
    badge: "bg-brand-orange text-white",
  },
  {
    role: "shop_owner",
    title: "I own a Shop",
    tagline: "Sell to your neighbourhood",
    Icon: Store,
    card: "border-brand-teal/40 bg-brand-teal/10 hover:border-brand-teal",
    badge: "bg-brand-teal text-white",
  },
] as const;

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode: rawMode } = await searchParams;
  const mode = rawMode === "signin" ? "signin" : "signup";
  const signingIn = mode === "signin";

  return (
    <AuthShell role={null}>
      <h1 className="text-3xl font-black tracking-tight">
        {signingIn ? "Welcome back" : "Join CloseBy"}
      </h1>
      <p className="text-muted-foreground mt-1 mb-6">
        {signingIn ? "Are you signing in as a buyer or a shop owner?" : "Are you a buyer or a shop owner?"}
      </p>

      <div className="flex flex-col gap-3">
        {OPTIONS.map(({ role, title, tagline, Icon, card, badge }) => (
          <Link
            key={role}
            href={`/${signingIn ? "sign-in" : "sign-up"}?role=${role}`}
            className={`group flex items-center gap-4 rounded-2xl border-2 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${card}`}
          >
            <span className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${badge}`}>
              <Icon className="size-7" />
            </span>
            <span className="flex-1">
              <span className="block text-lg font-bold">{title}</span>
              <span className="text-muted-foreground text-sm">{tagline}</span>
            </span>
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        {signingIn ? "New to CloseBy? " : "Already have an account? "}
        <Link
          href={`/get-started?mode=${signingIn ? "signup" : "signin"}`}
          className="text-foreground font-medium underline underline-offset-2"
        >
          {signingIn ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </AuthShell>
  );
}
