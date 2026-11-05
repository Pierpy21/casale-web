"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isDeskLayout, subscribeDeskLayout } from "@/components/shell/shell-mode";
import { cn } from "./cn";

export interface ScrollPinnedBarProps {
  children: ReactNode;
  /** Classi del posto nel flusso (margini negativi per andare a filo dei bordi della pagina). */
  className?: string;
  /** Classi della barra (sfondo, padding interno). */
  barClassName?: string;
}

/** Stato della barra su telefono e tablet: ferma nel flusso oppure `fixed` sotto l'header, con la geometria del suo posto. */
type Pin = { top: number; left: number; width: number; shift: number } | null;

/**
 * Barra a metà pagina che resta in cima scorrendo (come `sticky`), senza i sobbalzi di Safari iOS.
 * Telefono e tablet: resta nel flusso finché il suo posto non arriva sotto l'header, poi diventa `fixed` (come PinnedBar)
 * con la stessa larghezza e posizione orizzontale del posto; arrivata in fondo al contenitore scorre via con lui.
 * Un posto della stessa altezza (misurata) evita salti del contenuto. Desktop: `sticky` in cima, come prima.
 */
export function ScrollPinnedBar({ children, className, barClassName }: ScrollPinnedBarProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [pin, setPin] = useState<Pin>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => setHeight(bar.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    const bar = barRef.current;
    const probe = probeRef.current;
    if (!slot || !bar || !probe) return;

    // Calcolo diretto a ogni evento (niente requestAnimationFrame): un fotogramma di ritardo si vedrebbe come un sobbalzo.
    const update = () => {
      if (isDeskLayout()) {
        setPin(null);
        return;
      }
      // Bordo inferiore dell'header: lo stesso top della PinnedBar, letto da un elemento fixed invisibile.
      const top = probe.getBoundingClientRect().top;
      const rect = slot.getBoundingClientRect();
      const parent = slot.parentElement?.getBoundingClientRect();
      if (rect.top > top) {
        setPin(null);
        return;
      }
      // In fondo al contenitore la barra lo segue verso l'alto, come farebbe sticky.
      const shift = parent ? Math.min(0, parent.bottom - top - bar.offsetHeight) : 0;
      setPin((prev) =>
        prev && prev.top === top && prev.left === rect.left && prev.width === rect.width && prev.shift === shift
          ? prev
          : { top, left: rect.left, width: rect.width, shift },
      );
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const unsubscribe = subscribeDeskLayout(update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      unsubscribe();
    };
  }, []);

  return (
    <div
      ref={slotRef}
      style={pin ? { height } : undefined}
      className={cn("z-10 min-w-0 desk:sticky desk:top-0", className)}
    >
      <div aria-hidden="true" ref={probeRef} className="pointer-events-none invisible fixed top-[calc(env(safe-area-inset-top)+4rem-1px)] h-0 w-0" />
      <div
        ref={barRef}
        style={pin ? { position: "fixed", top: pin.top, left: pin.left, width: pin.width, transform: `translate3d(0, ${pin.shift}px, 0)` } : undefined}
        className={cn("z-20 min-w-0", barClassName)}
      >
        {children}
      </div>
    </div>
  );
}
