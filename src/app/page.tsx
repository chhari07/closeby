import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getMe } from "@/actions/users";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  MapPin,
  Leaf,
  Pill,
  PencilLine,
  Croissant,
  Coffee,
  Handshake,
  Store,
  ShoppingBag,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    const me = await getMe();

    if (!me?.role) {
      redirect("/onboarding/role");
    }

    redirect(me.role === "shop_owner" ? "/dashboard" : "/shops");
  }

  const categories = [
    { label: "Kirana", note: "Fresh daily essentials", icon: ShoppingBag, ring: "border-brand-lime" },
    { label: "Pharmacy", note: "Health closer, always", icon: Pill, ring: "border-brand-sky" },
    { label: "Stationery", note: "Books, pens, big ideas", icon: PencilLine, ring: "border-brand-blue" },
    { label: "Bakery", note: "Fresh bakes, happier days", icon: Croissant, ring: "border-brand-orange" },
    { label: "Fresh Mart", note: "Fruits, veggies, always fresh", icon: Leaf, ring: "border-brand-green" },
    { label: "Café", note: "Good food, better conversations", icon: Coffee, ring: "border-brand-yellow" },
  ];

  return (
    <main>
      {/* HERO — dark forest, big display type, illustration underneath */}
      <section className="bg-forest text-cream relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-6 pt-16 text-center sm:pt-24">
          <h1 className="text-[56px] leading-[0.92] sm:text-[88px] lg:text-[112px]">
            Everything you need,
            <br />
            <span className="text-brand-lime">CloseBy.</span>
          </h1>

          <p className="text-cream/80 mx-auto mt-6 max-w-xl text-sm leading-6 sm:text-base">
            Discover kirana, pharmacy, stationery, bakery and other local stores around you. Shop
            directly from your neighbourhood and support local businesses.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 rounded-md px-6 text-xs font-extrabold tracking-wider uppercase">
              <Link href="/sign-up?role=buyer">
                Start shopping
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="text-cream h-11 rounded-md border-white/25 bg-transparent px-6 text-xs font-bold tracking-wider uppercase hover:bg-white/10 hover:text-cream"
            >
              <Link href="/get-started?mode=signin">I have an account</Link>
            </Button>
          </div>
        </div>

        <div className="relative mt-10 aspect-[1916/821] min-h-[260px] w-full">
          <Image
            src="/closeby-hero.png"
            alt="Illustrated neighbourhood street with a kirana, pharmacy, stationery, bakery, fresh mart and café"
            fill
            priority
            sizes="100vw"
            className="object-cover object-bottom"
          />
          <div className="from-forest absolute inset-x-0 top-0 h-16 bg-gradient-to-b to-transparent" />
          <div className="bg-card text-foreground absolute bottom-5 left-5 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg sm:left-10">
            <MapPin className="text-primary-ink size-3.5" />
            Guna, Madhya Pradesh
          </div>
        </div>
      
      </section>

      {/* MISSION — cream, big heading, sticker badges */}
      <section className="bg-cream px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-forest text-5xl leading-[0.95] sm:text-7xl lg:text-8xl">
            Good for your street.
            <br />
            And your business.
          </h2>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-sm leading-6 sm:text-base">
            We are on a mission to help local shops grow. Shoppers find what they need a few steps
            away, and shop owners reach more neighbours — no big-platform fees getting in the way.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="h-11 rounded-md px-6 text-xs font-extrabold tracking-wider uppercase">
              <Link href="/shops">Explore shops</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map(({ label, note, icon: Icon, ring }) => (
            <div key={label} className="flex flex-col items-center text-center">
              <div
                className={`badge-sticker ${ring} flex size-24 items-center justify-center transition hover:-rotate-6 sm:size-28`}
              >
                <Icon className="text-brand-lime size-9" />
              </div>
              <p className="mt-3 text-sm font-extrabold tracking-wide uppercase">{label}</p>
              <p className="text-muted-foreground text-xs leading-snug">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SHOP OWNER */}
      <section className="bg-forest text-cream px-6 py-16 sm:py-20">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <div className="text-brand-lime mb-3 flex items-center gap-2">
              <Store className="size-4" />
              <span className="text-xs font-bold tracking-widest uppercase">For shop owners</span>
            </div>
            <h2 className="text-5xl leading-[0.95] sm:text-6xl">
              Bring your shop
              <br />
              <span className="text-brand-lime">CloseBy.</span>
            </h2>
            <p className="text-cream/70 mt-4 max-w-md text-sm leading-6">
              List your store, reach nearby customers and grow your local business with CloseBy.
            </p>
          </div>
          <Button asChild size="lg" className="h-11 rounded-md px-6 text-xs font-extrabold tracking-wider uppercase">
            <Link href="/sign-up?role=shop_owner">
              List your shop
              <Handshake className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <p className="text-muted-foreground bg-cream py-5 text-center text-xs font-medium">
        © {new Date().getFullYear()} CloseBy · Shop Local, Support Local.
      </p>
    </main>
  );
}
