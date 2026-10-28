import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { KitchenAllergyBanner } from "@/components/agenda/kitchen/KitchenAllergyBanner";
import { MenuBadge } from "@/components/menu/MenuBadge";
import { Badge, Disclosure, StatusDot } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import {
  BOOKING_KIND_LABELS,
  SETUP_COLORS,
  SETUP_COLOR_HEX,
  STATUS_COLORS,
  STATUS_LABELS,
  type BookingListItem,
  type BookingNote,
} from "@/lib/types";
import { BookingNotes } from "./BookingNotes";
import { KindBadge } from "./KindBadge";
import {
  bookingTitle,
  clientFullName,
  formatCovers,
  formatTime,
  groupDishes,
  totalCovers,
  type DishGroup,
} from "./format";

/** Variante cucina: sola lettura, con note cucina. */
export interface BookingCardKitchen {
  notes: BookingNote[];
  canAddNote: boolean;
  currentUserId: string;
}

export interface BookingCardProps {
  booking: BookingListItem;
  /** compact: cella del calendario mese / lista dashboard. full: card ricca. */
  variant?: "compact" | "full";
  /** Come mostrare il menù (piatti) nella variante full. */
  dishes?: "inline" | "collapsible" | "hidden";
  showDate?: boolean;
  /** Variante full: tutta la card apre la prenotazione (stretched link); l'area piatti resta indipendente. */
  wholeCardLink?: boolean;
  /**
   * Scheda cucina (sola lettura): nome prima dell'orario, allergie in cima, piatti sempre visibili,
   * tendina "Dettagli e note cucina". Implica la variante full.
   */
  kitchen?: BookingCardKitchen;
  className?: string;
}

const SETUP_FALLBACK = "#B0B0B0";

/** Menù scelto: nome nel colore del menù, la prima informazione della card. */
function MenuLabel({ menuId, name }: { menuId: string | null; name: string | null }) {
  if (!name) {
    return (
      <span className="inline-flex max-w-full items-center rounded-[2px] border border-dashed border-slate/60 px-3 py-1.5 font-serif text-[15px] italic text-slate-dark">
        Menù da definire
      </span>
    );
  }
  return <MenuBadge menuId={menuId} name={name} size="md" />;
}

/** Colori di allestimento: pallini distanziati e nomi che vanno a capo, senza troncamenti. */
function SetupColors({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-slate-dark">
      <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        {colors.map((name) => (
          <span
            key={name}
            title={name}
            className="size-3.5 rounded-full ring-1 ring-ink/25"
            style={{ backgroundColor: SETUP_COLOR_HEX[name as (typeof SETUP_COLORS)[number]] ?? SETUP_FALLBACK }}
          />
        ))}
      </span>
      <span className="min-w-0 break-words">{colors.join(" · ")}</span>
    </div>
  );
}

