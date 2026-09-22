import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The closeBy logo. `tone="light"` is the cream + lime version for dark
 * backgrounds; `tone="dark"` is the forest + orange version for cream ones.
 */
export function Logo({
  className,
  tone = "dark",
  priority,
}: {
  className?: string;
  tone?: "light" | "dark";
  priority?: boolean;
}) {
  const light = tone === "light";
  return (
    <Image
      src={light ? "/closeby-logo-light.png" : "/closeby-logo-dark.png"}
      alt="CloseBy"
      width={light ? 570 : 619}
      height={light ? 217 : 230}
      priority={priority}
      className={cn("h-9 w-auto", className)}
    />
  );
}
