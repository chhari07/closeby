import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HowItWorks } from "@/components/home/how-it-works";
import { Features } from "@/components/home/features";

export const metadata: Metadata = {
  title: "Features & how it works · CloseBy",
  description: "How CloseBy works for shoppers and shop owners, and everything it can do.",
};

export default async function HowItWorksPage() {
  const { userId } = await auth();

  return (
    <main>
      <section className="bg-cream px-6 py-16 text-center sm:py-20">
        <h1 className="text-forest text-[48px] leading-[0.92] sm:text-[72px]">
          Shop local, <span className="text-primary-ink">made simple.</span>
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-sm leading-6 sm:text-base">
          CloseBy connects you with the shops on your own street. Here is how it works and what you
          can do with it.
        </p>
      </section>

      <HowItWorks />
      <Features />

      {!userId && (
        <section className="bg-forest text-cream px-6 py-16 text-center">
          <h2 className="text-4xl leading-[0.95] sm:text-5xl">
            Ready to get <span className="text-brand-lime">CloseBy?</span>
          </h2>
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
              <Link href="/sign-up?role=shop_owner">
                List your shop
                <Handshake className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      <p className="text-muted-foreground bg-cream py-5 text-center text-xs font-medium">
        © {new Date().getFullYear()} CloseBy · Shop Local, Support Local.
      </p>
    </main>
  );
}
