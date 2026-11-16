"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { FestiveMenu, FestiveSection } from "@/lib/festive-types";
import { formatFestiveDayMonth, formatFestivePrice, formatFestiveWeekday } from "@/lib/festive-format";
import { festiveScript } from "./festive-font";

/* Palette della fascia: vino, oro, oliva. Coerente con il resto del sito (inchiostro, bronzo, petrolio, avorio). */
const GOLD = "#C9A46A";
const OLIVE = "#3F4A2E";
const OLIVE_LIGHT = "#56603C";
const PAPER = "#FBF6EA";

const PHOTO_INTERVAL_MS = 5000;
const DECK_MS = 500;
const SWIPE_PX = 40;
const CLICK_AFTER_SWIPE_MS = 400;

/** Stelline a 4 punte (path con curve, niente poligoni). */
function starPath(x: number, y: number, r: number): string {
  const k = r * 0.16;
  return `M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`;
}

/** Trama tenue di stelline e puntini dorati (opacity 0.12), ripetuta come background. */
const TEXTURE_TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110"><g fill="${GOLD}" fill-opacity="0.12"><path d="${starPath(18, 22, 4)}"/><path d="${starPath(74, 58, 5)}"/><path d="${starPath(40, 92, 3)}"/><circle cx="62" cy="14" r="1.2"/><circle cx="96" cy="30" r="1"/><circle cx="8" cy="66" r="1.1"/><circle cx="50" cy="48" r="0.9"/><circle cx="100" cy="98" r="1.2"/><circle cx="26" cy="104" r="0.9"/></g></svg>`;
const TEXTURE_URL = `url("data:image/svg+xml,${encodeURIComponent(TEXTURE_TILE)}")`;

/** Carta del menù: grana leggera sopra l'avorio. */
const PAPER_STYLE: CSSProperties = {
  backgroundColor: PAPER,
  backgroundImage:
    "radial-gradient(rgba(139,107,74,0.08) 0.6px, transparent 0.9px), linear-gradient(180deg, rgba(255,255,255,0.5), rgba(233,216,182,0.28))",
  backgroundSize: "4px 4px, 100% 100%",
};

/** Keyframes e transizioni locali (prefisso festive-). Tutto disattivato con prefers-reduced-motion. */
const FESTIVE_CSS = `
.festive-swing {
  animation: festive-swing 6s ease-in-out infinite;
}
@keyframes festive-swing {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
.festive-card-in {
  animation: festive-card-in 500ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@keyframes festive-card-in {
  from {
    opacity: 0;
    transform: translate3d(calc(var(--festive-dir, 1) * 22%), 4%, 0) rotate(calc(var(--festive-dir, 1) * 3deg));
  }
  to { opacity: 1; transform: none; }
}
.festive-card-out {
  animation: festive-card-out 500ms cubic-bezier(0.5, 0, 0.75, 0) both;
}
@keyframes festive-card-out {
  from { opacity: 1; transform: none; }
  to {
    opacity: 0;
    transform: translate3d(calc(var(--festive-dir, 1) * -70%), 0, 0) rotate(calc(var(--festive-dir, 1) * -9deg));
  }
}
@media (prefers-reduced-motion: reduce) {
  .festive-swing,
  .festive-card-in,
  .festive-card-out {
    animation: none;
  }
  .festive-card-out {
    display: none;
  }
}
`;

export interface FestiveMenusProps {
  section: FestiveSection;
}

