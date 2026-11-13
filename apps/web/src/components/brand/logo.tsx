import { cn } from "@/lib/cn";

/**
 * The full Rootwell logo (public/brand/rootwell-logo.png, Jenn's artwork, 600 by 186):
 * the mark and the name in Fredoka. The image carries the name, so its alt text is
 * "Rootwell". 186px tall covers every size below at twice the pixels for sharp screens.
 * The mark alone, for small square spaces, is public/brand/rootwell-mark.svg.
 */
const SIZE = { small: "h-8", medium: "h-11", large: "h-16 sm:h-20" } as const;

export function Logo({ size = "small", className }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static image; next/image adds nothing here.
    <img src="/brand/rootwell-logo.png" alt="Rootwell" width={600} height={186} className={cn("w-auto", SIZE[size], className)} />
  );
}
