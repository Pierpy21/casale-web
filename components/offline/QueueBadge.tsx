"use client";

import { cn } from "@/components/ui/cn";
import { useOfflineQueue } from "./OfflineProvider";

/** Contatore delle modifiche in coda per la voce "Sincronizzazione" della navigazione. */
export function QueueBadge({ className }: { className?: string }) {
  const { items, attentionCount } = useOfflineQueue();
  if (items.length === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        attentionCount > 0 ? "bg-warning text-ink" : "bg-sand text-ink",
        className,
      )}
    >
      {items.length}
      <span className="sr-only"> {items.length === 1 ? "modifica in coda" : "modifiche in coda"}</span>
    </span>
  );
}
