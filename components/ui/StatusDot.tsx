import { STATUS_COLORS, STATUS_LABELS, type BookingStatus } from "@/lib/types";
import { cn } from "./cn";

const ORDER: BookingStatus[] = ["opzione", "confermato", "saldato", "annullato"];

export interface StatusDotProps {
  status: BookingStatus;
  size?: "sm" | "md";
  /** Su sfondo petrol/scuro: anello chiaro perché il pallino resti visibile. */
  onDark?: boolean;
  className?: string;
}

/** Pallino colorato dello stato. Nessun testo visibile: etichetta solo in title / aria-label. */
export function StatusDot({ status, size = "md", onDark = false, className }: StatusDotProps) {
  const label = STATUS_LABELS[status];
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" ? "size-2" : "size-2.5",
        onDark ? "ring-2 ring-paper/80" : "ring-1 ring-ink/15",
        className,
      )}
      style={{ backgroundColor: STATUS_COLORS[status] }}
    />
  );
}

/** Legenda compatta dei 4 stati: pallino + etichetta, testo piccolo. */
export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Legenda stati"
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate", className)}
    >
      {ORDER.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <StatusDot status={status} size="sm" />
          <span>{STATUS_LABELS[status]}</span>
        </li>
      ))}
    </ul>
  );
}
