import { cn } from "@/lib/cn";

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("font-display font-bold leading-none tracking-tight", className)}>
      <span className={dark ? "text-foreground" : "text-white"}>Fix</span>
      <span className="text-signal">Now</span>
      <span className={dark ? "text-foreground" : "text-white"}> Mechanics</span>
    </span>
  );
}
