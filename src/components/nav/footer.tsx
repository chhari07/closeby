import { layoutUserId } from "@/lib/auth/layout-user";
import { Logo } from "@/components/logo";

export async function Footer() {
  const userId = await layoutUserId();
  // Signed-in app screens are mobile-first with their own bottom tab bar —
  // a marketing-style footer would just fight it for space. Only the
  // logged-out landing/sign-in/sign-up pages get one.
  if (userId) return null;

  return (
    <footer className="bg-forest text-cream">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4 py-8 text-center">
        <Logo tone="light" className="h-12" />
        <p className="text-cream/60 text-sm font-medium">Local Stores Stronger Together</p>
      </div>
    </footer>
  );
}
