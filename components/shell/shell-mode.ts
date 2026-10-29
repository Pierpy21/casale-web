// Modulo puro, lato client: stessa regola delle varianti CSS desk:/optouch: (app/(admin)/globals.css).

/** Valore dell'attributo `data-shell` sul contenitore dell'app per sala e cucina. */
export const OPERATOR_SHELL = "operator";

/** Media query da osservare per riallineare isDeskLayout() (cambio di larghezza o di puntatore). */
const DESK_MEDIA_QUERIES = ["(min-width: 64rem)", "(pointer: coarse)"] as const;

/**
 * Vero quando la pagina usa il layout da computer (come la variante CSS desk:): da 1024px con mouse o trackpad;
 * su touch solo per l'admin (sala e cucina su tablet restano sul layout da telefono).
 */
export function isDeskLayout(): boolean {
  if (!window.matchMedia("(min-width: 64rem)").matches) return false;
  if (!window.matchMedia("(pointer: coarse)").matches) return true;
  return document.querySelector(`[data-shell="${OPERATOR_SHELL}"]`) === null;
}

/** Notifica i cambi delle media query di isDeskLayout(). Ritorna la funzione di pulizia. */
export function subscribeDeskLayout(onChange: () => void): () => void {
  const lists = DESK_MEDIA_QUERIES.map((query) => window.matchMedia(query));
  for (const mq of lists) mq.addEventListener("change", onChange);
  return () => {
    for (const mq of lists) mq.removeEventListener("change", onChange);
  };
}
