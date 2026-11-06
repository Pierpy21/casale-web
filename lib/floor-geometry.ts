/**
 * Geometria della mappa sala (pura, senza React): piantina del casale, scala reale e ingombro dei tavoli.
 *
 * Le stanze sono quelle della piantina della landing (app/(site)/components/RoomGallery.tsx: svgRect/svgPolygon),
 * nel sistema di coordinate SVG 800×600. Scala: 14 unità SVG ≈ 1 metro (Sala 1: 111×86 unità = 8×6 m),
 * uguale per tutte le stanze. Le sale del DB si collegano alla geometria per NOME (senza maiuscole/spazi doppi).
 */
import type { TableShape } from "@/lib/types";

/** Rettangolo in unità SVG (o in metri, a seconda del contesto). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Meters {
  w: number;
  h: number;
}

export interface RoomGeometry {
  /** Nome canonico della stanza nella piantina. */
  name: string;
  /** Stanza grande: etichetta più grande sulla piantina. */
  size: "large" | "small";
  rect?: { x: number; y: number; w: number; h: number };
  /** Punti "x,y x,y ..." (stanze non rettangolari). */
  polygon?: string;
  /** Misure reali note (prevalgono sul calcolo dal bounding box). */
  meters?: Meters;
  /** Spostamento verticale dell'etichetta rispetto al centro del bbox (unità SVG). */
  labelDy?: number;
}

/** Sistema di coordinate della piantina. */
export const FLOOR_VIEWBOX: Box = { x: 0, y: 0, w: 800, h: 600 };

/** Unità SVG della piantina per metro reale (Sala 1: 111×86 unità = 8×6 m). */
export const SVG_UNITS_PER_METER = 14;

/** Misure di ripiego per le sale senza geometria (metri). */
export const DEFAULT_ROOM_METERS: Meters = { w: 10, h: 7 };

/** Passo dello snap in modifica disposizione (metri). */
export const LAYOUT_SNAP_METERS = 0.25;

const GEOMETRIES: RoomGeometry[] = [
  { name: "Sala 3", size: "small", rect: { x: 53, y: 143, w: 89, h: 153 } },
  { name: "Palmento", size: "large", rect: { x: 534, y: 175, w: 169, h: 121 } },
  { name: "Sala Grande", size: "large", rect: { x: 422, y: 118, w: 112, h: 178 } },
  { name: "Sala 2", size: "small", rect: { x: 142, y: 143, w: 86, h: 91 } },
  { name: "Sala 1", size: "small", rect: { x: 255, y: 210, w: 111, h: 86 }, meters: { w: 8, h: 6 } },
  { name: "Terrazza", size: "large", rect: { x: 255, y: 296, w: 448, h: 175 } },
  {
    name: "Pozzo",
    size: "small",
    polygon: "81,380 81,296 142,296 142,234 228,234 228,210 255,210 255,380",
    labelDy: 25,
  },
];

/** Muri del corridoio d'ingresso (come la landing): segmenti x1,y1,x2,y2. */
export const FLOOR_CORRIDOR: ReadonlyArray<readonly [number, number, number, number]> = [
  [227, 178, 365, 178],
  [365, 178, 365, 119],
  [365, 119, 422, 119],
];

function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase("it").replace(/\s+/g, " ");
}

const BY_NAME = new Map(GEOMETRIES.map((g) => [normalizeName(g.name), g]));

/** Geometria della stanza dal nome della sala (case-insensitive). Null se la sala non è sulla piantina. */
export function geometryForRoomName(name: string): RoomGeometry | null {
  return BY_NAME.get(normalizeName(name)) ?? null;
}

/** "x,y x,y" -> coppie numeriche. */
export function polygonPointList(points: string): Array<[number, number]> {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [x, y] as [number, number];
    });
}

/** Bounding box della stanza (unità SVG). */
export function geometryBox(g: RoomGeometry): Box {
  if (g.rect) return { ...g.rect };
  const points = polygonPointList(g.polygon ?? "");
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** Punto dell'etichetta (centro del bbox, con eventuale spostamento). */
export function geometryLabelPoint(g: RoomGeometry): { x: number; y: number } {
  const box = geometryBox(g);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 + (g.labelDy ?? 0) };
}

export function padBox(box: Box, pad: number): Box {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

/** Riquadro di tutta la piantina: unione delle stanze con margine (vista iniziale della mappa). */
export function floorPlanBox(pad = 14): Box {
  const boxes = GEOMETRIES.map(geometryBox);
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return padBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, pad);
}

