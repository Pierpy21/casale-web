"use client";

import { cn } from "@/components/ui/cn";
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
}

/**
 * Nome di un menù: tinta leggera del colore del menù, testo nel colore scurito e filetto laterale pieno.
 * Adulti: dal senape al rosso per prezzo; bambini: colore neutro. Il colore arriva dal MenuColorsProvider.
 */
export function MenuBadge({ menuId, name, size = "md", className }: MenuBadgeProps) {
  const color = useMenuColor(menuId);
  return (
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
        className,
      )}
    >
      {name}
    </span>
  );
}
