import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getMe } from "@/actions/users";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  MapPin,
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

  return (
    <main className="min-h-svh bg-[#fff8e8] px-4 py-4 text-[#17120f] sm:px-6 sm:py-6 lg:px-10">

      {/* Main Website Container */}
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-white shadow-sm">

        {/* NAVBAR */}
        <header className="flex h-20 items-center justify-between px-6 sm:px-10 lg:px-14">

          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-[#f28c28] text-white">
              <MapPin className="size-4" />
            </div>

            <span className="text-xl font-black tracking-tight">
              Close<span className="text-[#f28c28]">By</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 text-sm font-medium text-black/60 md:flex">
            <Link
              href="/shops"
              className="transition hover:text-black"
            >
              Explore Shops
            </Link>

            <Link
              href="/sign-up"
              className="transition hover:text-black"
            >
              Become a Shop Owner
            </Link>
          </div>

          <Link
            href="/sign-in"
            className="flex size-10 items-center justify-center rounded-full bg-[#f5a623] text-white transition hover:bg-[#e89212]"
          >
            <ArrowRight className="size-4" />
          </Link>
        </header>

        {/* HERO */}
        <section className="grid min-h-[620px] overflow-hidden lg:grid-cols-2">

          {/* LEFT VISUAL */}
          <div className="relative flex min-h-[400px] items-end justify-center overflow-hidden bg-[#ffe8df] px-5 pt-10 sm:px-10 lg:min-h-[620px]">

            {/* Organic background shape */}
            <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[#ffd9c8]" />

            <div className="absolute bottom-[-120px] right-[-100px] h-[330px] w-[330px] rounded-full bg-[#f28c28]/15" />

            {/* Image */}
            <div className="relative z-10 h-full w-full max-w-[650px]">

              <div
                className="absolute inset-0 bg-contain bg-bottom bg-no-repeat"
                style={{
                  backgroundImage:
                    "url('https://i.pinimg.com/736x/d1/5b/93/d15b931ff4c9eb158841710389802d1a.jpg')",
                }}
              />

              {/* Image fade */}
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#ffe8df] to-transparent" />
            </div>

            {/* Floating location badge */}
            <div className="absolute bottom-7 left-6 z-20 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold shadow-lg sm:left-10">
              <MapPin className="size-3.5 text-[#f28c28]" />
              Guna, Madhya Pradesh
            </div>
          </div>

          {/* RIGHT CONTENT */}
          <div className="flex items-center bg-white px-7 py-14 sm:px-12 lg:px-16 xl:px-20">

            <div className="max-w-xl">

              {/* Eyebrow */}
              <div className="mb-6 inline-flex rounded-full bg-[#fff0df] px-4 py-2 text-xs font-semibold text-[#df7511]">
                Discover Local. Shop Local.
              </div>

              {/* Heading */}
              <h1 className="text-[48px] font-black leading-[0.95] tracking-[-0.04em] sm:text-[60px] lg:text-[66px] xl:text-[74px]">
                Everything
                <br />
                you need,
                <br />
                <span className="text-[#f28c28]">
                  CloseBy.
                </span>
              </h1>

              {/* Description */}
              <p className="mt-7 max-w-lg text-base leading-7 text-black/55 sm:text-lg">
                Discover kirana, pharmacy, stationery, bakery and
                other local stores around you. Shop directly from
                your neighbourhood and support local businesses.
              </p>

              {/* CTA */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">

                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-full bg-[#f28c28] px-7 font-bold text-white hover:bg-[#e47d17]"
                >
                  <Link href="/sign-up">
                    Start Shopping
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-black/10 bg-white px-7 font-semibold text-black hover:bg-black/5"
                >
                  <Link href="/sign-in">
                    I have an account
                  </Link>
                </Button>

              </div>

              {/* Small trust row */}
              <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-black/10 pt-6">

                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-full bg-[#fff0df]">
                    <ShoppingBag className="size-4 text-[#f28c28]" />
                  </div>

                  <div>
                    <p className="text-sm font-bold">
                      Shop Nearby
                    </p>
                    <p className="text-xs text-black/40">
                      Local stores
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-full bg-[#fff0df]">
                    <Store className="size-4 text-[#f28c28]" />
                  </div>

                  <div>
                    <p className="text-sm font-bold">
                      Local Sellers
                    </p>
                    <p className="text-xs text-black/40">
                      Support businesses
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* CATEGORY STRIP */}
        <section className="border-t border-black/5 bg-white px-6 py-8 sm:px-10 lg:px-14">

          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-sm font-semibold text-black/25 sm:justify-between">

            <span>KIRANA</span>
            <span>PHARMACY</span>
            <span>STATIONERY</span>
            <span>BAKERY</span>
            <span>LOCAL SHOPS</span>
            <span>GUNA</span>

          </div>
        </section>

        {/* SHOP OWNER SECTION */}
        <section className="mx-5 mb-5 overflow-hidden rounded-3xl bg-[#20201e] px-7 py-10 text-white sm:px-12 lg:px-16">

          <div className="flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">

            <div>
              <div className="mb-3 flex items-center gap-2 text-[#f28c28]">
                <Store className="size-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  For Shop Owners
                </span>
              </div>

              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Bring your shop
                <br />
                <span className="text-[#f28c28]">
                  CloseBy.
                </span>
              </h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-white/50">
                List your store, reach nearby customers and grow
                your local business with CloseBy.
              </p>
            </div>

            <Button
              asChild
              size="lg"
              className="rounded-full bg-[#f28c28] px-7 font-bold text-white hover:bg-[#e47d17]"
            >
              <Link href="/sign-up">
                List Your Shop
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>

          </div>
        </section>

      </div>

      {/* Footer */}
      <p className="py-5 text-center text-xs font-medium text-black/30">
        © {new Date().getFullYear()} CloseBy · Local shopping made simple.
      </p>
    </main>
  );
}