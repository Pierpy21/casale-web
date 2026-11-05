import { useEffect, useState } from "react";

/** Stato del caricamento di un foglio (JSON dalla route dell'anteprima). */
export type SheetLoad<T> =
  | { status: "loading" }
  /** `cachedAt`: istante ISO della copia salvata sul dispositivo (offline o rete lenta), null se arriva dal server. */
  | { status: "ready"; data: T; cachedAt: string | null }
  | { status: "error"; message: string };

/** Messaggio `{ error }` della risposta di errore della route, se presente. */
function errorText(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return null;
}

/**
 * Carica il foglio quando la finestra è aperta (offline arriva la copia salvata dal service worker). `reload` avvia un nuovo caricamento, all'apertura
 * o dopo un errore. Ogni risultato vale solo per il tentativo che l'ha chiesto: una finestra riaperta non mostra
 * mai il foglio precedente.
 */
export function useSheetFetch<T>(url: string, open: boolean): { load: SheetLoad<T>; reload: () => void } {
  const [token, setToken] = useState(0);
  const [result, setResult] = useState<{ token: number; load: SheetLoad<T> } | null>(null);

  useEffect(() => {
    // Anche offline: il service worker risponde con l'ultima copia salvata, se c'è.
    if (!open) return;
    const controller = new AbortController();
    const attempt = token;
    const settle = (load: SheetLoad<T>) => {
      if (!controller.signal.aborted) setResult({ token: attempt, load });
    };
    fetch(url, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorText(body) ?? `Anteprima non disponibile (${response.status})`);
        settle({ status: "ready", data: body as T, cachedAt: response.headers.get("x-agenda-cached-at") });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        settle({ status: "error", message: err instanceof Error ? err.message : "Non è stato possibile caricare il foglio." });
      });
    return () => controller.abort();
  }, [open, url, token]);

  const load: SheetLoad<T> = result && result.token === token ? result.load : { status: "loading" };
  const reload = () => setToken((n) => n + 1);
  return { load, reload };
}
