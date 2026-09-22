import Link from "next/link";
import { Check, ShoppingBag, Store } from "lucide-react";
import { BuyerIllustration, ShopIllustration } from "./auth-illustrations";

export type AuthRole = "buyer" | "shop_owner";

const COPY: Record<
  AuthRole,
  { label: string; headline: string; points: string[]; chip: string; tick: string; Illustration: typeof ShopIllustration; Icon: typeof Store }
> = {
  buyer: {
    label: "Buyer",
    headline: "Everything you need, CloseBy.",
    points: ["Discover kirana, pharmacy & bakery nearby", "Search, filter and add to cart in seconds", "Track every order live"],
    chip: "bg-brand-lime text-forest",
    tick: "bg-brand-lime text-forest",
    Illustration: BuyerIllustration,
    Icon: ShoppingBag,
  },
  shop_owner: {
    label: "Shop owner",
    headline: "Bring your shop CloseBy.",
    points: ["Set up your shop in minutes", "Import inventory from JSON or CSV", "Manage orders from one dashboard"],
    chip: "bg-brand-sky text-forest",
    tick: "bg-brand-sky text-forest",
    Illustration: ShopIllustration,
    Icon: Store,
  },
};

/**
 * Shared frame for the role picker, sign-in and sign-up so all three look
 * like one flow. `data-role` re-themes the primary colour for the shop-owner
 * side (see globals.css) even though the visitor is signed out here. The
 * brand panel uses the same forest + cream look as the home hero and
 * footer, with a buyer or shop illustration; owners get the deeper teal `--panel` from the same theme.
 */
export function AuthShell({
  role,
  children,
}: {
  role: AuthRole | null;
  children: React.ReactNode;
}) {
  const copy = role ? COPY[role] : null;

  return (
    <div data-role={role ?? undefined} className="grid min-h-svh lg:grid-cols-[5fr_6fr]">
      {/* Brand panel */}
      <aside className="bg-panel text-cream relative hidden flex-col justify-between overflow-hidden lg:flex">
        <div className="relative flex flex-1 flex-col justify-between gap-8 p-10">
          <div>
            {copy ? (
              <>
                <span
                  className={`mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${copy.chip}`}
                >
                  <copy.Icon className="size-4" /> {copy.label}
                </span>
                <h2 className="text-5xl leading-[1.05] font-black">{copy.headline}</h2>
                <ul className="mt-8 flex flex-col gap-3.5 text-sm text-cream/90">
                  {copy.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${copy.tick}`}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2 className="text-5xl leading-[1.05] font-black">
                  Local shopping,
                  <br />
                  <span className="text-multicolor">made simple.</span>
                </h2>
                <p className="text-cream/80 mt-5 max-w-sm text-sm">
                  Whether you buy or sell, CloseBy connects you with your neighbourhood in Guna.
                </p>
              </>
            )}
          </div>

          {copy ? (
            <copy.Illustration className="mx-auto max-w-sm" />
          ) : (
            <div className="mx-auto flex w-full max-w-md items-end gap-2">
              <BuyerIllustration className="w-1/2" />
              <ShopIllustration className="w-1/2" />
            </div>
          )}

          <p className="text-cream/60 text-xs">© {new Date().getFullYear()} CloseBy</p>
        </div>
      </aside>

      {/* Form side */}
      <main className="bg-background flex flex-col">
        {/* Compact brand banner (the side panel is desktop-only) */}
        <div className="bg-panel text-cream relative overflow-hidden lg:hidden">
          <div className="flex items-center justify-between px-5 pt-4">
     
            {copy && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${copy.chip}`}
              >
                <copy.Icon className="size-3.5" /> {copy.label}
              </span>
            )}
          </div>
          <div className="flex items-end gap-2 pl-5 pr-3 pt-2">
            <div className="flex-1 pb-9">
              <h2 className="text-[1.65rem] leading-[1.1] font-black">
                {copy ? copy.headline : "Local shopping, made simple."}
              </h2>
              <p className="text-cream/75 mt-2 text-xs">
                {copy ? copy.points[0] : "Connecting you with your neighbourhood in Guna."}
              </p>
            </div>
            {copy ? (
              <copy.Illustration className="w-36 shrink-0 sm:w-44" />
            ) : (
              <div className="flex w-40 shrink-0 items-end sm:w-48">
                <BuyerIllustration className="w-1/2" />
                <ShopIllustration className="w-1/2" />
              </div>
            )}
          </div>
        </div>
        <div className="bg-background relative -mt-6 flex flex-1 items-start justify-center rounded-t-3xl p-5 pb-10 sm:p-8 lg:mt-0 lg:items-center lg:rounded-none">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** Small coloured chip shown above a form: "Buyer" / "Shop owner" + change link. */
export function RoleBanner({ role, mode }: { role: AuthRole; mode: "signin" | "signup" }) {
  const owner = role === "shop_owner";
  const Icon = owner ? Store : ShoppingBag;
  return (
    <div
      className={`mb-6 flex items-center gap-3 rounded-2xl border p-3 ${
        owner ? "border-brand-teal/30 bg-brand-teal/10" : "border-brand-orange/30 bg-brand-orange/10"
      }`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-xl text-white ${
          owner ? "bg-brand-teal" : "bg-brand-orange"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex-1 text-sm">
        <p className="font-semibold">
          {mode === "signin" ? "Signing in as" : "Signing up as"} {owner ? "a shop owner" : "a buyer"}
        </p>
        <Link href={`/get-started?mode=${mode}`} className="text-muted-foreground underline underline-offset-2">
          Not you? Change
        </Link>
      </div>
    </div>
  );
}
