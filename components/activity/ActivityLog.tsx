import Link from "next/link";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { KindBadge } from "@/components/bookings/KindBadge";
import type { NameLookup } from "@/components/bookings/change-labels";
import type { ActivityEntry } from "@/lib/types";
import { activityBookingTitle, describeActivityChange, romeTimeLabel, type ActivityDayGroup } from "./activity-utils";

export interface ActivityLogProps {
  groups: ActivityDayGroup[];
  lookup: NameLookup;
}

/** Registro raggruppato per giorno. Sola lettura: ogni voce linka alla scheda della prenotazione. */
export function ActivityLog({ groups, lookup }: ActivityLogProps) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`giorno-${group.key}`} className="flex min-w-0 flex-col gap-2">
          <h2 id={`giorno-${group.key}`} className="border-b border-sand pb-2 text-xl">
            {group.label}
          </h2>
          <ol className="flex min-w-0 flex-col divide-y divide-sand">
            {group.entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} lookup={lookup} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ActivityRow({ entry, lookup }: { entry: ActivityEntry; lookup: NameLookup }) {
  const title = activityBookingTitle(entry);
  const change = describeActivityChange(entry, lookup);
  const time = romeTimeLabel(entry.created_at);
  const bookingDate = entry.booking_date
    ? formatIt(toDate(entry.booking_date), "d MMM yyyy")
    : null;

  return (
    <li className="flex min-w-0 flex-col gap-1.5 py-3.5">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-slate-dark">
        <time dateTime={entry.created_at} className="font-medium tabular-nums text-ink">
          {time}
        </time>
        <span className="min-w-0 break-words">{entry.changed_by_name}</span>
      </p>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {entry.booking_id ? (
          <Link
            href={`/admin/prenotazioni/${entry.booking_id}`}
            className="inline-flex min-h-11 min-w-0 items-center break-words font-serif text-[17px] leading-snug text-petrol underline-offset-4 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <span className="inline-flex min-h-11 min-w-0 items-center break-words font-serif text-[17px] leading-snug text-slate-dark">
            {title} <span className="ml-2 text-[12px] uppercase tracking-[0.12em]">(eliminata)</span>
          </span>
        )}
        {entry.booking_kind && <KindBadge kind={entry.booking_kind} compact />}
        {bookingDate && <span className="text-[13px] tabular-nums text-slate-dark">{bookingDate}</span>}
      </div>

      <p className="min-w-0 break-words text-[14px] leading-relaxed text-ink">
        <span className="font-medium">{change.label}</span>
        {change.single ? (
          <span>: {change.to}</span>
        ) : (
          <span>
            : <span className="text-slate-dark">{change.from}</span>
            <span aria-hidden="true"> → </span>
            <span>{change.to}</span>
          </span>
        )}
      </p>
    </li>
  );
}
