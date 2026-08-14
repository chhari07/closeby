import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-secondary/40 p-4">
      <SignUp />
    </div>
  );
}
