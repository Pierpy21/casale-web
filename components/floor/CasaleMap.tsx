"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/components/ui/cn";
import {
  FLOOR_CORRIDOR,
  boxEquals,
  easeOutCubic,
  floorPlanBox,
  geometryBox,
  geometryLabelPoint,
  lerpBox,
  padBox,
  viewBoxString,
  type Box,
  type RoomGeometry,
} from "@/lib/floor-geometry";
import type { Room } from "@/lib/types";
import { paxLabel, type RoomStatus } from "./floor-model";

/** Durata dello zoom stanza ↔ piantina. */
const ZOOM_MS = 450;
/** Vista iniziale: tutta la piantina con un margine stretto (più disegno, meno bordo). */
const FULL_BOX = floorPlanBox(8);

export interface MapRoomEntry {
  room: Room;
  geometry: RoomGeometry;
  status: RoomStatus;
}

export interface CasaleMapProps {
  entries: MapRoomEntry[];
  /** Stanza verso cui zoomare (null = tutta la piantina). */
  focusRoomId: string | null;
  /** Stanza da cui parte la vista al montaggio (ritorno da una stanza: zoom inverso). */
  startRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  /** Fine dello zoom: id della stanza raggiunta, null se la vista è tornata alla piantina. */
  onFocusSettled: (roomId: string | null) => void;
}

/** Riquadro di zoom della stanza (bbox con un piccolo margine). */
function roomBox(geometry: RoomGeometry): Box {
  return padBox(geometryBox(geometry), 4);
}

/**
 * viewBox animato con requestAnimationFrame (ease-out). Con prefers-reduced-motion salta direttamente all'arrivo.
 * Parte sempre dal riquadro corrente, così un'inversione a metà resta fluida.
 */
