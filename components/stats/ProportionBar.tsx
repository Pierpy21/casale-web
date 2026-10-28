import { cn } from "@/components/ui/cn";

export interface ProportionBarProps {
  value: number;
  /** Valore che corrisponde al 100%. */
  max: number;
  tone?: "petrol" | "bronze";
  className?: string;
}

/** Barra proporzionale decorativa (il numero è sempre scritto accanto). */
export function ProportionBar({ value, max, tone = "petrol", className }: ProportionBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div aria-hidden="true" className={cn("h-2 w-full overflow-hidden rounded-full bg-cream", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tone === "bronze" ? "bg-bronze" : "bg-petrol")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
