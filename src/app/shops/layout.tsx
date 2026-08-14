import { requireOnboardedUser } from "@/lib/auth/guards";

export default async function ShopsLayout({ children }: { children: React.ReactNode }) {
  // Both buyers and shop owners may browse shops — just needs onboarding done.
  await requireOnboardedUser();
  return <>{children}</>;
}
