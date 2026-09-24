import type { LucideIcon } from "lucide-react";
import { Reveal } from "./reveal";
import { SearchPhoneArt } from "./illustrations";
import {
  MapPin,
  Search,
  MessageSquare,
  Wallet,
  Mic,
  ChartColumn,
  Lightbulb,
  BadgeIndianRupee,
} from "lucide-react";

interface Feature {
  title: string;
  text: string;
  icon: LucideIcon;
  for: "Shoppers" | "Shop owners" | "Everyone";
  ring: string;
}

const FEATURES: Feature[] = [
  {
    title: "Shops near you",
    text: "Every store on CloseBy is from your own area, so orders arrive fast.",
    icon: MapPin,
    for: "Shoppers",
    ring: "border-brand-lime",
  },
  {
    title: "Search your way",
    text: "Type it how you say it: \"doodh\", \"chawal\" or \"milk\" all find the right thing.",
    icon: Search,
    for: "Shoppers",
    ring: "border-brand-sky",
  },
  {
    title: "Pay how you like",
    text: "UPI, card or cash on delivery.",
    icon: Wallet,
    for: "Shoppers",
    ring: "border-brand-yellow",
  },
  {
    title: "Chat with the shop",
    text: "Ask about an item or your order directly from the app.",
    icon: MessageSquare,
    for: "Everyone",
    ring: "border-brand-blue",
  },
  {
    title: "Add stock by voice or photo",
    text: "Say what came in or snap a shelf, and AI makes the product list for you to check.",
    icon: Mic,
    for: "Shop owners",
    ring: "border-brand-orange",
  },
  {
    title: "Simple sales reports",
    text: "See what sells, what is running low and how your shop is doing.",
    icon: ChartColumn,
    for: "Shop owners",
    ring: "border-brand-green",
  },
  {
    title: "Ideas to grow",
    text: "Get practical suggestions based on your own orders and stock.",
    icon: Lightbulb,
    for: "Shop owners",
    ring: "border-brand-yellow",
  },
  {
    title: "No big-platform fees",
    text: "Built for local shops, so more of every sale stays with you.",
    icon: BadgeIndianRupee,
    for: "Shop owners",
    ring: "border-brand-lime",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-cream overflow-hidden px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="text-center">
          <h2 className="text-forest text-5xl leading-[0.95] sm:text-6xl">Features</h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-sm leading-6 sm:text-base">
            Everything you need to shop local, or to run a local shop.
          </p>
        </Reveal>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[300px_1fr]">
          <Reveal className="mx-auto w-full max-w-[260px] lg:max-w-none">
            <SearchPhoneArt />
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ title, text, icon: Icon, for: audience, ring }, i) => (
              <Reveal key={title} delay={(i % 2) * 0.1 + Math.floor(i / 2) * 0.08} className="h-full">
                <div className="group bg-card flex h-full gap-4 rounded-2xl border p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-forest/10">
                  <div
                    className={`badge-sticker ${ring} flex size-12 shrink-0 items-center justify-center group-hover:[animation:cb-wiggle_0.5s_ease-in-out]`}
                  >
                    <Icon className="text-brand-lime size-5" />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-sm font-extrabold tracking-wide uppercase">{title}</p>
                    <p className="text-muted-foreground mt-1 flex-1 text-sm leading-6">{text}</p>
                    <p className="text-primary-ink mt-2 text-[11px] font-bold tracking-widest uppercase">
                      {audience}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
