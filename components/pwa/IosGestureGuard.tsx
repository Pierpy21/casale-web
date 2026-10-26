"use client";

import { useEffect } from "react";
import { isIosDevice } from "./install-store";

const INTERACTIVE = "input, textarea, select, button, a, label, [contenteditable='true']";

/**
 * iOS ignora `userScalable: false`: blocca il pinch-zoom (gesture*) e il doppio tap-zoom
 * su tutto ciò che non è un controllo interattivo. Attivo solo su iPhone/iPad.
 */
export function IosGestureGuard() {
  useEffect(() => {
    if (!isIosDevice()) return;

    const preventGesture = (event: Event) => {
      event.preventDefault();
    };
    const options: AddEventListenerOptions = { passive: false };

    // Conta solo i tap veri (niente scroll o pressioni lunghe), così un tocco dopo uno scroll non viene perso.
    let lastTapEnd = 0;
    let start: { x: number; y: number; t: number } | null = null;
    const rememberStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = touch ? { x: touch.clientX, y: touch.clientY, t: Date.now() } : null;
    };
    const preventDoubleTapZoom = (event: TouchEvent) => {
      const now = Date.now();
      const touch = event.changedTouches[0];
      const isTap =
        start != null &&
        touch != null &&
        Math.abs(touch.clientX - start.x) < 10 &&
        Math.abs(touch.clientY - start.y) < 10 &&
        now - start.t < 300;
      if (!isTap) return;
      const target = event.target instanceof Element ? event.target : null;
      const interactive = target?.closest(INTERACTIVE) != null;
      if (now - lastTapEnd < 300 && !interactive) event.preventDefault();
      lastTapEnd = now;
    };

    document.addEventListener("gesturestart", preventGesture, options);
    document.addEventListener("gesturechange", preventGesture, options);
    document.addEventListener("gestureend", preventGesture, options);
    document.addEventListener("touchstart", rememberStart, { passive: true });
    document.addEventListener("touchend", preventDoubleTapZoom, options);

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
      document.removeEventListener("touchstart", rememberStart);
      document.removeEventListener("touchend", preventDoubleTapZoom);
    };
  }, []);

  return null;
}
