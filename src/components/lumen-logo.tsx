import { cn } from "@/lib/utils";

/**
 * Lumen logomark — a thin ring with a centered dot.
 * Uses `currentColor`, so it flips automatically with the theme
 * (white on black in dark, black on white in light).
 */
export function LumenMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      aria-hidden
    >
      <circle cx="16" cy="16" r="13.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="3.25" fill="currentColor" />
    </svg>
  );
}

export function LumenLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LumenMark />
      <span className="font-serif text-xl tracking-tight text-foreground">Lumen</span>
    </div>
  );
}
