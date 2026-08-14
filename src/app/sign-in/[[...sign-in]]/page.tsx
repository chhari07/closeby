import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-secondary/40 p-4">
      <SignIn />
    </div>
  );
}
