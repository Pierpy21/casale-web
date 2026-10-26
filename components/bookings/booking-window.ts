import { addDays, addMonths, format, parseISO } from "date-fns";
import { todayISO } from "@/components/agenda/agenda-utils";

/**
 * Finestra di date (YYYY-MM-DD) per gli avvisi di sala nel form: da 30 giorni fa a 18 mesi avanti.
 * Se `includeDate` (es. la data dell'evento in modifica) cade fuori, la finestra si estende per includerla.
 */
export function occupancyWindow(includeDate?: string): { from: string; to: string } {
  const today = parseISO(todayISO());
  let from = addDays(today, -30);
  let to = addMonths(today, 18);
  if (includeDate) {
    const date = parseISO(includeDate);
    if (date < from) from = date;
    if (date > to) to = date;
  }
  return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
}
