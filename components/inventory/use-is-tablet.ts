import { useSyncExternalStore } from "react";

/** Tablet: almeno 768px di larghezza e puntatore touch (iPad, Android tablet). Telefono e desktop restano esclusi. */
export const TABLET_MEDIA_QUERY = "(min-width: 768px) and (pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(TABLET_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(TABLET_MEDIA_QUERY).matches;
}

/** Sul server e nel primo render di idratazione il valore è false: nessuna differenza tra HTML server e client. */
function getServerSnapshot(): boolean {
  return false;
}

/** true solo su tablet (viewport >= 768px con puntatore touch). Si aggiorna al cambio di orientamento. */
export function useIsTablet(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
