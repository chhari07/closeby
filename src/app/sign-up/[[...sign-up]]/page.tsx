import { redirect } from "next/navigation";
import { redirectIfSignedIn } from "@/lib/auth/redirect-if-signed-in";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  await redirectIfSignedIn();
  const { role } = await searchParams;
  // No role yet → send them to the Buyer / Shop-owner picker first.
  if (role !== "buyer" && role !== "shop_owner") redirect("/get-started?mode=signup");

  return (
    <AuthShell role={role}>
      <SignUpForm role={role} />
    </AuthShell>
  );
}
