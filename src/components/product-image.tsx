import { cn } from "@/lib/utils";

// Plain <img> on purpose: imported products can point at any https host and
// the bundled samples are SVGs, neither of which suits next/image's
// allow-listed optimizer.
export function ProductImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn("bg-muted relative overflow-hidden", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="text-muted-foreground flex size-full items-center justify-center text-xs">
          No image
        </div>
      )}
    </div>
  );
}
