import { cn } from "@/lib/utils";

/**
 * Flat illustrations for the auth brand panel. Colours come from the theme
 * tokens (Tailwind `fill-*` / `stroke-*` on the `--color-*` variables), so they
 * follow the forest / cream / lime palette instead of hard-coded hex values.
 */

type IllustrationProps = { className?: string };

/** A kirana storefront: sign, scalloped awning, windows with goods, door, crates. */
export function ShopIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 400 260" role="img" aria-hidden="true" className={cn("h-auto w-full", className)}>
      {/* ground */}
      <rect x="10" y="228" width="380" height="4" rx="2" className="fill-cream/30" />

      {/* building */}
      <rect x="90" y="96" width="220" height="132" rx="6" className="fill-cream" />

      {/* sign */}
      <rect x="150" y="46" width="100" height="28" rx="14" className="fill-brand-yellow" />
      <text x="200" y="65" textAnchor="middle" className="fill-forest text-[14px] font-black">
        OPEN
      </text>
      <rect x="196" y="74" width="8" height="12" className="fill-brand-yellow" />

      {/* scalloped awning */}
      <rect x="80" y="84" width="240" height="26" rx="4" className="fill-brand-sky" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={100 + i * 40} cy={110} r={20} className="fill-brand-sky" />
      ))}

      {/* windows with goods */}
      <rect x="105" y="146" width="58" height="52" rx="4" className="fill-brand-sky/50" />
      <rect x="237" y="146" width="58" height="52" rx="4" className="fill-brand-sky/50" />
      <rect x="105" y="178" width="58" height="4" className="fill-forest/40" />
      <rect x="237" y="178" width="58" height="4" className="fill-forest/40" />
      <circle cx="120" cy="170" r="8" className="fill-brand-orange" />
      <circle cx="140" cy="170" r="8" className="fill-brand-lime" />
      <rect x="150" y="160" width="9" height="18" rx="2" className="fill-brand-blue" />
      <rect x="248" y="162" width="16" height="16" rx="3" className="fill-brand-lime" />
      <rect x="270" y="158" width="16" height="20" rx="3" className="fill-brand-orange" />

      {/* door */}
      <rect x="176" y="150" width="48" height="78" rx="4" className="fill-panel" />
      <circle cx="214" cy="192" r="3" className="fill-brand-yellow" />

      {/* crates + plant */}
      <rect x="38" y="200" width="42" height="28" rx="3" className="fill-brand-orange" />
      <rect x="38" y="212" width="42" height="3" className="fill-forest/30" />
      <circle cx="52" cy="194" r="8" className="fill-brand-lime" />
      <circle cx="68" cy="196" r="7" className="fill-brand-yellow" />
      <rect x="326" y="208" width="26" height="20" rx="3" className="fill-brand-peach" />
      <circle cx="339" cy="198" r="12" className="fill-brand-lime" />
    </svg>
  );
}

/** A buyer with shopping bags and a location pin. */
export function BuyerIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 400 260" role="img" aria-hidden="true" className={cn("h-auto w-full", className)}>
      {/* ground */}
      <rect x="10" y="228" width="380" height="4" rx="2" className="fill-cream/30" />

      {/* location pin */}
      <path
        d="M318 40c-16 0-28 12-28 27 0 20 28 46 28 46s28-26 28-46c0-15-12-27-28-27Z"
        className="fill-brand-orange"
      />
      <circle cx="318" cy="67" r="10" className="fill-cream" />
      <ellipse cx="318" cy="122" rx="16" ry="4" className="fill-cream/25" />

      {/* legs + shoes */}
      <rect x="182" y="184" width="16" height="42" rx="6" className="fill-cream" />
      <rect x="206" y="184" width="16" height="42" rx="6" className="fill-cream" />
      <rect x="176" y="220" width="26" height="9" rx="4" className="fill-brand-orange" />
      <rect x="202" y="220" width="26" height="9" rx="4" className="fill-brand-orange" />

      {/* arms (behind torso) */}
      <line x1="178" y1="128" x2="134" y2="170" strokeWidth="12" strokeLinecap="round" className="stroke-brand-peach" />
      <line x1="226" y1="128" x2="270" y2="158" strokeWidth="12" strokeLinecap="round" className="stroke-brand-peach" />

      {/* torso */}
      <rect x="168" y="108" width="68" height="86" rx="26" className="fill-brand-lime" />

      {/* head + cap */}
      <rect x="192" y="96" width="20" height="16" rx="6" className="fill-brand-peach" />
      <circle cx="202" cy="78" r="26" className="fill-brand-peach" />
      <path d="M176 76a26 26 0 0 1 52 0c-16-8-36-8-52 0Z" className="fill-brand-blue" />
      <rect x="214" y="72" width="26" height="7" rx="3.5" className="fill-brand-blue" />
      <circle cx="194" cy="82" r="2.5" className="fill-forest" />
      <circle cx="210" cy="82" r="2.5" className="fill-forest" />
      <path d="M195 91q7 6 14 0" fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-forest" />

      {/* bags */}
      <path d="M124 166c0-14 20-14 20 0" fill="none" strokeWidth="3" className="stroke-cream" />
      <rect x="108" y="164" width="52" height="58" rx="6" className="fill-brand-yellow" />
      <rect x="108" y="180" width="52" height="4" className="fill-forest/25" />
      <path d="M262 154c0-14 22-14 22 0" fill="none" strokeWidth="3" className="stroke-cream" />
      <rect x="248" y="152" width="50" height="56" rx="6" className="fill-brand-orange" />
      <circle cx="273" cy="180" r="9" className="fill-cream/90" />
    </svg>
  );
}
