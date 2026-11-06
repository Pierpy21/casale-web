"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/components/ui/cn";
import {
  CHAIR,
  CHAIR_REACH,
  ROTATION_STEP,
  chairSlots,
  normalizeRotation,
  rotatedSize,
  tableFootprint,
  tablePieces,
} from "@/lib/floor-geometry";
import { paxLabel, seatsLabel, type TableItem, type TableSeat } from "./floor-model";

/** Lineetta tra il bordo (sedie comprese) e la maniglia di rotazione (px). */
const HANDLE_LINE = 14;
/** Pallino della maniglia (px) e area di tocco attorno (px). */
const HANDLE_KNOB = 12;
const HANDLE_HIT = 32;

/**
 * Colore del tavolo occupato: petrolio (prenotazione), mustard (evento), warning (in attesa),
 * danger (assegnato a più prenotazioni/eventi), ink (libero/anteprima).
 */
type Tone = "ink" | "petrol" | "mustard" | "warning" | "danger";

const CHAIR_TONE: Record<Tone, string> = {
  ink: "bg-ink",
  petrol: "bg-petrol",
  mustard: "bg-mustard",
  warning: "bg-warning",
  danger: "bg-danger",
};
const RIBBON_TONE: Record<Tone, string> = {
  ink: "bg-ink text-paper",
  petrol: "bg-petrol text-paper",
  mustard: "bg-mustard text-ink",
  warning: "bg-warning text-ink",
  danger: "bg-danger text-paper",
};
/** Etichetta del nome accanto al tavolo (tavoli troppo piccoli per scriverlo sopra). */
const TAG_TONE: Record<Tone, string> = {
  ink: "border-ink/40 text-ink",
  petrol: "border-petrol/50 text-petrol",
  mustard: "border-mustard text-ink",
  warning: "border-warning text-ink",
  danger: "border-danger text-danger",
};

function seatTone(seat: TableSeat | null): Tone {
  if (!seat) return "ink";
  if (seat.extra > 0) return "danger";
  if (seat.kind === "evento") return "mustard";
  return seat.waiting ? "warning" : "petrol";
}

function seatBadge(seat: TableSeat): string {
  if (seat.preview) return "Da salvare";
  if (seat.extra > 0) return "Doppio";
  if (seat.kind === "evento") return "Evento";
  return seat.waiting ? "Attesa" : "Prenotato";
}

export interface TableCardProps {
  item: TableItem;
  /** Pixel per metro del canvas della stanza. */
  ppm: number;
  /** Centro del tavolo nel canvas (px). */
  left: number;
  top: number;
  /** Chi è seduto (o anteprima in modifica). Null = libero. */
  seat: TableSeat | null;
  /** Menu del tavolo aperto. */
  selected: boolean;
  /** Attenuato (filtro o sala riservata da un evento). */
  dimmed: boolean;
  /** Modifica disposizione: trascinabile, niente nastrino. */
  editing: boolean;
  /** Numero ripetuto nella bozza. */
  invalid?: boolean;
  /** Tavolo libero destinazione di un'assegnazione in corso. */
  assignable?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** Modifica disposizione, tavolo selezionato: maniglia di rotazione (gradi 0–359). */
  onRotate?: (rotation: number) => void;
}

interface RotateDrag {
  pointerId: number;
  /** Centro del tavolo sullo schermo (px). */
  cx: number;
  cy: number;
  startAngle: number;
  startRotation: number;
}

