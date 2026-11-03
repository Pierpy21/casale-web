"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export interface PinnedBarProps {
  children: ReactNode;
  /** Classi della barra (sfondo, bordo, padding interno). */
  className?: string;
  "aria-label"?: string;
}

/**
 * Barra sempre in cima alla pagina, sotto l'header.
 * Telefono e tablet: `fixed` su un layer GPU, come l'header. Una barra `sticky` su Safari iOS segue il rimbalzo e il
 * ridimensionamento della barra degli indirizzi durante lo scroll e sobbalza; una `fixed` resta ferma.
 * Uno spaziatore della stessa altezza (misurata) tiene il posto nel flusso: va messa per prima nella pagina.
 * Desktop: `sticky` in cima, come prima.
 */
export function PinnedBar({ children, className, "aria-label": ariaLabel }: PinnedBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => setHeight(bar.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* -mt-4: annulla il margine sopra la pagina (pt di main meno -mt del contenitore), così il contenuto parte sotto la barra. */}
      <div aria-hidden="true" style={{ height }} className="-mt-4 shrink-0 desk:hidden" />
      <div
        ref={barRef}
        role={ariaLabel ? "region" : undefined}
        aria-label={ariaLabel}
        className={cn(
          "fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4rem-1px)] z-20 min-w-0 transform-gpu bg-paper",
          "desk:sticky desk:inset-x-auto desk:top-0 desk:-mx-10 desk:transform-none",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
