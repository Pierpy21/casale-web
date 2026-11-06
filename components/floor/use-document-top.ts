"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Distanza (px) dell'elemento dall'inizio del documento, per farlo arrivare fino al fondo della viewport
 * (`calc(100dvh - top - ...)`). Si aggiorna al ridimensionamento e quando cambia ciò che sta sopra
 * (es. il banner offline inserito nello stesso contenitore) o il contenitore stesso. Ref a callback: l'elemento può comparire dopo.
 */
export function useDocumentTop<T extends Element>(): [(el: T | null) => void, number | null] {
  const [el, setEl] = useState<T | null>(null);
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      // Per eccesso: meglio mezzo pixel di margine che una barra di scorrimento della pagina.
      const next = Math.ceil(el.getBoundingClientRect().top + window.scrollY);
      setTop((prev) => (prev === next ? prev : next));
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(document.body);
    const parent = el.parentElement;
    // Il contenitore cambia larghezza (es. sidebar che si restringe) insieme al suo padding: si rimisura.
    if (parent) resize.observe(parent);
    const mutations = parent ? new MutationObserver(measure) : null;
    if (parent) mutations?.observe(parent, { childList: true });
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      mutations?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [el]);

  return [setEl, top];
}
