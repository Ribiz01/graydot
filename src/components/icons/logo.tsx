import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col justify-center leading-none", className)}>
      <span className="truncate text-base font-black tracking-[0.14em] text-sidebar-foreground">GRAYDOT</span>
      <span className="mt-1 truncate text-[0.58rem] font-medium uppercase text-sidebar-foreground/60">
        Carwash &amp; Auto Detailing
      </span>
    </span>
  );
}
