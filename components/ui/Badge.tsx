import type { HTMLAttributes } from "react";
import { SETUP_COLOR_HEX, SETUP_COLORS, STATUS_LABELS, type BookingStatus } from "@/lib/types";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "petrol" | "bronze" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-cream text-slate-dark",
  petrol: "bg-petrol/10 text-petrol",
  bronze: "border border-bronze/40 bg-paper text-bronze",
  success: "bg-success/10 text-success",
  warning: "bg-warning/20 text-ink",
  danger: "bg-danger/10 text-danger",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  opzione: "warning",
  confermato: "petrol",
  saldato: "success",
  annullato: "neutral",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** Pallini dei colori di allestimento (testo nascosto per screen reader). */
export function ColorDots({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  return (
    <span className="inline-flex items-center">
      {colors.map((name) => (
        <span
          key={name}
          title={name}
          aria-hidden="true"
          className="-ml-1 first:ml-0 size-3.5 rounded-full ring-1 ring-ink/25"
          style={{
            backgroundColor:
              SETUP_COLOR_HEX[name as (typeof SETUP_COLORS)[number]] ?? "#B0B0B0",
          }}
        />
      ))}
      <span className="sr-only">{colors.join(", ")}</span>
    </span>
  );
}