/** Angolo (gradi, senso orario) del punto rispetto al centro. */
function pointerAngle(x: number, y: number, cx: number, cy: number): number {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

/**
 * Tavolo in scala: piano bianco (un rettangolo per pezzo, anche per tavolate a L e a U) con sedie scure attorno,
 * numero e posti al centro. Occupato: nastrino (prenotato, attesa, evento; anteprima "Da salvare") e nome con pax.
 * Rotazione: piano, sedie e nastrino ruotano attorno al centro; il testo resta sempre dritto. Il pulsante ha
 * l'ingombro ruotato (allineato agli assi), così anche il menu si ancora all'ingombro reale.
 * Il tocco apre il menu del tavolo: `data-table-key` è l'ancora che FloorPlanBoard passa a FloorPopover.
 */
export function TableCard({
  item,
  ppm,
  left,
  top,
  seat,
  selected,
  dimmed,
  editing,
  invalid = false,
  assignable = false,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onRotate,
}: TableCardProps) {
  const rotateDrag = useRef<RotateDrag | null>(null);

  const rotation = normalizeRotation(item.rotation);
  const round = item.shape === "tondo";
  const footprint = tableFootprint(item.shape, item.seats);
  const tableW = footprint.w * ppm;
  const tableH = footprint.h * ppm;
  const reach = CHAIR_REACH * ppm;
  const outerW = tableW + reach * 2;
  const outerH = tableH + reach * 2;
  const bounds = rotatedSize({ w: outerW, h: outerH }, rotation, round);
  const chairs = chairSlots(item.shape, item.seats);
  const pieces = tablePieces(item.shape, item.seats);

  // Quarti di giro più vicini: il testo dritto usa le misure del piano come appare (lati scambiati a 90°/270°),
  // il nastrino si sposta sull'angolo che appare in alto a destra (resta inclinato tra 0° e 90°, leggibile).
  const quarterTurns = Math.round(rotation / 90) % 4;
  const swap = !round && quarterTurns % 2 === 1;
  const faceW = swap ? tableH : tableW;
  const faceH = swap ? tableW : tableH;

  const tone = seatTone(seat);
  const ribbonTone: Tone = seat?.preview ? "ink" : tone;

  // Dettaglio in base alla dimensione del piano come appare a questa scala (con "1 di 3" serve un'altezza in più).
  const fullMinH = seat?.eventPart ? 64 : 50;
  const detail: "full" | "short" | "number" = faceW >= 70 && faceH >= fullMinH ? "full" : faceW >= 34 && faceH >= 32 ? "short" : "number";
  const numberSize = Math.round(Math.min(15, Math.max(10, Math.min(faceW, faceH) * 0.34)));
  const ribbonText = faceW >= 64 && faceH >= 40;

  const rotationText = rotation !== 0 ? `, ruotato di ${rotation}°` : "";
  const conflict = seat !== null && seat.extra > 0;
  const label = !seat
    ? `Tavolo ${item.number}, ${seatsLabel(item.seats)}${editing ? rotationText : ", libero"}`
    : conflict
      ? `Tavolo ${item.number}, ${seatsLabel(item.seats)}, assegnato ${seat.names.length} volte: ${seat.names.join(", ")}, ${paxLabel(seat.covers)}`
      : `Tavolo ${item.number}, ${seatsLabel(item.seats)}, ${seat.preview ? "da salvare" : seat.kind === "evento" ? "evento" : seat.waiting ? "in attesa" : "prenotato"}${seat.eventPart ? `, tavolo ${seat.eventPart.index} di ${seat.eventPart.total} dell'evento` : ""}: ${seat.name}, ${paxLabel(seat.covers)}`;
  // Nome fuori dal piano (sotto il tavolo) quando sul piano non c'è spazio per scriverlo.
  const nameOutside = seat !== null && detail !== "full";

  const plateBorder = invalid || conflict
    ? "border-danger"
    : seat?.kind === "evento"
      ? "border-mustard/60"
      : seat
        ? "border-petrol/40"
        : assignable
          ? "border-dashed border-petrol"
          : "border-ink/10";

  const style: CSSProperties = { left: left - bounds.w / 2, top: top - bounds.h / 2, width: bounds.w, height: bounds.h };

  // --- Maniglia di rotazione (mouse e touch): snap a 15°, Shift libero a 1° ---
  const rotatable = editing && selected && onRotate !== undefined;

  const handleRotateDown = (e: PointerEvent<HTMLSpanElement>) => {
    // Non deve partire il trascinamento del tavolo (pointerdown del pulsante).
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const button = e.currentTarget.closest("button");
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    e.currentTarget.setPointerCapture(e.pointerId);
    rotateDrag.current = { pointerId: e.pointerId, cx, cy, startAngle: pointerAngle(e.clientX, e.clientY, cx, cy), startRotation: rotation };
  };

  const handleRotateMove = (e: PointerEvent<HTMLSpanElement>) => {
    const d = rotateDrag.current;
    if (!d || d.pointerId !== e.pointerId || !onRotate) return;
    e.stopPropagation();
    const raw = d.startRotation + pointerAngle(e.clientX, e.clientY, d.cx, d.cy) - d.startAngle;
    const next = normalizeRotation(e.shiftKey ? raw : Math.round(raw / ROTATION_STEP) * ROTATION_STEP);
    if (next !== rotation) onRotate(next);
  };

  const handleRotateUp = (e: PointerEvent<HTMLSpanElement>) => {
    const d = rotateDrag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    rotateDrag.current = null;
  };

  return (
    <button
      type="button"
      aria-label={editing ? `${label}. Trascina o usa le frecce per spostarlo, R o Maiusc+R per ruotarlo` : label}
      aria-haspopup="dialog"
      aria-expanded={selected}
      data-table-key={item.key}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      style={style}
      className={cn(
        "group absolute select-none transition-opacity duration-200 focus-visible:outline-none",
        editing ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer",
        selected ? "z-20" : "z-10",
        dimmed && !selected && "opacity-35",
      )}
    >
      {/* Disegno ruotato: sedie, piano, nastrino e maniglia, attorno al centro. */}
      <span
        aria-hidden="true"
        className="absolute"
        style={{
          left: (bounds.w - outerW) / 2,
          top: (bounds.h - outerH) / 2,
          width: outerW,
          height: outerH,
          transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        {chairs.map((chair, index) => {
          const w = chair.width * ppm;
          const h = CHAIR.depth * ppm;
          return (
            <span
              key={index}
              className={cn("absolute rounded-[3px]", CHAIR_TONE[tone])}
              style={{
                left: outerW / 2 + chair.x * ppm - w / 2,
                top: outerH / 2 + chair.y * ppm - h / 2,
                width: w,
                height: h,
                transform: `rotate(${chair.angle}deg)`,
              }}
            />
          );
        })}

        {/* Piano: un rettangolo per pezzo (tondo, quadrato, rettangolare: uno; L e U: più pezzi). */}
        {pieces.map((piece, index) => (
          <span
            key={index}
            style={{
              left: reach + (piece.x + footprint.w / 2) * ppm,
              top: reach + (piece.y + footprint.h / 2) * ppm,
              width: piece.w * ppm,
              height: piece.h * ppm,
            }}
            className={cn(
              "absolute border bg-field shadow-sm shadow-ink/10 transition-[box-shadow,border-color] duration-200",
              round ? "rounded-full" : "rounded-[4px]",
              plateBorder,
              seat?.preview && "border-dashed",
              selected
                ? "ring-2 ring-petrol ring-offset-2 ring-offset-paper"
                : seat?.extending
                  ? "ring-2 ring-mustard ring-offset-2 ring-offset-paper"
                  : "group-hover:border-petrol/60 group-focus-visible:ring-2 group-focus-visible:ring-petrol group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-paper",
            )}
          />
        ))}

        {seat && (
          // Nastrino nell'angolo che appare in alto a destra (ritagliato sul riquadro del piano, anche per il tondo):
          // il riquadro di ritaglio gira all'indietro di quarti di giro. Tavolo piccolo: un angolo colorato.
          <span
            className="pointer-events-none absolute overflow-hidden"
            style={{
              left: reach + (tableW - (swap ? tableH : tableW)) / 2,
              top: reach + (tableH - (swap ? tableW : tableH)) / 2,
              width: swap ? tableH : tableW,
              height: swap ? tableW : tableH,
              transform: quarterTurns !== 0 ? `rotate(${-quarterTurns * 90}deg)` : undefined,
            }}
          >
            {ribbonText ? (
              <span
                className={cn(
                  "absolute -right-[30px] top-[10px] w-[100px] rotate-45 py-[2px] text-center text-[8px] font-medium uppercase leading-tight tracking-[0.12em] shadow-sm shadow-ink/20",
                  RIBBON_TONE[ribbonTone],
                )}
              >
                {seatBadge(seat)}
              </span>
            ) : (
              <span
                className={cn("absolute right-0 top-0 size-3 [clip-path:polygon(0_0,100%_0,100%_100%)]", CHAIR_TONE[ribbonTone])}
                style={round ? { right: tableW * 0.12, top: tableH * 0.12 } : undefined}
              />
            )}
          </span>
        )}

        {rotatable && (
          <>
            <span
              className="pointer-events-none absolute w-px bg-petrol"
              style={{ left: outerW / 2 - 0.5, top: -HANDLE_LINE, height: HANDLE_LINE }}
            />
            <span
              title="Trascina per ruotare (Maiusc: senza scatti)"
              onPointerDown={handleRotateDown}
              onPointerMove={handleRotateMove}
              onPointerUp={handleRotateUp}
              onPointerCancel={handleRotateUp}
              // Il click che segue la rotazione non deve chiudere/riaprire il menu del tavolo.
              onClick={(e) => e.stopPropagation()}
              className="absolute grid cursor-grab touch-none place-items-center active:cursor-grabbing"
              style={{
                left: outerW / 2 - HANDLE_HIT / 2,
                top: -HANDLE_LINE - HANDLE_KNOB / 2 - HANDLE_HIT / 2,
                width: HANDLE_HIT,
                height: HANDLE_HIT,
              }}
            >
              <span
                className="block rounded-full border-2 border-petrol bg-paper shadow-sm shadow-ink/20"
                style={{ width: HANDLE_KNOB, height: HANDLE_KNOB }}
              />
            </span>
          </>
        )}
      </span>

      {/* Testo sempre dritto, centrato sul bounding box del tavolo, nelle misure del piano come appare. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden px-1 text-center"
        style={{ left: (bounds.w - faceW) / 2, top: (bounds.h - faceH) / 2, width: faceW, height: faceH }}
      >
        {detail === "full" ? (
          <>
            <span className="max-w-full truncate font-serif text-[13px] leading-tight text-ink">Tavolo {item.number}</span>
            {seat?.eventPart && (
              <span className="text-[10px] font-medium leading-tight text-mustard">
                {seat.eventPart.index} di {seat.eventPart.total}
              </span>
            )}
            {seat ? (
              <>
                <span
                  className={cn(
                    "max-w-full truncate text-[11px] font-medium leading-tight",
                    conflict ? "text-danger" : seat.kind === "evento" ? "text-ink" : "text-petrol",
                  )}
                >
                  {seat.name}
                  {seat.extra > 0 && ` +${seat.extra}`}
                </span>
                <span className="text-[11px] leading-tight tabular-nums text-slate-dark">{paxLabel(seat.covers)}</span>
              </>
            ) : (
              <span className="text-[11px] leading-tight tabular-nums text-slate-dark">{seatsLabel(item.seats)}</span>
            )}
          </>
        ) : (
          // Scala piccola: solo il numero (e i pax/posti se c'è spazio per una seconda riga).
          <>
            <span className="max-w-full truncate font-serif leading-none text-ink" style={{ fontSize: numberSize }}>
              {item.number}
            </span>
            {detail === "short" && (
              <span className="max-w-full truncate text-[10px] leading-tight tabular-nums text-slate-dark">
                {seat?.eventPart ? `×${seat.eventPart.total}` : seat ? paxLabel(seat.covers) : item.seats}
              </span>
            )}
          </>
        )}
      </span>

      {seat && nameOutside && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-1/2 top-full mt-0.5 max-w-36 -translate-x-1/2 truncate whitespace-nowrap border bg-paper/95 px-1 text-[10px] font-medium leading-[14px] shadow-sm shadow-ink/10",
            TAG_TONE[seat.preview ? "ink" : tone],
            seat.preview && "border-dashed",
          )}
        >
          {seat.name}
          {seat.extra > 0 && ` +${seat.extra}`}
        </span>
      )}
    </button>
  );
}
