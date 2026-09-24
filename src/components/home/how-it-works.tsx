import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";
import { FindShopArt, CartArt, TrackArt, ListShopArt, AddProductsArt, GrowArt } from "./illustrations";

interface Step {
  title: string;
  text: string;
  Art: () => React.ReactNode;
}

const BUYER_STEPS: Step[] = [
  {
    title: "Find a shop near you",
    text: "Browse kirana, pharmacy, bakery and other stores in your neighbourhood, or just search for what you need.",
    Art: FindShopArt,
  },
  {
    title: "Add to cart and pay",
    text: "Pick your items and pay online with UPI / card, or choose cash on delivery.",
    Art: CartArt,
  },
  {
    title: "Track and chat",
    text: "See your order go from placed to accepted to ready, and message the shop if you need anything.",
    Art: TrackArt,
  },
];

const OWNER_STEPS: Step[] = [
  {
    title: "List your shop",
    text: "Sign up as a shop owner and add your shop's name, address and timings.",
    Art: ListShopArt,
  },
  {
    title: "Add your products",
    text: "Add items one by one, say or snap them with AI, or upload a filled Excel / CSV sheet.",
    Art: AddProductsArt,
  },
  {
    title: "Get orders, grow",
    text: "Accept orders from nearby customers and follow your sales in simple reports.",
    Art: GrowArt,
  },
];

function StepRow({ heading, steps }: { heading: string; steps: Step[] }) {
  return (
    <div>
      <Reveal>
        <p className="text-brand-lime text-xs font-bold tracking-widest uppercase">{heading}</p>
      </Reveal>
      <ol className="mt-5 grid gap-5 md:grid-cols-3">
        {steps.map(({ title, text, Art }, i) => (
          <li key={title} className="relative">
            <Reveal delay={i * 0.15} className="h-full">
              <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 p-4 transition duration-300 hover:-translate-y-1 hover:border-brand-lime/40 hover:bg-white/10">
                <div className="bg-cream overflow-hidden rounded-xl">
                  <Art />
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <span className="bg-brand-lime text-forest flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold transition group-hover:rotate-12">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-extrabold tracking-wide uppercase">{title}</p>
                    <p className="text-cream/70 mt-1 text-sm leading-6">{text}</p>
                  </div>
                </div>
              </div>
            </Reveal>
            {i < steps.length - 1 && (
              <ArrowRight
                aria-hidden
                className="cb-float text-brand-lime absolute top-1/3 -right-4 z-10 hidden size-5 md:block"
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-forest text-cream px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="text-center">
          <h2 className="text-5xl leading-[0.95] sm:text-6xl">
            How <span className="text-brand-lime">CloseBy</span> works
          </h2>
          <p className="text-cream/70 mx-auto mt-4 max-w-xl text-sm leading-6 sm:text-base">
            Three simple steps, whether you are shopping or selling.
          </p>
        </Reveal>
        <div className="mt-12 flex flex-col gap-14">
          <StepRow heading="For shoppers" steps={BUYER_STEPS} />
          <StepRow heading="For shop owners" steps={OWNER_STEPS} />
        </div>
      </div>
    </section>
  );
}
