"use client";

import { LayoutGrid } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { BookingCard } from "@/components/bookings/BookingCard";
import { totalCovers } from "@/components/bookings/format";
import { cn } from "@/components/ui";
import type { BookingListItem, Room } from "@/lib/types";
import { SALA_PARAM, SALA_WITHOUT } from "./agenda-utils";
import { ReservationList } from "./ReservationList";
import { ReservationSheetButton } from "./ReservationSheetButton";

export interface RoomDayBoardProps {
  /** Eventi, prenotazioni e appuntamenti del giorno, già filtrati per tipo (gli annullati si escludono qui). */
  items: BookingListItem[];
  /** Tutte le sale (anche inattive): le inattive compaiono solo se hanno prenotazioni nel giorno. */
  rooms: Room[];
  /** Giorno selezionato (YYYY-MM-DD): serve al foglio prenotazioni. */
  selected: string;
  /** `canAssignRoom(profile, "normale")`: senza, sala e tavolo sono in sola lettura. */
  canAssignRooms: boolean;
  /** Permesso di eliminare le prenotazioni normali (solo admin). */
  canDeleteBookings: boolean;
}

/** Riga di occupazione: un pasto, oppure il totale della sala quando non ci sono entrambi i pasti. */
interface MealLoad {
  key: "pranzo" | "cena" | "da-definire" | "totale";
  /** Etichetta della riga ("Pranzo", "Cena"...). Null per il totale unico. */
  label: string | null;
  covers: number;
}

/** Una sala (o "Senza sala") con le sue prenotazioni del giorno. */
interface RoomGroup {
  key: string;
  name: string;
  /** Capienza della sala. Null per "Senza sala" (niente capienza). */
  capacity: number | null;
  /** Tutto ciò che sta nella sala, nell'ordine ricevuto dal server. */
  items: BookingListItem[];
  events: BookingListItem[];
  reservations: BookingListItem[];
  loads: MealLoad[];
}

type FillTone = "petrol" | "warning" | "danger";

/** Da questa quota di capienza la barra diventa di avviso. Oltre il 100% è di pericolo. */
const WARNING_FROM = 0.8;

const BAR_TONE: Record<FillTone, string> = {
  petrol: "bg-petrol",
  warning: "bg-warning",
  danger: "bg-danger",
};

const CHIP_BASE =
  "inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors duration-150";

/** Coperti di un insieme di prenotazioni: pranzo e cena separati; senza pasto indicato, insieme a quello presente. */
function mealLoads(bookings: BookingListItem[]): MealLoad[] {
  const counted = bookings.filter((b) => b.kind !== "appuntamento");
  const sumOf = (list: BookingListItem[]) => list.reduce((sum, b) => sum + totalCovers(b), 0);
  const lunch = counted.filter((b) => b.meal === "pranzo");
  const dinner = counted.filter((b) => b.meal === "cena");
  const unset = counted.filter((b) => b.meal === null);
  if (lunch.length > 0 && dinner.length > 0) {
    const loads: MealLoad[] = [
      { key: "pranzo", label: "Pranzo", covers: sumOf(lunch) },
      { key: "cena", label: "Cena", covers: sumOf(dinner) },
    ];
    // Pasto non indicato in una giornata con pranzo e cena: non si può attribuire a nessuno dei due, quindi riga a parte.
    if (unset.length > 0) loads.push({ key: "da-definire", label: "Da definire", covers: sumOf(unset) });
    return loads;
  }
  return [{ key: "totale", label: null, covers: sumOf(counted) }];
}

function roomGroup(key: string, name: string, capacity: number | null, items: BookingListItem[]): RoomGroup {
  return {
    key,
    name,
    capacity,
    items,
    events: items.filter((b) => b.kind === "evento"),
    reservations: items.filter((b) => b.kind === "normale"),
    loads: mealLoads(items),
  };
}

