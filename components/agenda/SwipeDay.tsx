"use client";

import { useRef, type ReactNode, type TouchEvent } from "react";

const SWIPE_THRESHOLD_PX = 50;

export interface SwipeDayProps {
  /** Swipe verso destra: precedente (giorno o mese, a seconda del contenuto). */
  onPrev: () => void;
  /** Swipe verso sinistra: successivo. */
  onNext: () => void;
  children: ReactNode;
}

/**
 * Wrapper a swipe orizzontale (mobile). Il gesto è gestito in locale: nessuna navigazione
 * di pagina. Gli swipe prevalentemente verticali (scroll) vengono ignorati.
 */
export function SwipeDay({ onPrev, onNext, children }: SwipeDayProps) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const origin = start.current;
    start.current = null;
    const touch = event.changedTouches[0];
    if (!origin || !touch) return;

    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    if (dx < 0) onNext();
    else onPrev();
  };

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="touch-pan-y">
      {children}
    </div>
  );
}
