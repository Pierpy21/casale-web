import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "./cn";

/** Destinazione di un link della barra. `onSelect` intercetta il click e lo lascia gestire al client (URL aggiornato, nessun reload). */
export interface TopBarLink {
  href: string;
  onSelect?: () => void;
  /** Precarica la destinazione (utile per il periodo adiacente). */
  prefetch?: boolean;
}

/** Freccia ‹ / › del periodo: `label` è l'etichetta accessibile. */
export interface TopBarNav extends TopBarLink {
  label: string;
}

/** Voce di un gruppo di tab o di pillole. `dot` è una classe di colore (es. "bg-mustard") per il pallino. */
export interface TopBarOption extends TopBarLink {
  key: string;
  label: string;
  active: boolean;
  dot?: string | null;
}

export interface TopBarGroup {
  /** Etichetta accessibile del gruppo (nav). */
  label: string;
  items: TopBarOption[];
}

export interface TopBarProps {
  "aria-label": string;
  prev: TopBarNav;
  next: TopBarNav;
  /** Nome del periodo, al centro tra le frecce. */
  title: string;
  /** `h1` quando la barra è il titolo della pagina (agenda); `p` altrimenti. */
  titleAs?: "h1" | "p";
  /** Link "Oggi": assente quando non serve (periodo già in corso). */
  today?: TopBarLink;
  /** Granularità: tab con sottolineatura. */
  tabs?: TopBarGroup;
  /** Filtro: pillole con pallino colorato opzionale. */
  chips?: TopBarGroup;
  /** Azione a fine riga (es. "Crea evento"). */
  action?: ReactNode;
  className?: string;
}

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const ARROW =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-btn border border-field-edge bg-paper text-petrol transition-colors duration-200 hover:border-field-edge-hover hover:bg-cream";

/* Tab: testo con sottolineatura, chiaramente diverso dalle pillole. */
const TAB = "flex min-h-11 items-end justify-center border-b-2 px-2 pb-2.5 text-[14px] font-medium transition-colors duration-200 sm:px-3";

const CHIP =
  "inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium transition-colors duration-200 sm:px-4";

const TODAY = "inline-flex min-h-11 items-center px-2 text-[13px] font-medium text-petrol underline underline-offset-4";

/** Props del Link: `scroll={false}` sempre, perché la barra è fissa in cima e il click non deve riportare in cima alla pagina. */
function linkProps(target: TopBarLink) {
  return {
    href: target.href,
    prefetch: target.prefetch,
    scroll: false,
    onClick: target.onSelect
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          target.onSelect?.();
        }
      : undefined,
  };
}

/**
 * Barra in cima a una pagina con periodo (‹ nome ›, "Oggi"), tab di granularità e pillole di filtro.
 * Presentazionale: lo stato sta nell'URL (link) o nel chiamante (onSelect). Nessun bordo né ombra: il contenitore
 * (PinnedBar) decide il separatore.
 * Telefono: righe impilate (periodo, tab a tutta larghezza, pillole). Da sm: tab e pillole sulla stessa riga.
 * Da 2xl: periodo e filtri su un'unica riga.
 */
export function TopBar({
  "aria-label": ariaLabel,
  prev,
  next,
  title,
  titleAs = "p",
  today,
  tabs,
  chips,
  action,
  className,
}: TopBarProps) {
  const Title = titleAs;
  const hasSecondRow = Boolean(tabs || chips || action);

  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 sm:gap-2 2xl:flex-row 2xl:flex-wrap 2xl:items-center 2xl:justify-between 2xl:gap-x-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 2xl:shrink-0">
        <Link {...linkProps(prev)} aria-label={prev.label} className={cn(ARROW, FOCUS)}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-1 px-1 text-center 2xl:flex-none 2xl:px-3">
          <Title aria-live="polite" className="min-w-0 break-words font-serif text-3xl leading-tight text-ink">
            {title}
          </Title>
          {today && (
            <Link {...linkProps(today)} className={cn(TODAY, FOCUS)}>
              Oggi
            </Link>
          )}
        </div>
        <Link {...linkProps(next)} aria-label={next.label} className={cn(ARROW, FOCUS)}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      </div>

      {hasSecondRow && (
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2">
          {tabs && (
            <nav aria-label={tabs.label} className="min-w-0 sm:shrink-0">
              <ul className="grid grid-flow-col auto-cols-fr border-b border-sand sm:flex sm:gap-1">
                {tabs.items.map((option) => (
                  <li key={option.key} className="min-w-0">
                    <Link
                      {...linkProps(option)}
                      aria-current={option.active ? "page" : undefined}
                      className={cn(
                        TAB,
                        FOCUS,
                        option.active ? "border-petrol text-ink" : "border-transparent text-slate-dark hover:text-ink",
                      )}
                    >
                      {option.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {(chips || action) && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto sm:justify-end">
              {chips && (
                <nav aria-label={chips.label} className="min-w-0">
                  <ul className="flex flex-wrap gap-1.5">
                    {chips.items.map((option) => (
                      <li key={option.key}>
                        <Link
                          {...linkProps(option)}
                          aria-current={option.active ? "page" : undefined}
                          className={cn(
                            CHIP,
                            FOCUS,
                            option.active
                              ? "border-ink bg-ink text-paper"
                              : "border-field-edge bg-paper text-ink hover:border-field-edge-hover hover:bg-cream",
                          )}
                        >
                          {option.dot && <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", option.dot)} />}
                          {option.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              {action}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