/**
 * Raggruppa le prenotazioni per sala. Ordine: sale per `sort` (poi nome), con le attive o quelle che hanno
 * prenotazioni; in fondo "Senza sala" solo se ci sono prenotazioni senza sala.
 */
function buildRoomGroups(items: BookingListItem[], rooms: Room[]): RoomGroup[] {
  const byRoom = new Map<string, BookingListItem[]>();
  const withoutRoom: BookingListItem[] = [];
  for (const booking of items) {
    if (booking.status === "annullato") continue;
    if (!booking.room_id) {
      withoutRoom.push(booking);
      continue;
    }
    const bucket = byRoom.get(booking.room_id);
    if (bucket) bucket.push(booking);
    else byRoom.set(booking.room_id, [booking]);
  }

  const knownIds = new Set(rooms.map((room) => room.id));
  const groups = rooms
    .filter((room) => room.active || byRoom.has(room.id))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "it"))
    .map((room) => roomGroup(room.id, room.name, room.capacity, byRoom.get(room.id) ?? []));

  // Sala citata da una prenotazione ma assente dall'elenco (es. eliminata): mostrata con i dati della prenotazione.
  for (const [id, list] of byRoom) {
    if (knownIds.has(id)) continue;
    groups.push(roomGroup(id, list[0].room?.name ?? "Sala", list[0].room?.capacity ?? null, list));
  }

  if (withoutRoom.length > 0) groups.push(roomGroup(SALA_WITHOUT, "Senza sala", null, withoutRoom));
  return groups;
}

/** Capienza utile: assente o zero = niente denominatore (si mostrano solo i coperti). */
function capacityOf(group: RoomGroup): number | null {
  return group.capacity !== null && group.capacity > 0 ? group.capacity : null;
}

function fullestLoad(group: RoomGroup): MealLoad {
  return group.loads.reduce((best, load) => (load.covers > best.covers ? load : best), group.loads[0]);
}

function toneOf(covers: number, capacity: number): FillTone {
  const ratio = covers / capacity;
  if (ratio > 1) return "danger";
  if (ratio >= WARNING_FROM) return "warning";
  return "petrol";
}

function isOver(load: MealLoad, group: RoomGroup): boolean {
  const capacity = capacityOf(group);
  return capacity !== null && load.covers > capacity;
}

/** Testo di una riga di occupazione: "Pranzo 20/34", "20/34 pax" (totale), "8 pax" (senza capienza). */
function loadText(load: MealLoad, group: RoomGroup): string {
  const capacity = capacityOf(group);
  if (capacity === null) return `${load.covers} pax`;
  if (load.label) return `${load.label} ${load.covers}/${capacity}`;
  return `${load.covers}/${capacity} pax`;
}

/** Testo piccolo della pillola: il pasto più pieno, senza etichetta. */
function chipText(group: RoomGroup): string {
  const capacity = capacityOf(group);
  const load = fullestLoad(group);
  return capacity === null ? `${load.covers} pax` : `${load.covers}/${capacity}`;
}

function isEmpty(group: RoomGroup): boolean {
  return group.events.length + group.reservations.length === 0;
}

/** "1 evento · 3 prenotazioni", oppure "Libera". */
function countLabel(group: RoomGroup): string {
  const parts: string[] = [];
  const events = group.events.length;
  const reservations = group.reservations.length;
  if (events > 0) parts.push(`${events} ${events === 1 ? "evento" : "eventi"}`);
  if (reservations > 0) parts.push(`${reservations} ${reservations === 1 ? "prenotazione" : "prenotazioni"}`);
  return parts.length > 0 ? parts.join(" · ") : "Libera";
}

/**
 * Vista giorno per le sale (ruolo sala). Nessuna sala aperta: griglia di bottoni con l'occupazione.
 * Sala aperta (query `sala`): pillole per scorrere le altre sale, poi eventi e prenotazioni della sala.
 */
