"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { FestiveMenu, FestiveSection } from "@/lib/festive-types";
import { formatFestiveDayMonth, formatFestivePrice } from "@/lib/festive-format";
import { festiveFont } from "./festive-font";

const PHOTO_INTERVAL_MS = 4000;

const ARROW_BUTTON =
  "flex size-12 shrink-0 items-center justify-center bg-[#1C2B2D] text-[#FFFDF8] transition-colors duration-200 hover:bg-[#2C4043] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7E7C4]";

/** Animazione d'ingresso della card in primo piano (rispetta prefers-reduced-motion). */
const FESTIVE_CSS = `
.festive-card-enter {
  animation: festive-card-enter 520ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
@keyframes festive-card-enter {
  from { opacity: 0; transform: translate3d(24px, 0, 0) rotate(1.5deg); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .festive-card-enter { animation: none; }
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
      className={`${festiveFont.className} relative overflow-hidden border-y border-[#9E2F2A] bg-[#B34D48] py-12 text-[#FFFDF8]`}
    >
      <FestiveGarland />

      <div className="relative mx-auto grid max-w-[1280px] gap-10 px-8 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-12">
        <FestiveGreeting />
        <FestiveDeck menus={section.menus} />
        <FestiveBoard photos={section.photos} />
      </div>

      <style>{FESTIVE_CSS}</style>
    </section>
  );
}

/** Festone decorativo in alto a destra: solo estetico, nascosto ai lettori di schermo. */
function FestiveGarland() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 120"
      fill="none"
      className="pointer-events-none absolute -top-2 right-0 hidden w-[260px] opacity-80 sm:block md:w-[320px]"
    >
      <path
        d="M0 8 C60 70 140 80 200 40 S300 4 330 30"
        stroke="#D9B36C"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {[
        [48, 45],
        [100, 62],
        [152, 61],
        [250, 28],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#D9B36C" />
      ))}
    </svg>
  );
}

/** Scritta "Lo Staff / Vi Augura / Buone Feste!" a mano. */
function FestiveGreeting() {
  return (
    <h2 id="festive-title" className="text-center md:text-left">
      <span className="block -rotate-2 leading-none">
        <span className="block text-4xl font-semibold md:text-5xl">Lo Staff</span>
        <span className="mt-1 block text-xl font-semibold uppercase tracking-[0.12em] text-[#E9D3A8] md:text-2xl">
          Vi Augura
        </span>
        <span className="mt-1 block text-6xl font-semibold md:text-7xl">
          <span className="underline decoration-[#E9D3A8] decoration-[3px] underline-offset-[10px]">B</span>uone
        </span>
        <span className="-mt-2 block text-6xl font-semibold md:text-7xl">Feste!</span>
      </span>
    </h2>
  );
}

interface FestiveDeckProps {
  menus: FestiveMenu[];
}

/** Mazzo di card: quella attiva in primo piano, la successiva dietro (solo il prezzo). */
function FestiveDeck({ menus }: FestiveDeckProps) {
  const [index, setIndex] = useState(0);
  const count = menus.length;
  const activeIndex = index % count;
  const menu = menus[activeIndex];
  const nextMenu = count > 1 ? menus[(activeIndex + 1) % count] : null;

  function step(delta: 1 | -1) {
    setIndex((prev) => (((prev % count) + delta + count) % count));
  }

  return (
    // Mobile: mazzo a tutta larghezza con le frecce sotto. Da md: freccia a destra del mazzo.
    <div className="flex w-full flex-col items-center gap-5 md:flex-row md:gap-6">
      {/* pb in percentuale: lascia spazio alla card dietro, che scende sotto quella attiva. */}
      <div className="relative w-full min-w-0 max-w-[300px] pb-[19%]">
        {nextMenu && <BackCard menu={nextMenu} />}

        {/* Regione live: l'annuncio riguarda solo la card attiva, non la preview dietro. */}
        <div aria-live="polite" aria-atomic="true" className="relative z-10 aspect-square w-full">
          <FrontCard key={menu.id} menu={menu} />
        </div>
      </div>

      {count > 1 && (
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Menù festivo precedente"
            className={`${ARROW_BUTTON} md:hidden`}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Menù festivo successivo" className={ARROW_BUTTON}>
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

const CARD_SURFACE =
  "rounded-[2px] border-4 border-[#E3D2B4] bg-[#FFFDF8] shadow-[0_12px_28px_-14px_rgba(28,43,45,0.55)]";

function FrontCard({ menu }: { menu: FestiveMenu }) {
  return (
    <article className={`festive-card-enter flex h-full flex-col gap-2 p-5 text-[#1C2B2D] ${CARD_SURFACE}`}>
      <p className="self-start border-2 border-[#B3302B] px-3 py-0.5 text-xl font-semibold uppercase leading-tight text-[#B3302B]">
        {menu.title}
      </p>
      <p className="mt-1 text-[2.75rem] font-semibold leading-none">{formatFestiveDayMonth(menu.date)}</p>

      {menu.courses.length > 0 && (
        <ul className="min-h-0 flex-1 overflow-hidden text-xl uppercase leading-snug text-[#C9A46A]">
          {menu.courses.map((course, i) => (
            <li key={`${i}-${course}`}>{course}</li>
          ))}
        </ul>
      )}

      {menu.notes && <p className="text-lg leading-snug text-[#6B5B45]">{menu.notes}</p>}

      {menu.price !== null && (
        <p className="mt-auto self-end text-4xl font-semibold leading-none text-[#C9A46A]">
          {formatFestivePrice(menu.price)}
        </p>
      )}
    </article>
  );
}

/** Card successiva: spostata a destra e in basso, scalata; mostra solo il prezzo. */
function BackCard({ menu }: { menu: FestiveMenu }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute left-0 top-0 flex aspect-square w-full translate-x-[8%] translate-y-[21%] scale-[0.94] flex-col items-end justify-end p-5 ${CARD_SURFACE}`}
    >
      {menu.price !== null && (
        <p className="text-4xl font-semibold leading-none text-[#C9A46A]">{formatFestivePrice(menu.price)}</p>
      )}
    </div>
  );
}

interface FestiveBoardProps {
  photos: string[];
}

/** "Lavagna" con le foto delle feste in dissolvenza automatica. */
function FestiveBoard({ photos }: FestiveBoardProps) {
  const count = photos.length;
  const [index, setIndex] = useState(0);
  const activeIndex = count > 0 ? index % count : 0;

  useEffect(() => {
    if (count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((prev) => (prev + 1) % count), PHOTO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count]);

  return (
    <div className="relative mx-auto aspect-[16/10] w-full max-w-[420px] overflow-hidden border-[3px] border-[#E3D2B4] bg-[#1F2A2A] md:justify-self-end">
      {count === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center text-4xl font-semibold text-[#F7E7C4]">
          Foto delle Feste
        </p>
      ) : (
        photos.map((url, i) => {
          const active = i === activeIndex;
          return (
            <img
              key={url}
              src={url}
              alt="Foto delle feste"
              aria-hidden={active ? undefined : true}
              loading={i === 0 ? "eager" : "lazy"}
              className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
          );
        })
      )}

      {count > 1 && (
        <div aria-hidden="true" className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {photos.map((_, i) => (
            <span
              key={i}
              className={`size-1.5 rounded-full transition-colors duration-300 ${
                i === activeIndex ? "bg-[#FFFDF8]" : "bg-[#FFFDF8]/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
