import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex flex-col justify-center leading-none", className)}>
      <span className="text-lg font-black tracking-[0.16em]">GRAYDOT</span>
      <span className="mt-1 text-[0.55rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Carwash &amp; Auto Detailing
      </span>
    </span>
  );
}