export function BookingCard({
  booking: b,
  variant = "compact",
  dishes = "inline",
  showDate = false,
  wholeCardLink = false,
  kitchen,
  className,
}: BookingCardProps) {
  const href = `/admin/prenotazioni/${b.id}`;
  const time = formatTime(b.event_time);
  const dateLabel = showDate ? formatIt(toDate(b.event_date), "EEE d MMM") : null;
  const allergyCount = b.allergies.length;
  const title = bookingTitle(b);
  const menuName = b.menu?.name ?? null;
  const isEvent = b.kind === "evento";
  const covers = totalCovers(b);
  const roomLine = [b.room?.name ?? "Sala da assegnare", covers > 0 ? formatCovers(b) : null].filter(Boolean).join(" · ");

  if (variant === "compact" && !kitchen) {
    // Senza menù (prenotazioni, appuntamenti) la testata è il titolo; il cliente va sotto, se diverso.
    const subline = isEvent ? title : b.event_name?.trim() ? clientFullName(b) : null;
    return (
      <Link
        href={href}
        aria-label={`${BOOKING_KIND_LABELS[b.kind]}, ${isEvent ? (menuName ?? "Menù da definire") : title}${time ? `, ore ${time}` : ""}${b.room ? `, ${b.room.name}` : ""}${covers > 0 ? `, ${formatCovers(b)} coperti` : ""}${allergyCount > 0 ? `, ${allergyCount} allergie` : ""}, stato ${STATUS_LABELS[b.status]}`}
        style={{ borderLeftColor: STATUS_COLORS[b.status] }}
        className={cn(
          "flex min-w-0 flex-col gap-1.5 border-l-[3px] bg-cream/70 px-3 py-3 text-ink transition-colors duration-200 hover:bg-sand/60",
          b.status === "annullato" && "line-through opacity-70",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-[12px] text-slate-dark">
          {b.kind !== "normale" && <StatusDot status={b.status} size="sm" />}
          <KindBadge kind={b.kind} compact />
          {dateLabel && <span className="font-medium">{dateLabel}</span>}
          {time && <span className="font-medium tabular-nums text-ink">{time}</span>}
          {allergyCount > 0 && (
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1 text-danger"
              title={`${allergyCount} ${allergyCount === 1 ? "allergia" : "allergie"}`}
            >
              <TriangleAlert aria-hidden="true" className="size-3.5" />
              <span className="text-[12px] tabular-nums">{allergyCount}</span>
              <span className="sr-only">{allergyCount} allergie</span>
            </span>
          )}
        </span>
        {isEvent ? (
          menuName ? (
            <MenuBadge menuId={b.menu?.id ?? null} name={menuName} size="sm" className="self-start" />
          ) : (
            <span className="font-serif text-[16px] font-semibold italic leading-snug text-slate-dark">Menù da definire</span>
          )
        ) : (
          <span className="break-words font-serif text-[16px] font-semibold leading-snug text-petrol">{title}</span>
        )}
        {subline && <span className="line-clamp-2 break-words text-[13px] leading-snug">{subline}</span>}
        <span className="truncate text-[12px] text-slate-dark">{roomLine}</span>
      </Link>
    );
  }

  const isKitchen = kitchen !== undefined;
  const groups = groupDishes(b.dishes);
  const hasDishes = (isKitchen || dishes !== "hidden") && groups.length > 0;
  const dishesMode = isKitchen ? "inline" : dishes;

  // Intestazione del nome: in cucina il nome viene prima dell'orario e non è un link (sola lettura).
  const nameLine = isKitchen ? (
    <h3 className="break-words font-serif text-2xl leading-tight wrap-anywhere">{title}</h3>
  ) : (
    <h3 className="break-words font-serif text-xl leading-tight wrap-anywhere">
      <Link
        href={href}
        className={cn(
          "rounded-[2px] underline-offset-4 hover:text-petrol hover:underline",
          wholeCardLink
            ? "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            : "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol",
        )}
      >
        {title}
      </Link>
    </h3>
  );

  const timeLine = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
      {dateLabel && <span>{dateLabel}</span>}
      {time && <span>ore {time}</span>}
      {b.room && <span>{b.room.name}</span>}
    </p>
  );

  return (
    <article
      style={{ borderTopColor: STATUS_COLORS[b.status] }}
      aria-label={`${BOOKING_KIND_LABELS[b.kind]}, stato ${STATUS_LABELS[b.status]}`}
      className={cn(
        "relative flex min-w-0 flex-col gap-5 rounded-[2px] border border-sand border-t-[3px] bg-paper p-5 shadow-sm shadow-ink/5 sm:p-6",
        wholeCardLink &&
          "cursor-pointer transition-colors duration-200 hover:bg-cream/40 active:bg-cream/70 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-petrol",
        b.status === "annullato" && "opacity-80",
        className,
      )}
    >
      {isKitchen && <KitchenAllergyBanner allergies={b.allergies} />}

      <header className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <KindBadge kind={b.kind} />
            {isEvent && <MenuLabel menuId={b.menu?.id ?? null} name={menuName} />}
          </div>
          {b.kind !== "normale" && <StatusDot status={b.status} />}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {isKitchen ? (
            <>
              {nameLine}
              {timeLine}
            </>
          ) : (
            <>
              {timeLine}
              {nameLine}
            </>
          )}
          {b.event_name && (
            <p className="break-words wrap-anywhere text-[14px] text-slate-dark">
              {clientFullName(b)}
              {!isKitchen && b.client.phone ? ` · ${b.client.phone}` : null}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
          {(isEvent || covers > 0) && (
            <p className="flex items-baseline gap-2" title="A = adulti, B = bambini">
              <span className="font-serif text-4xl leading-none tabular-nums text-ink">{covers}</span>
              <span className="text-[13px] text-slate-dark">
                coperti <span className="tabular-nums text-slate">({formatCovers(b)})</span>
              </span>
            </p>
          )}
          {b.kids_menus > 0 && <Badge tone="petrol">Menù bambini ×{b.kids_menus}</Badge>}
          {allergyCount > 0 && !isKitchen && (
            <Badge tone="danger">
              <TriangleAlert aria-hidden="true" className="size-3" />
              {allergyCount} {allergyCount === 1 ? "allergia" : "allergie"}
            </Badge>
          )}
        </div>
      </header>

      <SetupColors colors={b.setup_colors} />

      {hasDishes &&
        (dishesMode === "collapsible" ? (
          <Disclosure
            className={cn("border-t border-sand pt-4", wholeCardLink && "relative z-10")}
            summaryClassName="min-h-11 text-[13px] font-medium normal-case tracking-normal text-petrol hover:text-petrol-hover"
            summary={`Piatti del menù (${b.dishes.length})`}
          >
            <div className="mt-4">
              <DishList groups={groups} />
            </div>
          </Disclosure>
        ) : (
          <div className={cn("border-t border-sand pt-4", wholeCardLink && "relative z-10")}>
            <DishList groups={groups} />
          </div>
        ))}

      {allergyCount > 0 && !isKitchen && (
        <div className="border-l-[3px] border-danger bg-danger/5 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-danger">
            Allergie e patologie
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-[14px] text-ink">
            {b.allergies.map((allergy) => (
              <li key={allergy.id} className="break-words">
                {allergy.condition}
                {allergy.subject_name && (
                  <span className="text-slate-dark"> ({allergy.subject_name})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kitchen && (
        <Disclosure
          className="border-t border-sand pt-4"
          summaryClassName="min-h-11 text-[13px] font-medium normal-case tracking-normal text-petrol hover:text-petrol-hover"
          summary={kitchen.notes.length > 0 ? `Dettagli e note cucina · ${kitchen.notes.length}` : "Dettagli e note cucina"}
        >
          <div className="mt-4 flex min-w-0 flex-col gap-5">
            {b.allergies.some((allergy) => allergy.notes) && (
              <ul className="flex flex-col gap-2 text-[14px] leading-snug text-ink">
                {b.allergies
                  .filter((allergy) => allergy.notes)
                  .map((allergy) => (
                    <li key={allergy.id} className="break-words">
                      <span className="font-semibold">{allergy.subject_name?.trim() || "Persona non indicata"}</span>
                      <span> · {allergy.condition}: </span>
                      <span className="text-slate-dark">{allergy.notes}</span>
                    </li>
                  ))}
              </ul>
            )}

            <dl className="flex flex-col gap-4 text-[14px] text-ink">
              <KitchenField label="Cliente">{clientFullName(b)}</KitchenField>
              {b.event_name && <KitchenField label="Evento">{b.event_name}</KitchenField>}
              <KitchenField label="Sala">{b.room?.name ?? "Da assegnare"}</KitchenField>
              {isEvent && (b.setup_colors.length > 0 || b.setup_notes) && (
                <KitchenField label="Allestimento">
                  {b.setup_colors.length > 0 && <span className="block">Colori: {b.setup_colors.join(", ")}</span>}
                  {b.setup_notes && <span className="block whitespace-pre-line">{b.setup_notes}</span>}
                </KitchenField>
              )}
              {b.notes && <KitchenField label="Note prenotazione">{b.notes}</KitchenField>}
            </dl>

            <div className="border-t border-sand pt-4">
              <BookingNotes
                bookingId={b.id}
                notes={kitchen.notes}
                canAdd={kitchen.canAddNote}
                currentUserId={kitchen.currentUserId}
                isAdmin={false}
              />
            </div>
          </div>
        </Disclosure>
      )}
    </article>
  );
}

function KitchenField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{label}</dt>
      <dd className="break-words wrap-anywhere">{children}</dd>
    </div>
  );
}

function DishList({ groups }: { groups: DishGroup[] }) {
  return (
    <dl className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.course}>
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
            {group.label}
          </dt>
          <dd>
            <ul className="mt-0.5 text-[14px] leading-snug text-ink">
              {group.items.map((dish) => (
                <li key={dish.id}>{dish.name}</li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}