export function RoomDayBoard({ items, rooms, selected, canAssignRooms, canDeleteBookings }: RoomDayBoardProps) {
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => buildRoomGroups(items, rooms), [items, rooms]);
  const openKey = searchParams.get(SALA_PARAM);
  const open = groups.find((group) => group.key === openKey) ?? null;

  const openRoom = (key: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key) params.set(SALA_PARAM, key);
    else params.delete(SALA_PARAM);
    const query = params.toString();
    // replaceState con stato null: Next copia il proprio stato e sincronizza useSearchParams, senza richiedere la pagina al server.
    // (Con window.history.state, che contiene __NA, Next salta la sincronizzazione e la sala non si apriva.)
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    rootRef.current?.scrollIntoView({ block: "start" });
  };

  if (groups.length === 0) {
    return <p className="text-[14px] text-slate">Nessuna prenotazione attiva in questo giorno.</p>;
  }

  // Il foglio prenotazioni copre tutta la giornata (tutte le sale): sta qui, sopra la griglia o le pillole, non dentro una sala.
  const showSheetButton = canAssignRooms && groups.some((group) => group.reservations.length > 0);

  return (
    <div ref={rootRef} className="flex min-w-0 scroll-mt-40 flex-col gap-5">
      {showSheetButton && (
        <div className="flex justify-end">
          <ReservationSheetButton date={selected} />
        </div>
      )}
      {open ? (
        <>
          <RoomChips groups={groups} activeKey={open.key} onShowAll={() => openRoom(null)} onSelect={openRoom} />
          <RoomDetail group={open} rooms={rooms} date={selected} canAssignRooms={canAssignRooms} canDeleteBookings={canDeleteBookings} />
        </>
      ) : (
        <RoomGrid groups={groups} onOpen={openRoom} />
      )}
    </div>
  );
}

