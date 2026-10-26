"use server";

import { isValid, parseISO } from "date-fns";
import { toISO } from "@/components/agenda/agenda-utils";
import { resolveWeekStart, weekRange } from "@/components/dashboard/week";
import { authorize, fail } from "@/lib/action-utils";
import { getBookingsInRange } from "@/lib/data/bookings";
import { isAdmin } from "@/lib/permissions";
import type { ActionResult, BookingListItem } from "@/lib/types";

/** Occupazione sale di una settimana (lunedì → domenica), per il cambio settimana senza ricaricare la pagina. */
export async function getWeekOccupancy(
  weekStartIso: string,
): Promise<ActionResult<{ weekStart: string; days: string[]; bookings: BookingListItem[] }>> {
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  if (typeof weekStartIso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartIso)) {
    return fail("Data non valida.");
  }
  const parsed = parseISO(weekStartIso);
  if (!isValid(parsed) || toISO(parsed) !== weekStartIso) {
    return fail("Data non valida.");
  }

  const range = weekRange(resolveWeekStart(weekStartIso, weekStartIso));

  try {
    const bookings = await getBookingsInRange(range.startIso, range.endIso);
    return { ok: true, data: { weekStart: range.startIso, days: range.days, bookings } };
  } catch (err) {
    console.error("[dashboard]", err);
    return fail("Impossibile caricare la settimana. Riprova.");
  }
}
