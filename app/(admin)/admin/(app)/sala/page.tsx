import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getFloorPlan } from "@/lib/data/floor";
import { canEditFloorLayout, canViewFloorPlan } from "@/lib/permissions";
import { FloorPlanBoard } from "@/components/floor/FloorPlanBoard";
import { parseDateParam, todayISO, AGENDA_TZ } from "@/components/agenda/agenda-utils";
import { BOOKING_MEALS, type BookingMeal } from "@/lib/types";

export const metadata: Metadata = {
  title: "Mappa sala · Casale del Notaio",
};

type SearchParams = Promise<{ date?: string; pasto?: string }>;

const HOUR_IN_ROME = new Intl.DateTimeFormat("en-GB", { timeZone: AGENDA_TZ, hour: "2-digit", hourCycle: "h23" });

/** Pasto di default: pranzo prima delle 16:00 (fuso del Casale), altrimenti cena. */
function defaultMeal(now: Date = new Date()): BookingMeal {
  const hour = Number(HOUR_IN_ROME.format(now));
  return hour < 16 ? "pranzo" : "cena";
}

function parseMeal(value: string | undefined): BookingMeal {
  return (BOOKING_MEALS as readonly string[]).includes(value ?? "") ? (value as BookingMeal) : defaultMeal();
}

export default async function SalaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireProfile();
  if (!canViewFloorPlan(profile)) redirect("/admin/agenda");

  const date = parseDateParam(params.date);
  const meal = parseMeal(params.pasto);
  const data = await getFloorPlan(date, meal);

  return (
    <FloorPlanBoard
      data={data}
      canEditLayout={canEditFloorLayout(profile)}
      canSeat={canViewFloorPlan(profile)}
      today={todayISO()}
    />
  );
}
