import Link from "next/link";
import { cn } from "@/components/ui";
import type { ActivityFilter } from "./activity-utils";

const OPTIONS: { value: ActivityFilter; label: string; href: string }[] = [
  { value: "tutte", label: "Tutte", href: "/admin/registro" },
  { value: "eventi", label: "Eventi", href: "/admin/registro?tipo=eventi" },
  { value: "prenotazioni", label: "Prenotazioni", href: "/admin/registro?tipo=prenotazioni" },
];

/** Filtro per tipo di prenotazione: link (funziona senza JS), tap target ≥ 44px. */
export function ActivityFilterTabs({ active }: { active: ActivityFilter }) {
  return (
    <nav aria-label="Filtra per tipo" className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        const selected = option.value === active;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-btn border px-4 text-[13px] font-medium uppercase tracking-[0.12em] transition-colors duration-150",
              selected ? "border-petrol bg-petrol text-paper" : "border-sand bg-paper text-ink hover:bg-cream",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