export function lerpBox(a: Box, b: Box, t: number): Box {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

export function boxEquals(a: Box, b: Box, epsilon = 0.01): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon && Math.abs(a.w - b.w) < epsilon && Math.abs(a.h - b.h) < epsilon
  );
}

export function viewBoxString(b: Box): string {
  return `${b.x} ${b.y} ${b.w} ${b.h}`;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Misure reali della stanza in metri (dal bbox, 14 unità = 1 m). Sale senza geometria: DEFAULT_ROOM_METERS. */
export function roomMeters(g: RoomGeometry | null): Meters {
  if (!g) return DEFAULT_ROOM_METERS;
  if (g.meters) return g.meters;
  const box = geometryBox(g);
  return { w: round1(box.w / SVG_UNITS_PER_METER), h: round1(box.h / SVG_UNITS_PER_METER) };
}

/** 12.7 -> "12,7"; 8 -> "8". */
export function formatMeters(value: number): string {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** "8 × 6 m". */
export function formatRoomSize(m: Meters): string {
  return `${formatMeters(m.w)} × ${formatMeters(m.h)} m`;
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Posizione in % della stanza agganciata alla griglia di `step` metri lungo un lato lungo `sideMeters`. */
export function snapPercent(value: number, sideMeters: number, step = LAYOUT_SNAP_METERS): number {
  if (sideMeters <= 0) return clampPercent(value);
  const stepPct = (step / sideMeters) * 100;
  const snapped = Math.round(value / stepPct) * stepPct;
  return Math.round(clampPercent(snapped) * 100) / 100;
}

/** Passo di un tasto freccia in % (uguale allo snap). */
export function snapStepPercent(sideMeters: number, step = LAYOUT_SNAP_METERS): number {
  return sideMeters > 0 ? (step / sideMeters) * 100 : 2.5;
}

// ---------------------------------------------------------------------
// Tavoli e sedie (misure in metri, relative al centro del tavolo)
// ---------------------------------------------------------------------

/** Sedia: larghezza, profondità e distanza dal bordo del tavolo. Sporge gap + depth ≈ 0.35 m. */
export const CHAIR = { width: 0.45, depth: 0.27, gap: 0.08 } as const;
/** Quanto sporgono le sedie dal bordo del tavolo. */
export const CHAIR_REACH = CHAIR.gap + CHAIR.depth;
/** Spazio per coperto lungo un lato. */
const SEAT_PITCH = 0.6;

/** Lato superiore, inferiore, sinistro, destro. */
type Side = "top" | "bottom" | "left" | "right";

/** Diametro del tavolo tondo in base ai posti. */
function roundDiameter(seats: number): number {
  if (seats <= 4) return 0.9;
  if (seats <= 6) return 1.2;
  // Diametro minimo per il numero di posti, ma sempre abbastanza circonferenza per 0.6 m a coperto (passo fisso).
  const base = seats <= 10 ? 1.5 : 1.8;
  return Math.max(base, (seats * SEAT_PITCH) / Math.PI);
}

/** Posti per lato del quadrato: giro top, bottom, left, right. */
function squareSides(seats: number): Record<Side, number> {
  const order: Side[] = ["top", "bottom", "left", "right"];
  const counts: Record<Side, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let i = 0; i < seats; i++) counts[order[i % 4]] += 1;
  return counts;
}

/** Rettangolare: un posto per capo (da 4 posti), il resto sui lati lunghi. */
function rectSides(seats: number): Record<Side, number> {
  const ends = seats >= 4 ? 1 : 0;
  const long = seats - ends * 2;
  return { top: Math.ceil(long / 2), bottom: Math.floor(long / 2), left: ends, right: ends };
}

// ---------------------------------------------------------------------
// Tavolate a L e a U (banchetti): pezzi rettangolari profondi 0.8 m.
// Orientamento a rotazione 0:
// - L: braccio orizzontale in alto, braccio verticale a sinistra; posti fuori e dentro, capotavola su angolo esterno ed estremi.
// - U: base in alto (posti solo fuori), bracci a sinistra e a destra (posti fuori e dentro), apertura in basso;
//   capotavola sui fianchi della base (niente posti in fondo ai bracci). Mai posti a ridosso degli angoli interni.
// ---------------------------------------------------------------------

/** Profondità di una tavolata da banchetto. */
const BANQUET_DEPTH = 0.8;
/** Spazio libero minimo all'interno della U (tra i due bracci): senza posti interni / con posti interni su entrambi i bracci. */
const U_INNER_GAP = 1.2;
const U_INNER_GAP_SEATED = 1.8;

/** Rettangolo di un pezzo di tavolo (metri, relativo al centro del tavolo; x/y = angolo in alto a sinistra). */
export interface TablePiece {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Posti di una tavolata L/U per fila (lati lunghi) e capotavola (lati corti). */
export interface BanquetSeats {
  /** Lato esterno della base / del braccio orizzontale (in alto). */
  top: number;
  /** Solo L: lato interno del braccio orizzontale (sotto, a destra del braccio verticale). */
  topIn: number;
  /** Lato esterno del braccio sinistro / destro (sotto la base). */
  left: number;
  right: number;
  /** Lato interno del braccio sinistro / destro. */
  leftIn: number;
  rightIn: number;
  /** Capotavola (un posto per ogni lato corto libero). U: fianchi della base (2); L: angolo esterno + i due estremi (3). */
  heads: number;
}

/** Posti massimi sul lato corto (base) della U. */
const U_MAX_BASE_SEATS = 7;

/** Spazio lasciato libero negli angoli interni: nessun posto subito a ridosso dell'angolo. */
const INNER_CORNER_CLEARANCE = 0.6;

/** Distribuisce `count` posti su file, in ordine (le prime file prendono il resto). */
function spread(count: number, rows: number): number[] {
  const q = Math.floor(count / rows);
  const r = count % rows;
  return Array.from({ length: rows }, (_, i) => q + (i < r ? 1 : 0));
}

/**
 * Posti per fila di una tavolata L/U: lati lunghi fuori e dentro (la base della U solo fuori),
 * un posto per ogni capotavola (da 6 coperti), nessun posto negli angoli interni.
 */
export function banquetArms(shape: "L" | "U", seats: number): BanquetSeats {
  const n = Math.max(shape === "U" ? 3 : 2, Math.round(seats));
  if (shape === "L") {
    const heads = n >= 6 ? 3 : 0;
    const [top, left, topIn, leftIn] = spread(n - heads, 4);
    return { top, topIn, left, right: 0, leftIn, rightIn: 0, heads };
  }
  const heads = n >= 6 ? 2 : 0;
  const rest = n - heads;
  // Lato corto (base): circa il 20% dei posti, al massimo 7.
  const top = Math.min(U_MAX_BASE_SEATS, Math.max(1, Math.round(rest * 0.2)));
  const [left, right, leftIn, rightIn] = spread(rest - top, 4);
  return { top, topIn: 0, left, right, leftIn, rightIn, heads };
}

/** Dimensioni complessive (bounding box del piano, metri) di una tavolata L/U. */
function banquetSize(shape: "L" | "U", seats: number): Meters {
  const s = banquetArms(shape, seats);
  const D = BANQUET_DEPTH;
  const C = INNER_CORNER_CLEARANCE;
  const inner = (count: number) => (count > 0 ? C + count * SEAT_PITCH : 0);
  if (shape === "L") {
    return {
      w: Math.max(1.2, s.top * SEAT_PITCH, D + inner(s.topIn)),
      h: Math.max(D + 0.6, D + s.left * SEAT_PITCH, D + inner(s.leftIn)),
    };
  }
  const gap = s.leftIn > 0 || s.rightIn > 0 ? U_INNER_GAP_SEATED : U_INNER_GAP;
  const w = Math.max(s.top * SEAT_PITCH, 2 * D + gap);
  const h = D + Math.max(0.6, s.left * SEAT_PITCH, s.right * SEAT_PITCH, inner(s.leftIn), inner(s.rightIn));
  return { w, h };
}

/** Pezzi rettangolari del piano del tavolo. Tondo/quadrato/rettangolare: un pezzo = tutto il piano. */
export function tablePieces(shape: TableShape, seats: number): TablePiece[] {
  if (shape !== "L" && shape !== "U") {
    const f = tableFootprint(shape, seats);
    return [{ x: -f.w / 2, y: -f.h / 2, w: f.w, h: f.h }];
  }
  const { w, h } = banquetSize(shape, seats);
  const D = BANQUET_DEPTH;
  const pieces: TablePiece[] = [
    { x: -w / 2, y: -h / 2, w, h: D },
    { x: -w / 2, y: -h / 2 + D, w: D, h: h - D },
  ];
  if (shape === "U") pieces.push({ x: w / 2 - D, y: -h / 2 + D, w: D, h: h - D });
  return pieces;
}

/** Forma consigliata per una tavolata da evento in base ai coperti. */
export function suggestBanquetShape(covers: number): TableShape {
  if (covers <= 12) return "rettangolare";
  if (covers <= 24) return "L";
  return "U";
}

/** Forma per un tavolo generato (prenotazione o evento): quadrato fino a 4 coperti, poi la tavolata consigliata. */
export function suggestTableShape(covers: number): TableShape {
  return covers <= 4 ? "quadrato" : suggestBanquetShape(covers);
}

/** Coperti massimi sensati per forma: oltre, il tavolo va trasformato in tavolata (L/U illimitate). */
const SHAPE_CAPACITY: Record<TableShape, number> = { tondo: 10, quadrato: 8, rettangolare: 12, L: 24, U: Infinity };

/**
 * Forma di un tavolo esistente quando ci si siede un evento da `covers` coperti: resta la stessa se li regge,
 * altrimenti diventa la tavolata consigliata per quei coperti (rettangolare, L o U).
 */
export function shapeForCovers(current: TableShape, covers: number): TableShape {
  return covers <= SHAPE_CAPACITY[current] ? current : suggestBanquetShape(covers);
}

/** Ingombro del piano del tavolo (metri). Per L/U è il bounding box. */
export function tableFootprint(shape: TableShape, seats: number): Meters {
  const n = Math.max(1, seats);
  if (shape === "L" || shape === "U") return banquetSize(shape, n);
  if (shape === "tondo") {
    const d = roundDiameter(n);
    return { w: d, h: d };
  }
  if (shape === "quadrato") {
    const side = Math.max(0.9, Math.ceil(n / 4) * SEAT_PITCH);
    return { w: side, h: side };
  }
  const sides = rectSides(n);
  return { w: Math.max(1.2, sides.top * SEAT_PITCH), h: 0.8 };
}

/** Ingombro con le sedie (metri). */
export function tableOuterSize(shape: TableShape, seats: number): Meters {
  const f = tableFootprint(shape, seats);
  return { w: f.w + CHAIR_REACH * 2, h: f.h + CHAIR_REACH * 2 };
}

// ---------------------------------------------------------------------
// Rotazione dei tavoli (gradi in senso orario, 0–359, 0 = orizzontale)
// ---------------------------------------------------------------------

/** Passo della rotazione (pulsanti, tastiera, maniglia con snap). */
export const ROTATION_STEP = 15;

/** Qualsiasi angolo -> intero 0–359. */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** Passo successivo (dir 1 = orario, -1 = antiorario) agganciato ai multipli di `step`: 7° → 15° / 0°. */
export function stepRotation(deg: number, dir: 1 | -1, step = ROTATION_STEP): number {
  const current = normalizeRotation(deg);
  const next = dir === 1 ? Math.floor(current / step) * step + step : Math.ceil(current / step) * step - step;
  return normalizeRotation(next);
}

/** Ingombro allineato agli assi di un riquadro w×h ruotato di `deg` (il tondo non cambia). */
export function rotatedSize(size: Meters, deg: number, round = false): Meters {
  if (round) return size;
  const r = (normalizeRotation(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: size.w * c + size.h * s, h: size.w * s + size.h * c };
}

/** Ingombro del tavolo con le sedie, ruotato (metri, allineato agli assi della stanza). */
export function tableBounds(shape: TableShape, seats: number, rotation: number): Meters {
  return rotatedSize(tableOuterSize(shape, seats), rotation, shape === "tondo");
}

/**
 * Centro del tavolo (in % della stanza) tenuto dentro la stanza con tutto l'ingombro ruotato (sedie comprese).
 * Se il tavolo è più grande della stanza su un lato, su quel lato resta al centro.
 */
export function clampTableCenter(
  table: { shape: TableShape; seats: number; rotation: number; x: number; y: number },
  room: Meters,
): { x: number; y: number } {
  const bounds = tableBounds(table.shape, table.seats, table.rotation);
  const axis = (value: number, size: number, side: number) => {
    if (side <= 0) return clampPercent(value);
    const half = (size / 2 / side) * 100;
    if (half >= 50) return 50;
    return Math.round(Math.min(100 - half, Math.max(half, value)) * 100) / 100;
  };
  return { x: axis(table.x, bounds.w, room.w), y: axis(table.y, bounds.h, room.h) };
}

/** Sedia: centro (metri, relativo al centro del tavolo), rotazione in gradi (0 = sopra il tavolo), larghezza. */
export interface ChairSlot {
  x: number;
  y: number;
  angle: number;
  width: number;
}

const SIDE_ANGLE: Record<Side, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** Sedie distribuite sui lati (o in cerchio per il tondo). */
export function chairSlots(shape: TableShape, seats: number): ChairSlot[] {
  const n = Math.max(1, seats);
  const f = tableFootprint(shape, n);
  const offset = CHAIR.gap + CHAIR.depth / 2;

  if (shape === "tondo") {
    const r = f.w / 2;
    const ring = r + offset;
    // Il diametro garantisce già almeno 0.6 m di circonferenza a coperto: sedie sempre a larghezza piena.
    const width = CHAIR.width;
    return Array.from({ length: n }, (_, i) => {
      const theta = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { x: Math.cos(theta) * ring, y: Math.sin(theta) * ring, angle: (theta * 180) / Math.PI + 90, width };
    });
  }

  if (shape === "L" || shape === "U") return banquetChairs(shape, n, f, offset);

  const sides = shape === "quadrato" ? squareSides(n) : rectSides(n);
  const slots: ChairSlot[] = [];
  (Object.keys(sides) as Side[]).forEach((side) => {
    const count = sides[side];
    if (count === 0) return;
    const horizontal = side === "top" || side === "bottom";
    // Sedie distribuite sul lato, mai a meno di 0.6 m l'una dall'altra, sempre a larghezza piena.
    const length = horizontal ? f.w : f.h;
    const pitch = Math.max(SEAT_PITCH, length / count);
    const width = CHAIR.width;
    for (let i = 0; i < count; i++) {
      const along = -(count * pitch) / 2 + pitch * (i + 0.5);
      if (horizontal) {
        slots.push({ x: along, y: side === "top" ? -(f.h / 2 + offset) : f.h / 2 + offset, angle: SIDE_ANGLE[side], width });
      } else {
        slots.push({ x: side === "left" ? -(f.w / 2 + offset) : f.w / 2 + offset, y: along, angle: SIDE_ANGLE[side], width });
      }
    }
  });
  return slots;
}

/** Sedie delle tavolate L/U: lati lunghi fuori e dentro (base U solo fuori), capotavola sui lati corti, angoli interni liberi. */
function banquetChairs(shape: "L" | "U", seats: number, f: Meters, offset: number): ChairSlot[] {
  const s = banquetArms(shape, seats);
  const D = BANQUET_DEPTH;
  const C = INNER_CORNER_CLEARANCE;
  const slots: ChairSlot[] = [];
  // Sedie distribuite nel tratto, mai a meno di 0.6 m l'una dall'altra, sempre a larghezza piena.
  const row = (count: number, from: number, length: number, place: (along: number, width: number) => ChairSlot) => {
    if (count <= 0 || length <= 0) return;
    const pitch = Math.max(SEAT_PITCH, length / count);
    const start = from + (length - count * pitch) / 2;
    for (let i = 0; i < count; i++) slots.push(place(start + pitch * (i + 0.5), CHAIR.width));
  };
  const headWidth = CHAIR.width;
  const head = (x: number, y: number, side: Side) => slots.push({ x, y, angle: SIDE_ANGLE[side], width: headWidth });

  const left = -f.w / 2;
  const right = f.w / 2;
  const top = -f.h / 2;
  const bottom = f.h / 2;
  const armFrom = top + D;
  const armLength = f.h - D;
  const innerFrom = armFrom + C;
  const innerLength = bottom - innerFrom;

  // Fuori: lato superiore e lato esterno del braccio sinistro.
  row(s.top, left, f.w, (x, width) => ({ x, y: top - offset, angle: SIDE_ANGLE.top, width }));
  row(s.left, armFrom, armLength, (y, width) => ({ x: left - offset, y, angle: SIDE_ANGLE.left, width }));
  // Dentro il braccio sinistro (a destra del braccio, lontano dall'angolo interno).
  row(s.leftIn, innerFrom, innerLength, (y, width) => ({ x: left + D + offset, y, angle: SIDE_ANGLE.right, width }));

  if (shape === "L") {
    // Dentro il braccio orizzontale (sotto, lontano dall'angolo interno).
    const innerX = left + D + C;
    row(s.topIn, innerX, right - innerX, (x, width) => ({ x, y: top + D + offset, angle: SIDE_ANGLE.bottom, width }));
    if (s.heads === 3) {
      head(left - offset, top + D / 2, "left"); // angolo esterno
      head(right + offset, top + D / 2, "right"); // estremo del braccio orizzontale
      head(left + D / 2, bottom + offset, "bottom"); // estremo del braccio verticale
    }
    return slots;
  }

  row(s.right, armFrom, armLength, (y, width) => ({ x: right + offset, y, angle: SIDE_ANGLE.right, width }));
  row(s.rightIn, innerFrom, innerLength, (y, width) => ({ x: right - D - offset, y, angle: SIDE_ANGLE.left, width }));
  if (s.heads >= 2) {
    head(left - offset, top + D / 2, "left"); // fianchi della base
    head(right + offset, top + D / 2, "right");
  }
  return slots;
}
