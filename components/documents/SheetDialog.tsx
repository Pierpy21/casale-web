"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, Modal, Skeleton } from "@/components/ui";
import type { SheetLoad } from "./useSheetFetch";

/** Larghezza del foglio A4 in mm. */
const A4_WIDTH_MM = 210;

/**
 * Ingrandimenti in pixel per millimetro del foglio. 3,2 px/mm ≈ 11 px per il corpo a 10 pt: il minimo leggibile.
 * Il valore è in px per mm (non per percentuale) perché il foglio è in mm.
 */
export const SHEET_ZOOM_LEVELS: readonly number[] = [3.2, 3.8, 4.6, 5.6];
/** Predefinito su telefono: il foglio è più largo dello schermo e si scorre in orizzontale. */
const PHONE_ZOOM = SHEET_ZOOM_LEVELS[0];

/** Zoom scelto: "fit" = adatta alla larghezza, altrimenti px per mm. */
type Zoom = "fit" | number;

const NARROW_QUERY = "(max-width: 639px)";

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Telefono (sotto sm). Lato server e in idratazione assume "non telefono": nessun salto di markup. */
function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

/** Livello di zoom successivo (+1) o precedente (-1) rispetto a quello attuale; null se non ce n'è.
 * Il livello attuale può essere quello di "Adatta", che sta fuori dalla lista. */
function neighbourLevel(current: number, direction: 1 | -1): number | null {
  const EPS = 0.01;
  if (direction === 1) return SHEET_ZOOM_LEVELS.find((level) => level > current + EPS) ?? null;
  const below = SHEET_ZOOM_LEVELS.filter((level) => level < current - EPS);
  return below.length > 0 ? below[below.length - 1] : null;
}

export interface SheetDialogProps<T> {
  open: boolean;
  onClose: () => void;
  /** Rete disponibile: offline il foglio non si carica e la finestra lo dice. */
  online: boolean;
  load: SheetLoad<T>;
  onRetry: () => void;
  /** Il foglio vero e proprio; `pxPerMm` null = adatta alla larghezza, altrimenti zoom in px per mm. */
  renderSheet: (data: T, pxPerMm: number | null) => ReactNode;
  /** Piè della finestra: di solito Scarica PDF, Scarica Word e Chiudi. */
  footer: ReactNode;
  title?: string;
}

/**
 * Finestra di anteprima di un foglio: intestazione con zoom (Adatta, −, +), corpo che scorre in entrambe le direzioni
 * (nessuno scroll della pagina), stati di caricamento, errore e offline.
 * Su telefono parte al livello leggibile; su tablet e computer parte "Adatta".
 */
export function SheetDialog<T>({
  open,
  onClose,
  online,
  load,
  onRetry,
  renderSheet,
  footer,
  title = "Anteprima",
}: SheetDialogProps<T>) {
  const narrow = useNarrowScreen();
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Pixel per mm che il corpo lascia al foglio in modalità "Adatta" (0 finché non misurato). */
  const [fitPxPerMm, setFitPxPerMm] = useState(0);
  /** Scelta dell'utente; null = predefinito (adatta, o leggibile su telefono). */
  const [choice, setChoice] = useState<Zoom | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Il corpo è nel dialog: misura alla prima apertura e a ogni cambio di dimensione (rotazione, finestra).
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(element);
      const inner = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setFitPxPerMm(Math.max(inner, 0) / A4_WIDTH_MM);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoom: Zoom = choice ?? (narrow ? PHONE_ZOOM : "fit");
  const currentPxPerMm = zoom === "fit" ? fitPxPerMm : zoom;
  const larger = neighbourLevel(currentPxPerMm, 1);
  const smaller = neighbourLevel(currentPxPerMm, -1);
  const sheetReady = online && load.status === "ready";

  let content: ReactNode;
  if (!online) {
    content = (
      <p role="status" className="mx-auto max-w-md py-12 text-center text-[15px] text-slate-dark">
        Questo documento si genera sul server: l&apos;anteprima è disponibile solo online.
      </p>
    );
  } else if (load.status === "loading") {
    content = <SheetSkeleton />;
  } else if (load.status === "error") {
    content = (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
        <p className="text-[15px] text-ink">{load.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="min-h-11">
          Riprova
        </Button>
      </div>
    );
  } else {
    content = renderSheet(load.data, zoom === "fit" ? null : zoom);
  }

  const headerActions = sheetReady ? (
    <div role="group" aria-label="Ingrandimento" className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={zoom === "fit"}
        onClick={() => setChoice("fit")}
        className="min-h-11 px-3"
      >
        Adatta
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label="Riduci"
        disabled={smaller === null}
        onClick={() => smaller !== null && setChoice(smaller)}
        className="min-h-11 min-w-11 px-3"
      >
        −
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label="Ingrandisci"
        disabled={larger === null}
        onClick={() => larger !== null && setChoice(larger)}
        className="min-h-11 min-w-11 px-3"
      >
        +
      </Button>
    </div>
  ) : null;

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl" bare headerActions={headerActions} footer={footer}>
      {/* Il corpo scorre in entrambe le direzioni: il foglio può essere più largo della finestra. */}
      <div
        ref={scrollRef}
        role="region"
        tabIndex={0}
        aria-label="Anteprima del foglio, scorrevole"
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-cream/40 px-3 py-4 sm:px-6 sm:py-5"
      >
        {content}
      </div>
    </Modal>
  );
}

/** Segnaposto a forma di foglio A4 mentre il server prepara l'anteprima. */
function SheetSkeleton() {
  return (
    <div role="status" aria-label="Caricamento del foglio" className="mx-auto w-full">
      <div className="mx-auto flex aspect-[210/297] w-full flex-col gap-4 bg-paper p-[6%] shadow-md shadow-ink/10">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="mt-6 h-8 w-2/3" />
        <Skeleton className="h-4 w-1/4" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
