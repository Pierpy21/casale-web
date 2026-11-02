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
 * True se il tocco parte da un contenitore che scorre in orizzontale dentro `boundary` (es. una matrice
 * con overflow-x-auto): in quel caso lo scroll ha la precedenza e lo swipe non cambia giorno.
 */
function isInsideHorizontalScroller(target: EventTarget | null, boundary: HTMLElement | null): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== boundary) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Wrapper a swipe orizzontale (mobile e tablet). Il gesto è gestito in locale: nessuna navigazione
 * di pagina. Gli swipe prevalentemente verticali (scroll) vengono ignorati, così come quelli che
 * iniziano in un contenitore scrollabile in orizzontale.
 */
export function SwipeDay({ onPrev, onNext, children }: SwipeDayProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; inScroller: boolean } | null>(null);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    start.current = touch
      ? {
          x: touch.clientX,
          y: touch.clientY,
          inScroller: isInsideHorizontalScroller(event.target, wrapper.current),
        }
      : null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const origin = start.current;
    start.current = null;
    const touch = event.changedTouches[0];
    if (!origin || !touch || origin.inScroller) return;

    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    if (dx < 0) onNext();
    else onPrev();
  };

  return (
    <div ref={wrapper} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="touch-pan-y">
      {children}
    </div>
  );
}
