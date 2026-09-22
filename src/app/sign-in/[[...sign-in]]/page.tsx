import { redirect } from "next/navigation";
import { redirectIfSignedIn } from "@/lib/auth/redirect-if-signed-in";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  await redirectIfSignedIn();
  const { role } = await searchParams;
  // Ask "buyer or shop owner?" first, same as sign-up.
  if (role !== "buyer" && role !== "shop_owner") redirect("/get-started?mode=signin");

  return (
    <AuthShell role={role}>
      <SignInForm role={role} />
    </AuthShell>
  );
}