/** Griglia di bottoni quadrati, una per sala: 2 colonne su telefono, 3 su tablet, 4 su desktop (come la giacenza). */
function RoomGrid({ groups, onOpen }: { groups: RoomGroup[]; onOpen: (key: string) => void }) {
  return (
    <ul role="list" aria-label="Sale" className="grid grid-cols-2 gap-3 sm:grid-cols-3 desk:grid-cols-4">
      {groups.map((group) => (
        <RoomTile key={group.key} group={group} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function RoomTile({ group, onOpen }: { group: RoomGroup; onOpen: (key: string) => void }) {
  const capacity = capacityOf(group);
  const empty = isEmpty(group);
  const fullest = fullestLoad(group);
  const tone = capacity !== null ? toneOf(fullest.covers, capacity) : "petrol";
  const percent = capacity !== null ? Math.min(100, Math.round((fullest.covers / capacity) * 100)) : 0;
  const rowsText = group.loads.map((load) => loadText(load, group)).join(", ");

  return (
    <li className="min-w-0">
      <button
        type="button"
        data-room-key={group.key}
        onClick={() => onOpen(group.key)}
        aria-label={`${group.name}: ${rowsText}, ${countLabel(group)}`}
        className={cn(
          "relative flex aspect-square w-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border py-4 pl-5 pr-4 text-left shadow-[0_1px_2px_rgb(28_43_45/0.06)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:shadow-[0_2px_6px_rgb(28_43_45/0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol active:scale-[0.98]",
          empty ? "border-sand bg-cream/50 hover:bg-cream" : "border-sand bg-paper hover:bg-cream",
        )}
      >
        <span className="line-clamp-2 wrap-anywhere font-serif text-xl leading-tight text-ink sm:text-2xl">{group.name}</span>
        <span className="flex flex-col gap-2">
          <span className="flex flex-col text-[14px] tabular-nums">
            {group.loads.map((load) => (
              <span key={load.key} className={cn(isOver(load, group) ? "font-medium text-danger" : "text-ink")}>
                {loadText(load, group)}
              </span>
            ))}
          </span>
          {capacity !== null && (
            <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-full bg-sand">
              <span className={cn("block h-full rounded-full transition-[width] duration-300", BAR_TONE[tone])} style={{ width: `${percent}%` }} />
            </span>
          )}
          <span className="text-[13px] text-slate-dark">{countLabel(group)}</span>
        </span>
      </button>
    </li>
  );
}

/** Pillole orizzontali per cambiare sala con la sala aperta. Stessa barra della giacenza: la pillola attiva scorre al centro. */
function RoomChips({
  groups,
  activeKey,
  onShowAll,
  onSelect,
}: {
  groups: RoomGroup[];
  activeKey: string;
  onShowAll: () => void;
  onSelect: (key: string) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector<HTMLButtonElement>(`[data-chip-key="${CSS.escape(activeKey)}"]`);
    if (!bar || !chip) return;
    // offsetLeft è relativo alla barra (position: relative): basta impostare lo scroll orizzontale della barra.
    const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeKey]);

  return (
    <nav aria-label="Altre sale" className="-m-1 min-w-0">
      {/* Padding e margine negativo: il contorno del focus non viene tagliato dallo scroll. Scrollbar nascosta, si scorre col dito. */}
      <div
        ref={barRef}
        className="relative flex snap-x snap-proximity gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          onClick={onShowAll}
          className="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border border-sand bg-paper px-4 text-[15px] font-medium whitespace-nowrap text-ink transition-colors duration-150 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
        >
          <LayoutGrid aria-hidden="true" className="size-4 shrink-0 text-petrol" />
          Tutte le sale
        </button>

        {groups.map((group) => {
          const active = group.key === activeKey;
          return (
            <button
              key={group.key}
              type="button"
              data-chip-key={group.key}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(group.key)}
              className={cn(
                CHIP_BASE,
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol",
                active ? "border-petrol bg-petrol text-white" : "border-sand bg-paper text-ink hover:bg-cream",
              )}
            >
              {group.name}
              <span className={cn("text-[13px] tabular-nums", active ? "text-white/85" : "text-slate-dark")}>{chipText(group)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Sala aperta: titolo e occupazione, poi eventi e prenotazioni della sala. */
function RoomDetail({
  group,
  rooms,
  date,
  canAssignRooms,
  canDeleteBookings,
}: {
  group: RoomGroup;
  rooms: Room[];
  date: string;
  canAssignRooms: boolean;
  canDeleteBookings: boolean;
}) {
  const cards = group.items.filter((b) => b.kind !== "normale");
  const reservations = group.items.filter((b) => b.kind === "normale");

  return (
    <section aria-labelledby="sala-titolo" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1 border-b border-sand pb-3">
        <h2 id="sala-titolo" className="wrap-anywhere font-serif text-3xl leading-tight text-ink">
          {group.name}
        </h2>
        <p className="flex flex-wrap gap-x-3 text-[14px] tabular-nums text-slate-dark">
          {group.loads.map((load) => (
            <span key={load.key} className={cn(isOver(load, group) ? "font-medium text-danger" : "text-ink")}>
              {loadText(load, group)}
            </span>
          ))}
          <span>{countLabel(group)}</span>
        </p>
      </div>

      {group.items.length === 0 ? (
        <p className="text-[14px] text-slate">Nessuna prenotazione in questa sala</p>
      ) : (
        <>
          {cards.length > 0 && (
            <section aria-label="Eventi della sala" className="flex min-w-0 flex-col gap-4">
              {cards.map((booking) => (
                <BookingCard key={booking.id} booking={booking} variant="full" dishes="collapsible" wholeCardLink />
              ))}
            </section>
          )}
          {reservations.length > 0 && (
            <ReservationList
              bookings={reservations}
              rooms={rooms}
              date={date}
              canAssign={canAssignRooms}
              canDeleteBookings={canDeleteBookings}
              showSheetButton={false}
            />
          )}
        </>
      )}
    </section>
  );
}
