// Colori dei menù (puro: usabile anche nei Client Component). Nessun prezzo esce da qui: il colore è
// derivato dal prezzo dal server (vedi getMenuColors in lib/data/catalog.ts).

export interface MenuColor {
  /** Tinta chiara su carta: sfondo del badge (~24% del colore pieno). */
  bg: string;
  /** Testo nel colore scurito, contrasto AA (4,5:1) su `bg`. */
  fg: string;
  /** Bordo sottile della tinta. */
  border: string;
  /** Colore pieno della scala: filetto laterale del badge, pallini. */
  accent: string;
  /** Colore pieno per blocchi opachi (sala, cucina). */
  solid: string;
  /** Testo leggibile sul colore pieno `solid`. */
  onSolid: string;
}

/** Scala per prezzo crescente: senape (menù meno costoso) → ambra → arancio → vermiglio → rosso (più costoso). */
export const MENU_COLOR_STOPS = ["#D9AE2F", "#E0901F", "#DB6A26", "#C2402A", "#9B1D20"] as const;

/** Tappe usate per N menù adulti (indici in MENU_COLOR_STOPS). */
const PURE_STOP_INDEXES: Record<number, number[]> = {
  1: [0],
  2: [0, 4],
  3: [0, 2, 4],
  4: [0, 1, 2, 4],
  5: [0, 1, 2, 3, 4],
};

/** Carta del gestionale (--color-paper dell'area admin). */
const PAPER = "#F7F7F4";
const INK = "#1C2B2D";
const WHITE = "#FFFFFF";
const AA_NORMAL_TEXT = 4.5;
// Tinta abbastanza piena da distinguere i menù vicini nella scala (con 0.14 arancio e rosso sembravano entrambi rosa).
const TINT_AMOUNT = 0.24;
const BORDER_AMOUNT = 0.38;

/** Colore dei menù bambini: bronzo del brand, neutro rispetto alla scala dei menù adulti. */
const KIDS_ACCENT = "#8B6B4A";
/** Colore dei menù sconosciuti (es. menù eliminato ancora citato da una prenotazione). */
const FALLBACK_ACCENT = "#9C988B";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex(rgb.map((c, i) => c + (target[i] - c) * amount) as [number, number, number]);
}

/** Luminanza relativa WCAG. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapporto di contrasto WCAG tra due colori. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Testo leggibile su un colore pieno (contrasto AA): scuro o chiaro, quello con più contrasto.
 * Se nessuno dei due raggiunge 4,5:1, lo sfondo si scurisce gradualmente (il bianco supera sempre la soglia).
 */
function readableBackground(bg: string): { bg: string; fg: string } {
  let current = bg;
  for (let i = 0; i < 40; i++) {
    const ink = contrastRatio(current, INK);
    const white = contrastRatio(current, WHITE);
    if (Math.max(ink, white) >= AA_NORMAL_TEXT) return { bg: current, fg: ink >= white ? INK : WHITE };
    current = mix(current, [0, 0, 0], 0.06);
  }
  return { bg: current, fg: WHITE };
}

/** Versione scurita del colore, la prima che raggiunge il contrasto AA sulla tinta di sfondo. */
function darkenForText(color: string, background: string): string {
  let current = color;
  for (let i = 0; i < 40; i++) {
    if (contrastRatio(current, background) >= AA_NORMAL_TEXT) return current;
    current = mix(current, [0, 0, 0], 0.05);
  }
  return current;
}

/** Colore nella scala al punto t (0 = senape, 1 = rosso), interpolato linearmente tra le tappe. */
function colorAt(t: number): string {
  const segments = MENU_COLOR_STOPS.length - 1;
  const pos = Math.min(Math.max(t, 0), 1) * segments;
  const i = Math.min(Math.floor(pos), segments - 1);
  const frac = pos - i;
  const from = hexToRgb(MENU_COLOR_STOPS[i]);
  const to = hexToRgb(MENU_COLOR_STOPS[i + 1]);
  return rgbToHex(from.map((c, k) => c + (to[k] - c) * frac) as [number, number, number]);
}

/** Da un colore pieno a una tavolozza completa: tinta leggera, testo scurito, bordo, colore pieno per i blocchi. */
function toMenuColor(accent: string): MenuColor {
  const accentRgb = hexToRgb(accent);
  const bg = mix(PAPER, accentRgb, TINT_AMOUNT);
  const solid = readableBackground(accent);
  return {
    bg,
    fg: darkenForText(accent, bg),
    border: mix(PAPER, accentRgb, BORDER_AMOUNT),
    accent,
    solid: solid.bg,
    onSolid: solid.fg,
  };
}

/** Menù bambini: colore neutro fisso. */
export const KIDS_MENU_COLOR: MenuColor = toMenuColor(KIDS_ACCENT);

/** Menù sconosciuto (es. menù eliminato ancora citato da una prenotazione). */
export const FALLBACK_MENU_COLOR: MenuColor = toMenuColor(FALLBACK_ACCENT);

/**
 * Nome da mostrare per un menù bambini. Se il nome è quello generico ("Menù bambini") mostra solo
 * "Menù bambini" una volta; se il menù ha un nome proprio, mostra solo quello.
 */
export function kidsMenuLabel(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed || /^men[uù]\s+bambini$/i.test(trimmed)) return "Menù bambini";
  return trimmed;
}

/**
 * Colori dei menù. Adulti: ordinati per prezzo crescente (a parità per nome) e distribuiti su N tappe
 * equidistanti lungo la scala (1 menù = senape). Bambini: colore fisso. Il prezzo non esce da questa funzione.
 */
export function buildMenuColors(
  menus: { id: string; price_per_person: number; is_kids: boolean; name?: string }[],
): Record<string, MenuColor> {
  const out: Record<string, MenuColor> = {};
  const adults = menus
    .filter((m) => !m.is_kids)
    .sort(
      (a, b) =>
        a.price_per_person - b.price_per_person ||
        (a.name ?? a.id).localeCompare(b.name ?? b.id, "it") ||
        a.id.localeCompare(b.id),
    );
  // Fino a 5 menù si usano le tappe pure della scala (sempre senape il primo e rosso l'ultimo),
  // così menù vicini di prezzo non finiscono su tonalità intermedie quasi uguali. Oltre, si interpola.
  const pureStops = PURE_STOP_INDEXES[adults.length];
  adults.forEach((m, index) => {
    if (pureStops) {
      out[m.id] = toMenuColor(MENU_COLOR_STOPS[pureStops[index]]);
      return;
    }
    const t = adults.length > 1 ? index / (adults.length - 1) : 0;
    out[m.id] = toMenuColor(colorAt(t));
  });
  for (const m of menus) if (m.is_kids) out[m.id] = KIDS_MENU_COLOR;
  return out;
}

/** Colore di un menù per id (fallback se sconosciuto). */
export function menuColorFor(colors: Record<string, MenuColor>, menuId: string | null | undefined): MenuColor {
  return (menuId && colors[menuId]) || FALLBACK_MENU_COLOR;
}