function useAnimatedViewBox(target: Box, initial: Box, onSettled: () => void): Box {
  const [box, setBox] = useState(initial);
  const current = useRef(initial);
  const settled = useRef(onSettled);

  useEffect(() => {
    settled.current = onSettled;
  });

  const { x, y, w, h } = target;
  useEffect(() => {
    const goal = { x, y, w, h };
    const from = current.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instant = reduce || boxEquals(from, goal);
    let start: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      start ??= now;
      const t = instant ? 1 : Math.min(1, (now - start) / ZOOM_MS);
      const next = lerpBox(from, goal, easeOutCubic(t));
      current.current = next;
      setBox(next);
      if (t < 1) frame = requestAnimationFrame(tick);
      else settled.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [x, y, w, h]);

  return box;
}

/** Tronca il testo alla larghezza della stanza (stima: 0.52 em per carattere). */
function fitText(text: string, width: number, fontSize: number): string {
  const max = Math.max(4, Math.floor((width - 10) / (fontSize * 0.52)));
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Piantina del casale (stesse geometrie della landing). Ogni stanza: nome e "3/8 liberi", oppure l'evento che la riserva.
 * Tocco su una stanza → zoom animato verso il suo riquadro; le altre stanze sfumano e la stanza diventa "carta",
 * poi la scheda passa alla vista tavoli.
 */
export function CasaleMap({ entries, focusRoomId, startRoomId, onSelectRoom, onFocusSettled }: CasaleMapProps) {
  const entryOf = (id: string | null) => (id ? entries.find((e) => e.room.id === id) ?? null : null);
  const focusEntry = entryOf(focusRoomId);
  const startEntry = entryOf(startRoomId);

  const target = focusEntry ? roomBox(focusEntry.geometry) : FULL_BOX;
  const [initial] = useState(() => (startEntry ? roomBox(startEntry.geometry) : FULL_BOX));
  const box = useAnimatedViewBox(target, initial, () => onFocusSettled(focusEntry?.room.id ?? null));

  // Livello di zoom 0..1 verso la stanza in evidenza (in arrivo o da cui si torna): guida le dissolvenze.
  const emphasis = focusEntry ?? startEntry;
  const emphasisBox = emphasis ? roomBox(emphasis.geometry) : null;
  const zoom =
    emphasisBox && FULL_BOX.w !== emphasisBox.w
      ? Math.min(1, Math.max(0, (FULL_BOX.w - box.w) / (FULL_BOX.w - emphasisBox.w)))
      : 0;
  const animating = zoom > 0.001;

  const onKey = (roomId: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectRoom(roomId);
    }
  };

  // Riempie il contenitore (che ha un'altezza): il disegno si centra in proporzione (preserveAspectRatio meet).
  // I comandi flottanti (children) stanno sopra, agli angoli.
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[2px] border border-ink/10 bg-cream">
      <svg
        viewBox={viewBoxString(box)}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Piantina del casale"
        className="absolute inset-0 size-full max-w-none select-none p-1.5 sm:p-3"
      >
        <g aria-hidden="true" style={{ opacity: 1 - zoom }}>
          {FLOOR_CORRIDOR.map(([x1, y1, x2, y2]) => (
            <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-ink" strokeWidth={1.5} />
          ))}
        </g>

        {entries.map(({ room, geometry, status }) => {
          const isEmphasis = emphasis?.room.id === room.id;
          const reserved = status.event !== null;
          const rb = geometryBox(geometry);
          const label = geometryLabelPoint(geometry);
          const large = geometry.size === "large";
          const infoSize = large ? 12 : 10.5;
          const others = isEmphasis ? 1 : 1 - zoom * 0.9;
          const textOpacity = isEmphasis ? 1 - zoom : 1;
          const info = reserved
            ? [fitText(status.event?.title ?? "Evento", rb.w, infoSize), paxLabel(status.event?.covers ?? 0)]
            : [status.total > 0 ? `${status.free}/${status.total} liberi` : "Nessun tavolo"];
          const ariaLabel = reserved
            ? `${room.name}: sala riservata, ${status.event?.title ?? "evento"}, ${status.event?.covers ?? 0} persone`
            : status.total > 0
              ? `${room.name}: ${status.free} tavoli liberi su ${status.total}`
              : `${room.name}: nessun tavolo`;

          const renderShape = (className: string, style?: { opacity: number }) =>
            geometry.polygon ? (
              <polygon points={geometry.polygon} className={className} style={style} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ) : (
              <rect
                x={rb.x}
                y={rb.y}
                width={rb.w}
                height={rb.h}
                rx={2}
                className={className}
                style={style}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            );

          return (
            <g
              key={room.id}
              role="button"
              tabIndex={animating ? -1 : 0}
              aria-label={ariaLabel}
              onClick={() => onSelectRoom(room.id)}
              onKeyDown={onKey(room.id)}
              style={{ opacity: others }}
              className={cn("group outline-none", animating ? "pointer-events-none" : "cursor-pointer")}
            >
              {renderShape(
                cn(
                  "fill-sand stroke-ink transition-colors duration-200",
                  !animating && "group-hover:fill-petrol-muted group-focus-visible:fill-petrol-muted group-focus-visible:stroke-petrol",
                ),
              )}
              {reserved &&
                renderShape(
                  "pointer-events-none fill-mustard/25 stroke-none transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0",
                )}
              {/* Durante lo zoom la stanza si "apre" in carta, come il canvas della vista tavoli. */}
              {isEmphasis && animating && renderShape("pointer-events-none fill-paper stroke-petrol", { opacity: zoom })}

              <g style={{ opacity: textOpacity }} className="pointer-events-none">
                {/* Telefono: solo il nome, più grande (lo stato è nell'elenco sotto la piantina). */}
                <text
                  x={label.x}
                  y={label.y - (reserved ? infoSize : infoSize / 2) - 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={cn(
                    "fill-ink font-serif font-medium transition-colors duration-200 group-hover:fill-paper group-focus-visible:fill-paper",
                    large ? "text-[18px] sm:text-[16px]" : "text-[15px] sm:text-[13px]",
                  )}
                >
                  {fitText(room.name, rb.w, large ? 18 : 15)}
                </text>
                {info.map((line, i) => (
                  <text
                    key={i}
                    x={label.x}
                    y={label.y + 4 + i * (infoSize + 3) + (reserved ? 0 : infoSize / 2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fontSize: infoSize }}
                    className={cn(
                      "font-sans tabular-nums tracking-wide transition-colors duration-200 group-hover:fill-paper/85 group-focus-visible:fill-paper/85 max-sm:hidden",
                      reserved ? "fill-ink" : "fill-slate-dark",
                    )}
                  >
                    {line}
                  </text>
                ))}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
