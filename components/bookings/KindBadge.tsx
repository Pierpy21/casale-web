import { Armchair, CalendarClock, PartyPopper, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { BOOKING_KIND_LABELS, type BookingKind } from "@/lib/types";

/**
 * Tipo di prenotazione: icona + colore + etichetta, leggibili anche in bianco e nero (l'icona è diversa per tipo).
 * evento = pieno petrol; prenotazione = contorno bronzo; appuntamento = grigio tratteggiato.
 */
const KIND_STYLE: Record<BookingKind, { Icon: LucideIcon; className: string }> = {
  evento: { Icon: PartyPopper, className: "border-petrol bg-petrol text-paper" },
  normale: { Icon: Armchair, className: "border-bronze bg-paper text-bronze" },
  appuntamento: { Icon: CalendarClock, className: "border-dashed border-slate bg-cream text-slate-dark" },
};

export interface KindBadgeProps {
  kind: BookingKind;
  className?: string;
  /** Solo icona + testo breve su spazi stretti (le card compatte). */
  compact?: boolean;
}

export function KindBadge({ kind, className, compact = false }: KindBadgeProps) {
  const { Icon, className: tone } = KIND_STYLE[kind];
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className={cn("truncate", compact && "max-w-[7rem]")}>{BOOKING_KIND_LABELS[kind]}</span>
    </span>
  );
}
