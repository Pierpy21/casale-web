"use client";

import { cn } from "@/components/ui/cn";
import { Badge } from "@/components/ui/Badge";
import { useMenuColor } from "./MenuColorsProvider";

const SIZE_CLASS = {
  sm: "px-1.5 py-px text-[12.5px] leading-snug",
  md: "px-2 py-0.5 text-[13.5px] leading-snug",
  lg: "px-2.5 py-1 text-[16px] leading-snug",
} as const;

export interface MenuBadgeProps {
  /** Id del menù (per il colore). Null = menù non ancora scelto. */
  menuId: string | null;
  /** Nome mostrato. */
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Piatti dell'evento modificati rispetto al menù: accanto al nome compare il tag rosso "Modificato". */
  customized?: boolean;
}

/** Tag rosso "Modificato" accanto al nome del menù di un evento con piatti personalizzati. */
export function CustomizedTag({ className }: { className?: string }) {
  return (
    <Badge tone="dangerSolid" className={cn("shrink-0 whitespace-nowrap", className)}>
      Modificato
    </Badge>
  );
}

/**
 * Nome di un menù: tinta leggera del colore del menù, testo nel colore scurito e filetto laterale pieno.
 * Adulti: dal senape al rosso per prezzo; bambini: colore neutro. Il colore arriva dal MenuColorsProvider.
 * Menù composto (solo evento) o senza colore: tinta neutra del fallback.
 */
export function MenuBadge({ menuId, name, size = "md", className, customized = false }: MenuBadgeProps) {
  const color = useMenuColor(menuId);
  const badge = (
    <span
      style={{
        backgroundColor: color.bg,
        color: color.fg,
        borderColor: color.border,
        borderLeftColor: color.accent,
      }}
      className={cn(
        "inline-flex max-w-full items-center rounded-[2px] border border-l-4 font-serif font-normal tracking-[0.01em] break-words",
        !menuId && "italic",
        SIZE_CLASS[size],
        // Con il tag il className va al contenitore che tiene insieme nome e tag.
        !customized && className,
      )}
    >
      {name}
    </span>
  );
  if (!customized) return badge;
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-1.5", className)}>
      {badge}
      <CustomizedTag />
    </span>
  );
}
