"use client";

import { Minus, Plus, RotateCcw, RotateCw, Trash2, User, X } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/components/ui/cn";
import { stepRotation } from "@/lib/floor-geometry";
import { TABLE_SHAPES, type TableShape } from "@/lib/types";
import { MAX_TABLE_SEATS, paxLabel, type PendingAssignment, type TableItem } from "./floor-model";

export interface TableEditorProps {
  item: TableItem;
  /** Il numero è già usato da un altro tavolo della bozza. */
  duplicate: boolean;
  /** La tavolata (sedie comprese, ruotata) è più grande della stanza. Solo avviso. */
  tooBig: boolean;
  onChange: (patch: Partial<Pick<TableItem, "number" | "seats" | "shape" | "rotation">>) => void;
  onDelete: () => void;
  /** Assegnazione in attesa di salvataggio su questo tavolo (es. tavolata generata da un evento). */
  assigned?: PendingAssignment | null;
  /** Toglie l'assegnazione in attesa: il tavolo resta, la prenotazione/evento torna da assegnare. */
  onUnassign?: () => void;
}

const MIN_SEATS = 1;

const SHAPE_NAME: Record<TableShape, string> = {
  tondo: "Tondo",
  quadrato: "Quadrato",
  rettangolare: "Rettangolare",
  L: "Tavolata a L",
  U: "Tavolata a U",
};

/** Riquadro comune dei controlli (altezza 36 px). */
const BOX = "flex h-9 shrink-0 items-center rounded-md border border-field-edge bg-field";
const ICON_BTN =
  "grid h-full w-8 place-items-center text-petrol transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent";

/**
 * Editor compatto del tavolo in modifica disposizione: N°, posti (− 4 +), forma (icone), rotazione (↺ ↻, 15°), cestino.
 * Una sola riga, senza intestazione né "Fatto": si chiude toccando fuori o con Esc. Le modifiche vanno nella bozza
 * e si salvano tutte insieme con "Salva". Montarlo con key = tavolo.
 */
export function TableEditor({ item, duplicate, tooBig, onChange, onDelete, assigned = null, onUnassign }: TableEditorProps) {
  const id = useId();
  const [numberText, setNumberText] = useState(String(item.number));
  const parsed = Number.parseInt(numberText, 10);
  const numberValid = /^\d+$/.test(numberText) && parsed >= 1 && parsed <= 9999;
  const numberError = !numberValid ? "Numero da 1 a 9999" : duplicate ? "Numero già usato" : null;
  const setSeats = (seats: number) => onChange({ seats: Math.min(MAX_TABLE_SEATS, Math.max(MIN_SEATS, seats)) });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className={cn(BOX, "gap-1 pl-2", numberError && "border-danger")}>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-dark">N°</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={numberText}
            aria-label="Numero del tavolo"
            aria-invalid={numberError !== null || undefined}
            aria-describedby={numberError ? `${id}-errore` : undefined}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
              setNumberText(digits);
              const next = Number.parseInt(digits, 10);
              if (next >= 1 && next <= 9999) onChange({ number: next });
            }}
            onFocus={(e) => e.currentTarget.select()}
            className="h-full w-11 min-w-0 bg-transparent pr-1 text-[14px] font-medium tabular-nums text-ink outline-none"
          />
        </label>

        <div role="group" aria-label="Posti" className={cn(BOX, "overflow-hidden")}>
          <button type="button" aria-label="Un posto in meno" disabled={item.seats <= MIN_SEATS} onClick={() => setSeats(item.seats - 1)} className={ICON_BTN}>
            <Minus aria-hidden="true" className="size-3.5" />
          </button>
          <span aria-live="polite" className="flex min-w-10 items-center justify-center gap-0.5 text-[14px] font-medium tabular-nums text-ink">
            <User aria-hidden="true" className="size-3.5 text-slate-dark" />
            {item.seats}
            <span className="sr-only">{item.seats === 1 ? "posto" : "posti"}</span>
          </span>
          <button
            type="button"
            aria-label="Un posto in più"
            disabled={item.seats >= MAX_TABLE_SEATS}
            onClick={() => setSeats(item.seats + 1)}
            className={ICON_BTN}
          >
            <Plus aria-hidden="true" className="size-3.5" />
          </button>
        </div>

        <div role="group" aria-label="Forma" className={cn(BOX, "gap-0.5 p-0.5")}>
          {TABLE_SHAPES.map((shape) => {
            const active = shape === item.shape;
            return (
              <button
                key={shape}
                type="button"
                aria-pressed={active}
                aria-label={SHAPE_NAME[shape]}
                title={SHAPE_NAME[shape]}
                onClick={() => onChange({ shape })}
                className={cn(
                  "grid h-full w-8 place-items-center rounded-[4px] transition-colors",
                  active ? "bg-petrol text-paper" : "text-petrol hover:bg-cream",
                )}
              >
                <ShapeIcon shape={shape} />
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Rotazione" className={cn(BOX, "overflow-hidden")}>
          <button
            type="button"
            aria-label="Ruota a sinistra"
            title="Ruota a sinistra (Maiusc+R)"
            onClick={() => onChange({ rotation: stepRotation(item.rotation, -1) })}
            className={ICON_BTN}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
          </button>
          {item.rotation !== 0 && (
            <span aria-live="polite" className="min-w-8 text-center text-[11px] font-medium tabular-nums text-slate-dark">
              {item.rotation}°<span className="sr-only"> di rotazione</span>
            </span>
          )}
          <button
            type="button"
            aria-label="Ruota a destra"
            title="Ruota a destra (R)"
            onClick={() => onChange({ rotation: stepRotation(item.rotation, 1) })}
            className={ICON_BTN}
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
          </button>
        </div>

        <button
          type="button"
          aria-label="Elimina tavolo"
          title="Elimina tavolo"
          onClick={onDelete}
          className="grid size-9 shrink-0 place-items-center rounded-md text-danger transition-colors hover:bg-danger/10"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>

      {assigned && (
        <div className="flex min-w-0 items-center gap-2 px-1 text-[12px] text-ink">
          <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", assigned.event ? "bg-mustard" : "bg-petrol")} />
          <span className="min-w-0 truncate">
            {assigned.event ? "Evento" : "Assegnato a"} {assigned.label || "Senza nome"} · {paxLabel(assigned.covers)}
          </span>
          {onUnassign && (
            <button
              type="button"
              onClick={onUnassign}
              className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 font-medium text-petrol transition-colors hover:bg-cream"
            >
              <X aria-hidden="true" className="size-3.5" />
              Disassegna
            </button>
          )}
        </div>
      )}
      {numberError && (
        <p id={`${id}-errore`} className="px-1 text-[12px] text-danger">
          {numberError}
        </p>
      )}
      {tooBig && (
        <p role="status" className="flex items-center gap-1.5 px-1 text-[12px] text-ink">
          <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-warning" />
          La tavolata non entra nella sala
        </p>
      )}
    </div>
  );
}

/** Sagoma della forma: cerchio, quadrato, rettangolo, tavolata a L e a U. */
function ShapeIcon({ shape }: { shape: TableShape }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor">
      {shape === "tondo" ? (
        <circle cx="10" cy="10" r="7" />
      ) : shape === "quadrato" ? (
        <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
      ) : shape === "rettangolare" ? (
        <rect x="1.5" y="6" width="17" height="8" rx="1.5" />
      ) : shape === "L" ? (
        <path d="M2 3H18V8H7V17H2Z" />
      ) : (
        <path d="M2 3H18V17H13V8H7V17H2Z" />
      )}
    </svg>
  );
}
