"use client";

import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui/cn";

/** Distanza minima dai bordi dello schermo (px). */
const VIEWPORT_MARGIN = 12;
/** Distanza tra l'elemento di ancoraggio e il menu (px). */
const ANCHOR_GAP = 8;

/** side: accanto all'ancora (destra, poi sinistra), poi sotto/sopra. below: sotto (o sopra), poi di lato. */
export type PopoverPlacement = "side" | "below";

export interface FloorPopoverProps {
  /** popover: card flottante ancorata (layout desk). sheet: foglio dal basso (telefono e tablet operatore). */
  mode: "popover" | "sheet";
  /** Titolo (intestazione minima). Senza intestazione resta il nome accessibile del menu. */
  title: string;
  /** Senza intestazione (né titolo né X): si chiude con tocco fuori o Esc. */
  bare?: boolean;
  /** Elemento a cui ancorare il menu (letto a ogni riposizionamento: il tavolo può muoversi). */
  getAnchor: () => HTMLElement | null;
  placement?: PopoverPlacement;
  /** md: card larga 20rem. auto: larga quanto il contenuto (barre compatte come l'editor del tavolo). */
  width?: "md" | "auto";
  onClose: () => void;
  children: ReactNode;
}

/**
 * Menu della mappa sala: card ancorata a un tavolo o a un pulsante (desk) oppure foglio dal basso (sotto desk).
 * Chiusura con tocco fuori, Esc o X. Il focus entra nel menu all'apertura e torna all'ancora alla chiusura.
 */
export function FloorPopover(props: FloorPopoverProps) {
  return props.mode === "sheet" ? <FloorSheet {...props} /> : <AnchoredPopover {...props} />;
}

/** Intestazione minima: titolo piccolo e X. */
function MenuHeader({ titleId, title, onClose }: { titleId: string; title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sand py-1 pl-4 pr-1">
      <h2 id={titleId} className="min-w-0 truncate !font-sans text-[13px] !font-medium tabular-nums text-slate-dark">
        {title}
      </h2>
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="grid size-10 shrink-0 place-items-center rounded-[2px] text-slate-dark transition-colors hover:bg-cream hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Posiziona il pannello (position: fixed) accanto all'ancora, dentro lo schermo. */
function placePanel(panel: HTMLElement, anchor: HTMLElement | null, placement: PopoverPlacement) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  const m = VIEWPORT_MARGIN;
  const g = ANCHOR_GAP;

  let spot: { left: number; top: number };
  if (!anchor) {
    spot = { left: (vw - pw) / 2, top: (vh - ph) / 2 };
  } else {
    const a = anchor.getBoundingClientRect();
    const sideTop = clamp(a.top + a.height / 2 - ph / 2, m, vh - m - ph);
    const centerLeft = clamp(a.left + a.width / 2 - pw / 2, m, vw - m - pw);
    const side =
      a.right + g + pw <= vw - m
        ? { left: a.right + g, top: sideTop }
        : a.left - g - pw >= m
          ? { left: a.left - g - pw, top: sideTop }
          : null;
    const vertical =
      a.bottom + g + ph <= vh - m
        ? { left: centerLeft, top: a.bottom + g }
        : a.top - g - ph >= m
          ? { left: centerLeft, top: a.top - g - ph }
          : null;
    spot = (placement === "side" ? side ?? vertical : vertical ?? side) ?? {
      left: centerLeft,
      top: clamp(a.bottom + g, m, vh - m - ph),
    };
  }
  panel.style.left = `${Math.round(spot.left)}px`;
  panel.style.top = `${Math.round(spot.top)}px`;
}

function AnchoredPopover({ title, bare = false, getAnchor, placement = "side", width = "md", onClose, children }: FloorPopoverProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const getAnchorRef = useRef(getAnchor);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    getAnchorRef.current = getAnchor;
    onCloseRef.current = onClose;
  });

  // A ogni render (es. tavolo trascinato, contenuto cambiato) il menu segue l'ancora, prima del paint.
  useLayoutEffect(() => {
    if (panelRef.current) placePanel(panelRef.current, getAnchor(), placement);
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const anchorAtOpen = getAnchorRef.current();
    const reposition = () => placePanel(panel, getAnchorRef.current(), placement);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || panel.contains(target) || getAnchorRef.current()?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };

    const observer = new ResizeObserver(reposition);
    observer.observe(panel);
    window.addEventListener("resize", reposition);
    // Capture: anche lo scorrimento del canvas della stanza (contenitore interno) sposta l'ancora.
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    panel.focus({ preventScroll: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      // Focus di nuovo sull'ancora se era nel menu (Esc, X) o è andato perso; non se l'utente è passato altrove.
      const active = document.activeElement;
      if (!active || active === document.body || panel.contains(active)) anchorAtOpen?.focus({ preventScroll: true });
    };
  }, [placement]);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={bare ? undefined : titleId}
      aria-label={bare ? title : undefined}
      tabIndex={-1}
      className={cn(
        "no-print fixed left-0 top-0 z-40 flex max-h-[calc(100dvh-1.5rem)] flex-col rounded-lg border border-sand bg-paper text-ink shadow-xl shadow-ink/20 outline-none",
        width === "md" ? "w-[min(20rem,calc(100vw-1.5rem))]" : "max-w-[calc(100vw-1.5rem)]",
      )}
    >
      {!bare && <MenuHeader titleId={titleId} title={title} onClose={onClose} />}
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", bare ? "p-2" : "px-4 py-3")}>{children}</div>
    </div>,
    document.body,
  );
}

/** Foglio dal basso con <dialog> nativo (focus trap, Esc e ritorno del focus gestiti dal browser). */
function FloorSheet({ title, bare = false, onClose, children }: FloorPopoverProps) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Chiusura sempre dal dialog: l'evento "close" avvisa il genitore e il browser rimette il focus dov'era.
  const requestClose = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      aria-labelledby={bare ? undefined : titleId}
      aria-label={bare ? title : undefined}
      onClose={onClose}
      onClick={(event) => {
        // Tocco sullo sfondo (fuori dal contenuto, che riempie il dialog).
        if (event.target === event.currentTarget) requestClose();
      }}
      className="no-print fixed inset-x-0 bottom-0 top-auto m-0 max-h-[80dvh] w-full max-w-none flex-col rounded-t-lg border-t border-sand bg-paper p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl shadow-ink/30 open:flex backdrop:bg-ink/40 optouch:mx-auto optouch:max-w-[36rem] optouch:border-x"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Maniglia del foglio (decorativa). */}
        <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-sand" />
        {!bare && <MenuHeader titleId={titleId} title={title} onClose={requestClose} />}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", bare ? "px-3 pb-3 pt-2" : "px-4 py-3")}>{children}</div>
      </div>
    </dialog>
  );
}
