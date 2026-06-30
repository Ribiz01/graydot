import { cn } from "@/lib/utils";
import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/logo.png"
      alt="Tee-Dot Car Care Express"
      width={240}
      height={120}
      className={cn("object-contain w-auto", className)}
      priority
    />
  );
}
