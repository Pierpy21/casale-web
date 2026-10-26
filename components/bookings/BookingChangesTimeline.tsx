import type { BookingChange } from "@/lib/types";
import {
  SINGLE_VALUE_FIELDS,
  changeFieldLabel,
  formatChangeTimestamp,
  formatChangeValue,
  type NameLookup,
} from "./change-labels";

export interface BookingChangesTimelineProps {
  changes: BookingChange[];
  lookup: NameLookup;
}

/** Registro modifiche: "Nome utente · campo · da → a · data/ora". Sola lettura. */
export function BookingChangesTimeline({ changes, lookup }: BookingChangesTimelineProps) {
  if (changes.length === 0) {
    return <p className="text-[14px] text-slate">Nessuna modifica registrata.</p>;
  }

  return (
    <ol className="flex flex-col divide-y divide-sand">
      {changes.map((change) => {
        const isSingleValue = SINGLE_VALUE_FIELDS.has(change.field);
        const oldText = formatChangeValue(change.field, change.old_value, lookup);
        const newText = formatChangeValue(change.field, change.new_value, lookup);
        // Creazione/eliminazione: il valore può stare in new_value o old_value.
        const singleText = formatChangeValue(change.field, change.new_value ?? change.old_value, lookup);
        return (
          <li key={change.id} className="flex flex-col gap-1 py-3">
            <p className="text-[13px] text-slate-dark">
              <span className="font-medium text-ink">{change.changed_by_name}</span>
              <span aria-hidden="true"> · </span>
              <time dateTime={change.created_at}>{formatChangeTimestamp(change.created_at)}</time>
            </p>
            <p className="text-[14px] leading-relaxed text-ink">
              <span className="font-medium">{changeFieldLabel(change.field)}</span>
              {isSingleValue ? (
                <span>: {singleText}</span>
              ) : change.old_value === null ? (
                <span>: {newText}</span>
              ) : (
                <span>
                  : <span className="text-slate-dark">{oldText}</span>
                  <span aria-hidden="true"> → </span>
                  <span>{newText}</span>
                </span>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
