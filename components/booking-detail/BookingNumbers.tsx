"use client";

import { ChevronDown, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Pannelli apribili dai riquadri: coperti, prezzo dell'evento, pagamenti e acconti. */
export type BookingPanelKey = "coperti" | "prezzo" | "pagamenti";

/** Riquadro dei numeri. Con `panel` è cliccabile e apre il pannello corrispondente. */
export interface NumberTile {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
  panel?: BookingPanelKey;
  /** Testo dell'invito sotto il riquadro, es. "Modifica coperti". */
  cta?: string;
}

export interface BookingPanel {
  key: BookingPanelKey;
  title: string;
  content: ReactNode;
}

export interface BookingNumbersProps {
  tiles: NumberTile[];
  /** Solo i pannelli che il ruolo può usare: chi non li ha non riceve il riquadro cliccabile. */
  panels: BookingPanel[];
  /** Pannello aperto al caricamento (da ?pannello=). */
  initialPanel: BookingPanelKey | null;
}

const PANEL_ID = "pannello-prenotazione";
const URL_PARAM = "pannello";

/** Riflette il pannello aperto nell'URL senza ricaricare la pagina. */
function writePanelToUrl(panel: BookingPanelKey | null) {
  try {
    const url = new URL(window.location.href);
    if (panel) url.searchParams.set(URL_PARAM, panel);
    else url.searchParams.delete(URL_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL non aggiornabile: il pannello resta comunque aperto.
  }
}

/**
 * Numeri della prenotazione (riquadri) e un solo pannello aperto alla volta sotto di essi.
 * Chiudere il pannello attivo lo nasconde; lo stato è in ?pannello=coperti|prezzo|pagamenti.
 */
export function BookingNumbers({ tiles, panels, initialPanel }: BookingNumbersProps) {
  const available = (key: BookingPanelKey | undefined) => (key && panels.some((p) => p.key === key) ? key : null);
  const [active, setActive] = useState<BookingPanelKey | null>(available(initialPanel ?? undefined));
  // Riquadri apribili: alla chiusura del pannello il focus torna sul riquadro che l'aveva aperto.
  const tileRefs = useRef<Partial<Record<BookingPanelKey, HTMLButtonElement | null>>>({});

  const choose = (key: BookingPanelKey) => {
    const next = active === key ? null : key;
    setActive(next);
    writePanelToUrl(next);
    if (next) {
      // Il pannello compare sotto i riquadri: portalo in vista (su iPad/telefono può essere fuori schermo).
      requestAnimationFrame(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(PANEL_ID)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      });
    } else {
      // Il pannello (e il suo pulsante Chiudi) sparisce: il focus non deve cadere nel vuoto.
      tileRefs.current[key]?.focus();
    }
  };

  const openPanel = panels.find((p) => p.key === active) ?? null;
  const gridCols = tiles.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-2";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className={cn("grid min-w-0 grid-cols-2 gap-3 sm:gap-4", gridCols)}>
        {tiles.map((tile) => {
          const clickable = tile.panel !== undefined && panels.some((p) => p.key === tile.panel);
          const isOpen = clickable && active === tile.panel;
          const body = (
            <>
              <span className="break-words text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-bronze sm:text-[11px] sm:tracking-[0.14em]">
                {tile.label}
              </span>
              <span className="font-serif text-xl leading-none tabular-nums text-ink break-words sm:text-3xl">{tile.value}</span>
              {tile.hint !== undefined && tile.hint !== null && tile.hint !== false && (
                <span className="break-words text-[12px] leading-snug text-slate-dark">{tile.hint}</span>
              )}
              {clickable && tile.cta && (
                <span className="mt-auto flex items-center gap-1 pt-1 text-[12px] font-medium text-petrol">
                  {tile.cta}
                  <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none", isOpen && "rotate-180")} />
                </span>
              )}
            </>
          );
          const base = cn(
            "flex min-h-11 min-w-0 flex-col gap-1.5 rounded-btn border bg-paper px-3 py-3 text-left shadow-sm shadow-ink/5 sm:px-4 sm:py-4",
            tile.highlight ? "border-warning/60 bg-warning/10" : "border-sand",
          );

          if (!clickable) {
            return (
              <div key={tile.key} className={base}>
                {body}
              </div>
            );
          }
          return (
            <button
              key={tile.key}
              ref={(el) => {
                tileRefs.current[tile.panel as BookingPanelKey] = el;
              }}
              type="button"
              aria-expanded={isOpen}
              aria-controls={isOpen ? PANEL_ID : undefined}
              onClick={() => choose(tile.panel as BookingPanelKey)}
              className={cn(
                base,
                "transition-colors duration-200 hover:border-petrol/50 hover:bg-cream/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol",
                isOpen && "border-petrol bg-petrol/5",
              )}
            >
              {body}
            </button>
          );
        })}
      </div>

      {openPanel && (
        <section
          id={PANEL_ID}
          aria-labelledby={`${PANEL_ID}-title`}
          className="flex min-w-0 scroll-mt-6 flex-col gap-4 rounded-[2px] border border-sand border-t-[3px] border-t-petrol bg-paper p-4 shadow-sm shadow-ink/5 sm:p-5"
        >
          <header className="flex min-w-0 items-center justify-between gap-3 border-b border-sand pb-3">
            <h2 id={`${PANEL_ID}-title`} className="min-w-0 text-xl wrap-anywhere">
              {openPanel.title}
            </h2>
            <button
              type="button"
              onClick={() => choose(openPanel.key)}
              aria-label={`Chiudi ${openPanel.title}`}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-btn border border-petrol/40 px-3 text-[13px] font-medium text-petrol transition-colors hover:bg-petrol/5 focus-visible:outline-2 focus-visible:outline-petrol"
            >
              <X aria-hidden="true" className="size-4" />
              Chiudi
            </button>
          </header>
          {openPanel.content}
        </section>
      )}
    </div>
  );
}
