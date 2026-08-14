import { auth } from "@clerk/nextjs/server";
import { MapPin } from "lucide-react";

export async function Footer() {
  const { userId } = await auth();
  // Signed-in app screens are mobile-first with their own bottom tab bar —
  // a marketing-style footer would just fight it for space. Only the
  // logged-out landing/sign-in/sign-up pages get one.
  if (userId) return null;

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4 py-8 text-center">
        <div className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          <MapPin className="size-4" />
          CloseBy
        </div>
       
      </div>
    </footer>
  );
}
