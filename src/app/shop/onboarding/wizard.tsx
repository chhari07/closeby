"use client";

import { useState } from "react";
import type { ShopDoc } from "@/types";
import { StepType } from "./step-type";
import { StepDetails } from "./step-details";
import { StepLocation } from "./step-location";
import { StepInventory } from "./step-inventory";

const STEP_LABELS = ["Shop type", "Details", "Location", "Inventory"];

export function OnboardingWizard({ initialShop }: { initialShop: ShopDoc | null }) {
  const [shop, setShop] = useState<ShopDoc | null>(initialShop);
  const [step, setStep] = useState<number>(initialShop?.onboardingStep ?? 1);

  function goTo(n: number) {
    setStep(Math.min(4, Math.max(1, n)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Set up your shop</h1>
        <p className="text-muted-foreground text-sm">
          Progress is saved automatically — you can leave and come back anytime.
        </p>
      </div>

      <ol className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = shop ? n < (shop.onboardingStep ?? 1) || shop.status === "live" : false;
          const active = n === step;
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => n <= (shop?.onboardingStep ?? 1) && goTo(n)}
                className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary/20 text-primary-ink"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {n}
              </button>
              <span className="text-muted-foreground text-center text-[11px]">{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <StepType
          initialType={shop?.type ?? null}
          onSaved={(updatedShop) => {
            setShop(updatedShop);
            goTo(2);
          }}
        />
      )}
      {step === 2 && shop && (
        <StepDetails
          shopId={shop.id}
          initial={shop}
          onBack={() => goTo(1)}
          onSaved={(updatedShop) => {
            setShop(updatedShop);
            goTo(3);
          }}
        />
      )}
      {step === 3 && shop && (
        <StepLocation
          shopId={shop.id}
          initial={shop}
          onBack={() => goTo(2)}
          onSaved={(updatedShop) => {
            setShop(updatedShop);
            goTo(4);
          }}
        />
      )}
      {step === 4 && shop && (
        <StepInventory shopId={shop.id} onBack={() => goTo(3)} />
      )}
    </div>
  );
}
