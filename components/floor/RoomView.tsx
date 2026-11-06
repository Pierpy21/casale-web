"use client";

import Link from "next/link";
import { ArrowLeft, ListFilter, Move, Plus, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import {
  clampPercent,
  formatRoomSize,
  geometryBox,
  polygonPointList,
  roomMeters,
  snapPercent,
  snapStepPercent,
  stepRotation,
  type RoomGeometry,
} from "@/lib/floor-geometry";
import type { FloorEvent, Room } from "@/lib/types";
import { FLOAT_SURFACE, FloatButton } from "./floating";
import { FloorPopover } from "./FloorPopover";
import {
  TABLE_FILTER_OPTIONS,
  matchesFilter,
  paxLabel,
  type EditScope,
  type RoomStatus,
  type TableFilter,
  type TableItem,
  type TableSeat,
} from "./floor-model";
import { TableCard } from "./TableCard";

/**
 * Scala minima (px per metro): solo sotto questa soglia il canvas scorre. Bassa di proposito: la stanza deve
 * stare intera; a scala piccola le card dei tavoli mostrano solo numero e nastrino.
 */
const MIN_PPM = 28;
/** Scala massima: su schermi molto grandi una sala piccola non diventa enorme. */
const MAX_PPM = 200;
/** Passo della scala: arrotondando per difetto il canvas non supera mai lo spazio (niente barre che vanno e vengono). */
const PPM_STEP = 0.5;
/** Margini interni del contenitore: in alto e in basso c'è la fascia dei comandi flottanti (40 px + respiro). */
const PAD_TOP = 56;
const PAD_BOTTOM = 56;
const PAD_X = 12;
/** Spostamento minimo (px) perché un tocco diventi trascinamento. */
const DRAG_THRESHOLD = 5;

export interface RoomViewProps {
  room: Room;
  geometry: RoomGeometry | null;
  /** Tavoli salvati, oppure la bozza in modifica. */
  items: TableItem[];
  /** Chi è seduto per numero di tavolo (in modifica: solo le anteprime delle assegnazioni). */
  seats: Map<number, TableSeat>;
  /** Evento che riserva la sala nel pasto. */
  event: FloorEvent | null;
  status: RoomStatus;
  filter: TableFilter;
  onFilterChange: (filter: TableFilter) => void;
  /** Tavolo con il menu aperto. */
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  canEditLayout: boolean;
  editing: boolean;
  /** Numeri ripetuti nella bozza. */
  duplicates: Set<number>;
  /** Numeri dei tavoli liberi destinazione di un'assegnazione in corso. */
  assignable: Set<number>;
  saving: boolean;
  /** Motivo per cui non si può salvare ora (es. disposizione del giorno con ambito "Sempre"). */
  saveBlocked: string | null;
  /** Tipo di menu (card ancorata su desk, foglio sotto desk), per il filtro su telefono. */
  menuMode: "popover" | "sheet";
  /** Comandi flottanti in alto a destra dopo il filtro ("Da assegnare", legenda). */
  topRight?: ReactNode;
  /** "← Piantina" visibile (fuori dalla modifica, o in modifica senza nulla da perdere). */
  showBack: boolean;
  onBack: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onAddTable: () => void;
  /** Posizione già agganciata alla griglia; il genitore la tiene dentro la stanza con l'ingombro ruotato. */
  onMoveTable: (key: string, x: number, y: number) => void;
  /** Rotazione 0–359 (maniglia o tastiera). */
  onRotateTable: (key: string, rotation: number) => void;
  /** La sala usa una disposizione propria per questo giorno e pasto. */
  dayLayoutActive: boolean;
  /** Ambito della modifica: standard della sala o solo questo giorno e pasto. */
  scope: EditScope;
  /** "06/11 pranzo", per il controllo "Solo …". */
  dayLabel: string;
  onScopeChange: (scope: EditScope) => void;
  onResetDay: () => void;
}

interface DragState {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

/**
 * Scala del canvas: tutta la stanza dentro il contenitore (contain su larghezza e altezza), tra MIN_PPM e MAX_PPM.
 * Null prima della misura.
 */
function useCanvasScale(meters: { w: number; h: number }) {
  // Ref a callback: misura il contenitore appena montato.
  const [el, wrapperRef] = useState<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const w = Math.max(0, el.clientWidth - PAD_X * 2);
      const h = Math.max(0, el.clientHeight - PAD_TOP - PAD_BOTTOM);
      setAvail((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  const fit = avail ? Math.min(avail.w / meters.w, avail.h / meters.h) : null;
  const ppm = fit === null ? null : Math.min(MAX_PPM, Math.max(MIN_PPM, Math.floor(fit / PPM_STEP) * PPM_STEP));
  return { wrapperRef, ppm };
}

/**
 * Vista di una stanza a tutta scena: canvas in scala reale (griglia a puntini = 1 m) che riempie il contenitore
 * (il genitore deve essere `relative` con un'altezza), con i comandi flottanti agli angoli.
 * Tavoli posizionati in % (x, y = centro); il tocco su un tavolo apre il suo menu (FloorPlanBoard).
 * In modifica disposizione i tavoli si trascinano (mouse e touch) con snap a 0.25 m, o si spostano con le frecce;
 * si ruotano con la maniglia del tavolo selezionato o con R / Maiusc+R. Sala senza tavoli: canvas vuoto con una
 * riga discreta (l'admin ci entra già in modifica, vedi FloorPlanBoard).
 */
export function RoomView({
  room,
  geometry,
  items,
  seats,
  event,
  status,
  filter,
  onFilterChange,
  selectedKey,
  onSelect,
  canEditLayout,
  editing,
  duplicates,
  assignable,
  saving,
  saveBlocked,
  menuMode,
  topRight,
  showBack,
  onBack,
  onStartEdit,
  onCancelEdit,
  onSave,
  onAddTable,
  onMoveTable,
  onRotateTable,
  dayLayoutActive,
  scope,
  dayLabel,
  onScopeChange,
  onResetDay,
}: RoomViewProps) {
  const meters = roomMeters(geometry);
  const { wrapperRef, ppm } = useCanvasScale(meters);
  const drag = useRef<DragState | null>(null);
  /** Dopo un trascinamento il click che segue non deve selezionare. */
  const justDragged = useRef(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  // Dissolvenza in entrata dopo lo zoom della piantina.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const canvasW = ppm ? meters.w * ppm : 0;
  const canvasH = ppm ? meters.h * ppm : 0;
  const empty = items.length === 0 && !editing;
  const occupiedCount = status.total - status.free;
  const counts: Record<TableFilter, number> = { tutti: status.total, liberi: status.free, occupati: occupiedCount };

  const handlePointerDown = (item: TableItem) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!editing || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { key: item.key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: item.x, originY: item.y, moved: false };
  };

  const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !canvasW || !canvasH) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    onMoveTable(
      d.key,
      snapPercent(d.originX + (dx / canvasW) * 100, meters.w),
      snapPercent(d.originY + (dy / canvasH) * 100, meters.h),
    );
  };

  const handlePointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.moved) justDragged.current = true;
  };

  const handleKeyDown = (item: TableItem) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!editing) return;
    // R ruota in senso orario, Maiusc+R antiorario (Cmd/Ctrl+R restano al browser).
    if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      onRotateTable(item.key, stepRotation(item.rotation, e.shiftKey ? -1 : 1));
      return;
    }
    const stepX = snapStepPercent(meters.w);
    const stepY = snapStepPercent(meters.h);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stepX, 0],
      ArrowRight: [stepX, 0],
      ArrowUp: [0, -stepY],
      ArrowDown: [0, stepY],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    onMoveTable(item.key, snapPercent(clampPercent(item.x + move[0]), meters.w), snapPercent(clampPercent(item.y + move[1]), meters.h));
  };

  const handleClick = (item: TableItem) => () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    onSelect(selectedKey === item.key ? null : item.key);
  };

  const activeFilterLabel = TABLE_FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? "Tutti";

  return (
    <section
      aria-labelledby="stanza-titolo"
      className={cn(
        "absolute inset-0 overflow-hidden rounded-[2px] border border-sand bg-cream/60 transition-opacity duration-300 ease-out motion-reduce:transition-none",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      {/* Canvas con m-auto: centrato quando c'è spazio, allineato all'inizio (scorrevole) solo sotto la scala minima. */}
      <div
        ref={wrapperRef}
        className="absolute inset-0 flex overflow-auto overscroll-contain"
        style={{ padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px` }}
      >
        {ppm && (
          <div
            role="group"
            aria-label={`Tavoli di ${room.name}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelect(null);
            }}
            className={cn("relative m-auto shrink-0 bg-paper", !geometry?.polygon && "ring-1 ring-ink/20")}
            style={{
              width: canvasW,
              height: canvasH,
              backgroundImage: "radial-gradient(circle, rgb(28 43 45 / 0.16) 1.2px, transparent 1.6px)",
              backgroundSize: `${ppm}px ${ppm}px`,
              backgroundPosition: `${-ppm / 2}px ${-ppm / 2}px`,
            }}
          >
            {geometry?.polygon && <PolygonMask geometry={geometry} />}

            {/* Sala senza tavoli fuori dalla modifica: una riga discreta, niente schermata dedicata. */}
            {empty && (
              <p className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-[13px] text-slate-dark">
                Nessun tavolo in questa sala
              </p>
            )}

            {items.map((item) => {
              const seat = seats.get(item.number) ?? null;
              return (
                <TableCard
                  key={item.key}
                  item={item}
                  ppm={ppm}
                  left={(item.x / 100) * canvasW}
                  top={(item.y / 100) * canvasH}
                  seat={seat}
                  selected={selectedKey === item.key}
                  // La sala riservata attenua i tavoli, ma non quello dell'evento stesso né i liberi assegnabili (aggiunta tavoli).
                  dimmed={
                    !editing &&
                    ((Boolean(event) && seat?.kind !== "evento" && !assignable.has(item.number)) || !matchesFilter(filter, seat !== null))
                  }
                  editing={editing}
                  invalid={editing && duplicates.has(item.number)}
                  assignable={assignable.has(item.number)}
                  onClick={handleClick(item)}
                  onPointerDown={editing ? handlePointerDown(item) : undefined}
                  onPointerMove={editing ? handlePointerMove : undefined}
                  onPointerUp={editing ? handlePointerUp : undefined}
                  onKeyDown={editing ? handleKeyDown(item) : undefined}
                  onRotate={editing ? (rotation) => onRotateTable(item.key, rotation) : undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* In alto a sinistra: ← Piantina, nome, misure e scala, disposizione del giorno, evento. */}
      <div className="pointer-events-none absolute left-2 top-2 z-30 flex max-w-[calc(100%-1rem)] items-start gap-1.5">
        {showBack && (
          <FloatButton
            label="Piantina"
            icon={<ArrowLeft aria-hidden="true" className="size-4" />}
            onClick={onBack}
            className="pointer-events-auto"
          />
        )}
        <div className={cn(FLOAT_SURFACE, "pointer-events-auto flex min-w-0 max-w-[min(18rem,45vw)] flex-col px-2.5 py-1")}>
          <h2 id="stanza-titolo" className="min-w-0 truncate text-[15px] leading-tight">
            {room.name}
          </h2>
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-tight tabular-nums text-slate-dark">
            <span className="truncate">
              {formatRoomSize(meters)}
              {!editing && status.seatedCovers > 0 && ` · ${status.seatedCovers} seduti`}
            </span>
            {ppm && (
              <span aria-hidden="true" className="flex shrink-0 items-center gap-1 max-sm:hidden">
                <span className="block h-1.5 border-x border-b border-ink/60" style={{ width: ppm }} />1 m
              </span>
            )}
          </p>
          {dayLayoutActive && !editing && (
            <span className="mt-0.5 self-start rounded-[2px] bg-petrol/10 px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-petrol">
              Disposizione del giorno
            </span>
          )}
          {event && (
            <Link
              href={`/admin/prenotazioni/${event.id}`}
              className="min-w-0 truncate text-[11px] font-medium leading-tight text-mustard underline-offset-2 hover:underline"
            >
              Riservata · {event.title} · {paxLabel(event.covers)}
            </Link>
          )}
        </div>
      </div>

      {/* In alto a destra: filtro (segmenti da sm, pulsante con menu su telefono) e comandi della scheda. */}
      <div className="pointer-events-none absolute right-2 top-2 z-30 flex max-w-[55%] flex-wrap items-start justify-end gap-1.5 [&>*]:pointer-events-auto">
        {!editing && !empty && (
          <>
            <FilterSwitch value={filter} onChange={onFilterChange} counts={counts} className="max-sm:hidden" />
            <FloatButton
              ref={filterButtonRef}
              label={`Filtro: ${activeFilterLabel}`}
              showLabel="never"
              tone={filter === "tutti" ? "default" : "active"}
              icon={<ListFilter aria-hidden="true" className="size-4" />}
              aria-haspopup="dialog"
              aria-expanded={filterMenuOpen}
              onClick={() => setFilterMenuOpen((open) => !open)}
              className="sm:hidden"
            />
          </>
        )}
        {topRight}
      </div>

      {/* In basso a sinistra (lontano dal pulsante + dello shell, in basso a destra): disposizione dei tavoli. */}
      {canEditLayout && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-30 flex max-w-[calc(100%-5rem)] flex-col items-start gap-1.5 [&>*]:pointer-events-auto">
          {editing && duplicates.size > 0 && (
            <p role="alert" className="rounded-lg border border-danger/40 bg-paper/95 px-2.5 py-1 text-[12px] text-danger shadow-sm">
              Numeri ripetuti: {[...duplicates].sort((a, b) => a - b).join(", ")}
            </p>
          )}
          {editing && saveBlocked && (
            <p role="status" className={cn(FLOAT_SURFACE, "max-w-full px-2.5 py-1 text-[12px] text-ink")}>
              {saveBlocked}
            </p>
          )}
          {editing && (
            <div className="flex max-w-full flex-wrap items-center gap-1.5">
              <ScopeSwitch value={scope} dayLabel={dayLabel} onChange={onScopeChange} disabled={saving} />
              {dayLayoutActive && (
                <FloatButton
                  label="Ripristina disposizione standard"
                  showLabel="never"
                  icon={<RotateCcw aria-hidden="true" className="size-4" />}
                  disabled={saving}
                  onClick={onResetDay}
                />
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {editing ? (
              <>
                <FloatButton label="Annulla" showLabel="always" disabled={saving} onClick={onCancelEdit} />
                <FloatButton label="Tavolo" icon={<Plus aria-hidden="true" className="size-4" />} showLabel="always" disabled={saving} onClick={onAddTable} />
                <FloatButton
                  label={saving ? "Salvataggio…" : "Salva"}
                  showLabel="always"
                  tone="primary"
                  disabled={saving || duplicates.size > 0 || saveBlocked !== null}
                  aria-busy={saving || undefined}
                  onClick={onSave}
                />
                {items.length === 0 ? (
                  // Sala ancora vuota: suggerimento discreto accanto a "+ Tavolo".
                  <span className={cn(FLOAT_SURFACE, "px-2.5 py-1 text-[11px] text-slate-dark")}>Aggiungi il primo tavolo</span>
                ) : (
                  <span className={cn(FLOAT_SURFACE, "hidden px-2.5 py-1 text-[11px] text-slate-dark desk:inline-block")}>
                    Trascina i tavoli · passo 25 cm · R ruota
                  </span>
                )}
              </>
            ) : (
              <FloatButton label="Modifica disposizione" icon={<Move aria-hidden="true" className="size-4" />} onClick={onStartEdit} />
            )}
          </div>
        </div>
      )}

      {filterMenuOpen && (
        <FloorPopover
          mode={menuMode}
          title="Filtra tavoli"
          placement="below"
          getAnchor={() => filterButtonRef.current}
          onClose={() => setFilterMenuOpen(false)}
        >
          <ul className="flex flex-col gap-1">
            {TABLE_FILTER_OPTIONS.map((option) => {
              const active = option.value === filter;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onFilterChange(option.value);
                      setFilterMenuOpen(false);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between rounded-md px-3 text-[14px] font-medium transition-colors",
                      active ? "bg-petrol text-paper" : "text-ink hover:bg-cream",
                    )}
                  >
                    {option.label}
                    <span className={cn("tabular-nums", active ? "text-paper/75" : "text-slate-dark")}>{counts[option.value]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </FloorPopover>
      )}
    </section>
  );
}

/** Tutti | Liberi | Occupati con i conteggi, su superficie flottante. */
function FilterSwitch({
  value,
  onChange,
  counts,
  className,
}: {
  value: TableFilter;
  onChange: (filter: TableFilter) => void;
  counts: Record<TableFilter, number>;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Filtra tavoli" className={cn(FLOAT_SURFACE, "inline-flex shrink-0 gap-0.5 p-0.5", className)}>
      {TABLE_FILTER_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium transition-colors duration-200",
              active ? "bg-ink text-paper" : "text-ink hover:bg-field",
            )}
          >
            {option.label}
            <span className={cn("tabular-nums", active ? "text-paper/70" : "text-slate-dark")}>{counts[option.value]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ambito della modifica: "Sempre" (standard della sala) o "Solo gg/mm pranzo|cena". */
function ScopeSwitch({
  value,
  dayLabel,
  onChange,
  disabled,
}: {
  value: EditScope;
  dayLabel: string;
  onChange: (scope: EditScope) => void;
  disabled: boolean;
}) {
  const options: Array<{ value: EditScope; label: string }> = [
    { value: "always", label: "Sempre" },
    { value: "day", label: `Solo ${dayLabel}` },
  ];
  return (
    <div role="group" aria-label="Ambito della disposizione" className={cn(FLOAT_SURFACE, "inline-flex min-w-0 max-w-full shrink gap-0.5 p-0.5")}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-9 min-w-0 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors duration-200 disabled:opacity-50",
              active ? "bg-ink text-paper" : "text-ink hover:bg-field",
            )}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Stanza non rettangolare (Pozzo): fuori dal perimetro si copre il canvas, e si disegna il contorno. */
function PolygonMask({ geometry }: { geometry: RoomGeometry }) {
  const box = geometryBox(geometry);
  const points = polygonPointList(geometry.polygon ?? "");
  const outline = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + " Z";
  const outer = `M${box.x} ${box.y} H${box.x + box.w} V${box.y + box.h} H${box.x} Z`;
  return (
    <svg
      aria-hidden="true"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full max-w-none"
    >
      <path d={`${outer} ${outline}`} fillRule="evenodd" className="fill-cream" />
      <path d={outline} fill="none" className="stroke-ink/30" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
