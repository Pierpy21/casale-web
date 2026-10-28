import type { Metadata } from "next";
import Link from "next/link";
import { capitalize, formatIt, toDate } from "@/components/agenda/agenda-utils";
import { bookingTitle, clientFullName, formatCovers, formatTime, totalCovers } from "@/components/bookings/format";
import { Badge, EmptyState, PageHeader, type BadgeTone } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { requireAdmin } from "@/lib/auth";
import { getPendingConfirmations } from "@/lib/data/bookings";
import type { BookingListItem } from "@/lib/types";

export const metadata: Metadata = {
  title: "Da confermare · Casale del Notaio",
};

interface DayGroup {
  date: string;
  items: BookingListItem[];
}

/** Raggruppa per data mantenendo l'ordine ricevuto (già per data e ora). */
function groupByDate(items: BookingListItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.event_date) last.items.push(item);
    else groups.push({ date: item.event_date, items: [item] });
  }
  return groups;
}

function pendingLabel(booking: BookingListItem): { label: string; tone: BadgeTone } {
  return booking.kind === "evento"
    ? { label: "Evento senza acconto", tone: "warning" }
    : { label: "Appuntamento in attesa", tone: "bronze" };
}

export default async function DaConfermarePage() {
  await requireAdmin();

  const items = await getPendingConfirmations();
  const groups = groupByDate(items);

  return (
    <div className="-mt-2 flex min-w-0 flex-col gap-6 lg:-mt-4">
      <PageHeader
        compact
        eyebrow="Direzione"
        title="Da confermare"
        description="Eventi in attesa del primo acconto e appuntamenti da confermare, da oggi in avanti."
      />

      {groups.length === 0 ? (
        <EmptyState
          title="Nessuna conferma in sospeso"
          description="Tutti gli eventi in programma hanno un acconto e non ci sono appuntamenti in attesa."
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-8">
          {groups.map((group) => (
            <section key={group.date} aria-labelledby={`giorno-${group.date}`} className="flex min-w-0 flex-col gap-3">
              <h2 id={`giorno-${group.date}`} className="border-b border-sand pb-2 text-xl">
                {capitalize(formatIt(toDate(group.date), "EEEE d MMMM yyyy"))}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.items.map((booking) => {
                  const time = formatTime(booking.event_time);
                  const pending = pendingLabel(booking);
                  const menuName = booking.menu?.name ?? (booking.kind === "evento" ? "Menù da definire" : null);
                  return (
                    <li key={booking.id} className="min-w-0">
                      <Link
                        href={`/admin/prenotazioni/${booking.id}`}
                        className={cn(
                          "flex min-h-11 min-w-0 flex-col gap-2 rounded-btn border border-sand bg-paper p-4 shadow-sm shadow-ink/5 transition-colors duration-200 hover:bg-cream sm:flex-row sm:items-center sm:justify-between sm:gap-6",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                        )}
                      >
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={pending.tone}>{pending.label}</Badge>
                            {time && <span className="font-serif text-lg tabular-nums">{time}</span>}
                          </div>
                          <p className="min-w-0 break-words font-serif text-xl leading-tight text-ink">{bookingTitle(booking)}</p>
                          <p className="min-w-0 break-words text-[14px] text-slate-dark">{clientFullName(booking)}</p>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 text-[14px] text-ink sm:items-end sm:text-right">
                          <span className="tabular-nums">
                            {totalCovers(booking)} coperti · {formatCovers(booking)}
                          </span>
                          {menuName && <span className="break-words text-slate-dark">{menuName}</span>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