/** Fascia "Buone Feste" tra Hero e "I nostri menù". Non compare se la sezione è spenta o senza menù. */
export function FestiveMenus({ section }: FestiveMenusProps) {
  if (!section.enabled || section.menus.length === 0) return null;

  return (
    <section
      id="buone-feste"
      aria-labelledby="festive-title"
      className="relative isolate overflow-hidden font-sans text-[#EDEEDD]"
      style={{ backgroundImage: "radial-gradient(ellipse at center, #6B1E25 0%, #3E1016 100%)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ backgroundImage: TEXTURE_URL, backgroundSize: "110px 110px" }}
      />

      {/* Cornice a doppia filettatura oro, in alto e in basso. */}
      <FrameRules position="top" />
      <FrameRules position="bottom" />

      <HangingBaubles side="left" />
      <HangingBaubles side="right" />

      <div className="relative mx-auto grid max-w-[1280px] gap-14 px-6 py-16 md:grid-cols-2 md:gap-x-10 md:px-8 lg:grid-cols-12 lg:gap-x-12 lg:py-20">
        <div className="md:col-span-2 lg:col-span-4">
          <FestiveGreeting />
        </div>
        <div className="flex justify-center md:col-span-1 lg:col-span-4">
          <FestiveDeck menus={section.menus} />
        </div>
        <div className="md:col-span-1 lg:col-span-4">
          <FestiveBoard photos={section.photos} />
        </div>
      </div>

      <SprigCorner side="left" />
      <SprigCorner side="right" />

      <style>{FESTIVE_CSS}</style>
    </section>
  );
}

/* ---------------------------------------------------------------- decorazioni */

function FrameRules({ position }: { position: "top" | "bottom" }) {
  const edge = position === "top" ? "top-0" : "bottom-0";
  const inner = position === "top" ? "top-[6px]" : "bottom-[6px]";
  return (
    <>
      <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 ${edge} h-px bg-[#C9A46A]/60`} />
      <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 ${inner} h-px bg-[#C9A46A]/60`} />
    </>
  );
}

const BAUBLES = [
  { x: 20, len: 30, r: 10, color: GOLD, mobile: true },
  { x: 58, len: 46, r: 8, color: OLIVE_LIGHT, mobile: false },
  { x: 96, len: 20, r: 6.5, color: OLIVE, mobile: false },
];

/** Palline natalizie appese dal bordo superiore, con fili di lunghezze diverse. Su mobile resta una sola pallina per lato. */
function HangingBaubles({ side }: { side: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 80"
      fill="none"
      className={`pointer-events-none absolute top-0 h-auto w-[92px] lg:w-[120px] md:w-[110px] ${
        side === "left" ? "left-0" : "right-0"
      }`}
      style={side === "right" ? { transform: "scaleX(-1)" } : undefined}
    >
      {BAUBLES.map((b, i) => (
        <g
          key={b.x}
          className={`festive-swing ${b.mobile ? "" : "hidden md:block"}`}
          style={{ transformOrigin: `${b.x}px 0px`, animationDelay: `${-i * 1.8}s` }}
        >
          <line x1={b.x} y1="0" x2={b.x} y2={b.len} stroke={GOLD} strokeWidth="0.8" strokeOpacity="0.85" />
          <rect x={b.x - 2.6} y={b.len - 3.2} width="5.2" height="4" rx="0.6" fill={GOLD} />
          <circle cx={b.x} cy={b.len + b.r} r={b.r} fill={b.color} />
          <circle cx={b.x} cy={b.len + b.r} r={b.r} stroke={GOLD} strokeOpacity="0.7" strokeWidth="0.6" />
          <ellipse
            cx={b.x - b.r * 0.4}
            cy={b.len + b.r * 0.6}
            rx={b.r * 0.18}
            ry={b.r * 0.42}
            fill={PAPER}
            fillOpacity="0.7"
          />
        </g>
      ))}
    </svg>
  );
}

/** Foglie della fronda: [x, y, rotazione in gradi, colore], lungo il ramo curvo. */
const SPRIG_LEAVES: [number, number, number, string][] = [
  [26, 169, -95, OLIVE],
  [26, 169, 5, OLIVE_LIGHT],
  [51, 141, -91, OLIVE_LIGHT],
  [51, 141, 8, OLIVE],
  [79, 112, -88, OLIVE],
  [79, 112, 10, OLIVE_LIGHT],
  [111, 79, -84, OLIVE_LIGHT],
  [111, 79, 14, OLIVE],
  [150, 40, -60, OLIVE],
];
const LEAF_PATH = "M0 0 C 8 -11, 22 -11, 30 0 C 22 11, 8 11, 0 0 Z";

/** Rametto di olivo con qualche bacca dorata, agli angoli inferiori. */
function SprigCorner({ side }: { side: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      fill="none"
      className={`pointer-events-none absolute bottom-0 -z-[5] h-auto w-[72px] opacity-45 md:w-[110px] lg:w-[130px] ${
        side === "left" ? "left-0" : "right-0"
      }`}
      style={side === "right" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M4 196 C 40 150, 80 110, 150 40" stroke={GOLD} strokeWidth="1.2" strokeLinecap="round" />
      {SPRIG_LEAVES.map(([x, y, rot, color], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
          <path d={LEAF_PATH} fill={color} stroke={GOLD} strokeWidth="0.7" />
        </g>
      ))}
      {[
        [118, 86],
        [132, 68],
        [140, 56],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" fill={GOLD} />
      ))}
    </svg>
  );
}

/** Fregio divisorio: filetto con rombo centrale. Colore dal contenitore (currentColor). */
function Fregio({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 14" fill="none" className={`h-auto ${className}`}>
      <path d="M0 7 H66 M94 7 H160" stroke="currentColor" strokeWidth="0.8" />
      <path d="M80 1.5 L85.5 7 L80 12.5 L74.5 7 Z" fill="currentColor" />
      <circle cx="68" cy="7" r="1.6" fill="currentColor" />
      <circle cx="92" cy="7" r="1.6" fill="currentColor" />
    </svg>
  );
}

const FLOURISH_PATH = "M7 0 C8 4.5, 11 6, 14 7 C11 8, 8 9.5, 7 14 C6 9.5, 3 8, 0 7 C3 6, 6 4.5, 7 0 Z";
const CORNERS = ["left-[10px] top-[10px]", "right-[10px] top-[10px]", "left-[10px] bottom-[10px]", "right-[10px] bottom-[10px]"];

/** Foglia di olivo con fiocco per l'illustrazione senza foto: cerchio di foglie, nastro in basso. */
const WREATH_LEAVES = Array.from({ length: 22 }, (_, i) => {
  const theta = (i / 22) * 2 * Math.PI;
  const x = 100 + 74 * Math.cos(theta);
  const y = 100 + 74 * Math.sin(theta);
  const deg = (theta * 180) / Math.PI + (i % 2 === 0 ? 118 : 62);
  const color = i % 3 === 0 ? GOLD : i % 2 === 0 ? OLIVE : OLIVE_LIGHT;
  return { key: i, x, y, deg, color };
});

function WreathIllustration() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" fill="none" className="absolute inset-0 size-full">
      <circle cx="100" cy="100" r="74" stroke={GOLD} strokeOpacity="0.45" strokeWidth="0.8" />
      {WREATH_LEAVES.map((leaf) => (
        <g key={leaf.key} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.deg})`}>
          <path d="M0 0 C 6 -7, 17 -7, 24 0 C 17 7, 6 7, 0 0 Z" fill={leaf.color} stroke={GOLD} strokeWidth="0.5" />
        </g>
      ))}
      <path d="M100 172 C 84 152, 62 156, 66 172 C 70 186, 90 180, 100 172 Z" fill={GOLD} />
      <path d="M100 172 C 116 152, 138 156, 134 172 C 130 186, 110 180, 100 172 Z" fill={GOLD} />
      <path d="M100 172 L 90 196 M100 172 L 110 196" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy="172" r="3" fill={OLIVE} />
    </svg>
  );
}

/* ---------------------------------------------------------------- testata */

function FestiveGreeting() {
  return (
    <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
      <p className="font-sans text-[0.6875rem] uppercase tracking-[0.24em] text-[#C9A46A]">
        Casale del Notaio · Stagione delle feste
      </p>
      <p className="mt-6 font-serif text-2xl italic text-[#EDEEDD]">Lo staff vi augura</p>
      <h2
        id="festive-title"
        className={`${festiveScript.className} mt-2 text-6xl leading-[1.1] text-[#E8CF97] md:text-7xl`}
      >
        Buone Feste
      </h2>
      <Fregio className="mt-6 w-44 text-[#C9A46A]" />
      <p className="mt-6 max-w-sm font-sans text-[0.9375rem] leading-[1.75] text-[#EDEEDD]/80">
        Tavole apparecchiate a festa, i sapori della tradizione e il calore del casale. Scoprite i menù pensati per i
        giorni più belli dell&apos;anno.
      </p>
      <a
        href="#footer"
        className="mt-8 inline-flex items-center justify-center rounded-[2px] border border-[#C9A46A]/70 px-8 py-3.5 font-sans text-[0.8125rem] font-medium tracking-widest text-[#E8CF97] uppercase no-underline transition-colors duration-250 hover:bg-[#C9A46A]/10 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#E8CF97]"
      >
        Prenota la tua tavola
      </a>
    </div>
  );
}

/* ---------------------------------------------------------------- mazzo di menù */

interface DeckState {
  current: number;
  /** Indice della card che sta uscendo (null quando l'animazione è finita). */
  prev: number | null;
  dir: 1 | -1;
  seq: number;
}

const INITIAL_DECK: DeckState = { current: 0, prev: null, dir: 1, seq: 0 };
const BACK_TRANSFORM: Record<1 | 2, string> = {
  1: "translate3d(10px, 12px, 0) rotate(3deg)",
  2: "translate3d(-8px, 24px, 0) rotate(-2deg)",
};

function FestiveDeck({ menus }: { menus: FestiveMenu[] }) {
  const count = menus.length;
  const [deck, setDeck] = useState<DeckState>(INITIAL_DECK);
  const swipeStartX = useRef<number | null>(null);
  const swipedAt = useRef(0);
  const { seq, dir } = deck;
  const current = deck.current % count;
  const leaving = deck.prev === null ? null : deck.prev % count;
  const menu = menus[current];
  const backs = ([1, 2] as const)
    .filter((offset) => offset < count)
    .map((offset) => ({ offset, menu: menus[(current + offset) % count] }));

  useEffect(() => {
    if (seq === 0) return;
    const id = window.setTimeout(() => {
      setDeck((d) => (d.seq === seq ? { ...d, prev: null } : d));
    }, DECK_MS);
    return () => window.clearTimeout(id);
  }, [seq]);

  function step(delta: 1 | -1) {
    if (count < 2) return;
    setDeck((d) => ({
      current: ((d.current % count) + delta + count) % count,
      prev: d.current % count,
      dir: delta,
      seq: d.seq + 1,
    }));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-7">
      <div
        className={`relative w-full max-w-[340px] touch-pan-y select-none ${backs.length > 0 ? "pb-7" : ""}`}
        onPointerDown={(e) => {
          swipeStartX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const start = swipeStartX.current;
          swipeStartX.current = null;
          if (start === null) return;
          const dx = e.clientX - start;
          if (Math.abs(dx) < SWIPE_PX) return;
          swipedAt.current = Date.now();
          step(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          swipeStartX.current = null;
        }}
      >
        <div aria-live="polite" className="relative h-[540px] w-full sm:h-[560px]">
          {/* Pila: le card successive, solo cornice ed etichetta. Clic = menù successivo. */}
          {backs.length > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={() => {
                if (Date.now() - swipedAt.current > CLICK_AFTER_SWIPE_MS) step(1);
              }}
            >
              {backs.map(({ offset, menu: back }) => (
                <MenuBack key={`${offset}-${back.id}`} menu={back} offset={offset} />
              ))}
            </div>
          )}

          {leaving !== null && (
            <div
              key={`out-${seq}`}
              aria-hidden="true"
              className="festive-card-out pointer-events-none absolute inset-0 z-40"
              style={{ "--festive-dir": dir } as CSSProperties}
            >
              <MenuFace menu={menus[leaving]} />
            </div>
          )}

          <div
            key={`in-${seq}`}
            className={`absolute inset-0 z-30 ${seq > 0 ? "festive-card-in" : ""}`}
            style={{ "--festive-dir": dir } as CSSProperties}
          >
            <MenuFace menu={menu} focusable />
          </div>
        </div>
      </div>

      {count > 1 && (
        <div
          role="group"
          aria-label="Sfoglia i menù festivi"
          onKeyDown={handleKeyDown}
          className="flex items-center gap-5"
        >
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Menù festivo precedente"
            className={NAV_BUTTON}
          >
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.25} />
          </button>
          <p className="min-w-[4.5rem] text-center font-serif text-lg tabular-nums text-[#EDEEDD]">
            {`${current + 1} / ${count}`}
          </p>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Menù festivo successivo"
            className={NAV_BUTTON}
          >
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.25} />
          </button>
        </div>
      )}
    </div>
  );
}

const NAV_BUTTON =
  "flex size-11 items-center justify-center rounded-full border border-[#C9A46A]/70 text-[#E8CF97] transition-colors duration-200 hover:bg-[#C9A46A]/15 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#E8CF97]";

/** Card del menù: carta avorio con doppia cornice oro e contenuto centrato. */
function MenuFace({ menu, focusable = false }: { menu: FestiveMenu; focusable?: boolean }) {
  const weekday = formatFestiveWeekday(menu.date);
  return (
    <article
      className="relative flex h-full flex-col overflow-hidden border border-[#C9A46A] text-center text-[#1C2B2D] shadow-[0_30px_60px_-24px_rgba(0,0,0,0.65)]"
      style={PAPER_STYLE}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-[#C9A46A]/70" />
      {CORNERS.map((pos) => (
        <svg
          key={pos}
          aria-hidden="true"
          viewBox="0 0 14 14"
          className={`pointer-events-none absolute size-3.5 text-[#C9A46A] ${pos}`}
        >
          <path d={FLOURISH_PATH} fill="currentColor" />
        </svg>
      ))}

      <div className="relative flex min-h-0 flex-1 flex-col px-7 pt-9 pb-6 sm:px-9">
        <div className="shrink-0">
          {(menu.label || weekday) && (
            <p className="font-sans text-[0.6875rem] uppercase tracking-[0.24em] text-[#8B6B4A]">
              {[menu.label, weekday].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="mt-2 font-serif text-[2.125rem] italic leading-none text-[#6B1E25]">
            {formatFestiveDayMonth(menu.date)}
          </p>
          <Fregio className="mx-auto mt-3 w-32 text-[#C9A46A]" />
          <h3 className="mt-2 font-serif text-xl leading-tight text-[#1C2B2D]">{menu.name}</h3>
        </div>

        <div
          role={focusable ? "region" : undefined}
          aria-label={focusable ? `Portate di ${menu.name}` : undefined}
          tabIndex={focusable ? 0 : undefined}
          className="mt-5 min-h-0 w-full flex-1 overflow-y-auto pr-1 [scrollbar-color:rgba(201,164,106,0.5)_transparent] [scrollbar-width:thin] focus-visible:outline-1 focus-visible:outline-[#C9A46A]"
        >
          {menu.courses.map((course, i) => (
            <div key={`${i}-${course.label}`} className="mb-4 last:mb-0">
              <p className="font-sans text-[0.625rem] uppercase tracking-[0.2em] text-[#8B6B4A]">{course.label}</p>
              <ul className="mt-1.5 space-y-2">
                {course.items.map((item, j) => (
                  <li key={`${j}-${item.name}`}>
                    <p className="font-serif text-[15px] leading-snug text-[#1C2B2D]">{item.name}</p>
                    {item.description && (
                      <p className="font-sans text-xs leading-relaxed text-[#5A6668]">{item.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {menu.price !== null && (
          <p className="mt-4 flex shrink-0 items-baseline justify-center gap-2 border-t border-[#C9A46A]/50 pt-4">
            <span className="font-serif text-2xl text-[#355A63]">{formatFestivePrice(menu.price)}</span>
            <span className="font-sans text-xs text-[#8B6B4A]">a persona</span>
          </p>
        )}
      </div>
    </article>
  );
}

/** Card sotto il mazzo: solo cornice ed etichetta. */
function MenuBack({ menu, offset }: { menu: FestiveMenu; offset: 1 | 2 }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden border border-[#C9A46A] shadow-[0_18px_30px_-16px_rgba(0,0,0,0.6)]"
      style={{ ...PAPER_STYLE, transform: BACK_TRANSFORM[offset], zIndex: 3 - offset }}
    >
      <span aria-hidden="true" className="absolute inset-[6px] border border-[#C9A46A]/70" />
      <p className="absolute inset-0 flex items-center justify-center font-sans text-[0.6875rem] uppercase tracking-[0.24em] text-[#8B6B4A]">
        {menu.label || formatFestiveDayMonth(menu.date)}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- foto delle feste */

interface FestiveBoardProps {
  photos: string[];
}

/** Riquadro "quadro" con le foto delle feste in dissolvenza automatica; senza foto, un'illustrazione. */
function FestiveBoard({ photos }: FestiveBoardProps) {
  const count = photos.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const activeIndex = count > 0 ? index % count : 0;

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((prev) => (prev + 1) % count), PHOTO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, paused]);

  return (
    <div
      role="group"
      aria-label="Momenti di festa"
      className="mx-auto w-full max-w-[340px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Passe-partout avorio con cornice oro sottile e ombra. */}
      <div className="border border-[#C9A46A] bg-[#FBF6EA] p-[10px] shadow-[0_28px_50px_-22px_rgba(0,0,0,0.7)]">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#F3EAD6]">
          {count === 0 ? (
            <>
              <WreathIllustration />
              <p className="absolute inset-0 flex items-center justify-center px-10 text-center font-serif text-2xl italic leading-tight text-[#6B1E25]">
                Vi aspettiamo a tavola
              </p>
            </>
          ) : (
            photos.map((url, i) => {
              const active = i === activeIndex;
              return (
                <div
                  key={`${i}-${url}`}
                  aria-hidden={active ? undefined : true}
                  className={`absolute inset-0 transition-opacity duration-1000 ease-out motion-reduce:transition-none ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {/* Lieve zoom (Ken Burns) sul dissolvere: 5s quando la foto è attiva, ritorno rapido quando esce. */}
                  <div
                    className={`size-full ease-out transition-[scale] motion-reduce:scale-100 motion-reduce:transition-none ${
                      active ? "scale-[1.06] duration-[5000ms]" : "scale-100 duration-1000"
                    }`}
                  >
                    <img
                      src={url}
                      alt="Foto delle feste al Casale del Notaio"
                      loading={i === 0 ? "eager" : "lazy"}
                      decoding="async"
                      className="size-full object-cover"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-5 flex justify-center gap-1">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Foto ${i + 1} di ${count}`}
              aria-current={i === activeIndex ? true : undefined}
              className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8CF97]"
            >
              <span
                className={`block size-1.5 rounded-full transition-colors duration-300 ${
                  i === activeIndex ? "bg-[#E8CF97]" : "bg-[#E8CF97]/35"
                }`}
              />
            </button>
          ))}
        </div>
      )}

      <p
        className={`${festiveScript.className} mt-3 text-center text-3xl leading-none text-[#C9A46A]`}
      >
        momenti di festa
      </p>
    </div>
  );
}
