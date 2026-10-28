import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActivityFilterTabs } from "@/components/activity/ActivityFilterTabs";
import { ActivityLog } from "@/components/activity/ActivityLog";
import { filterActivity, groupActivityByDay, parseActivityFilter } from "@/components/activity/activity-utils";
import { todayISO } from "@/components/agenda/agenda-utils";
import type { NameLookup } from "@/components/bookings/change-labels";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { getActivityLog } from "@/lib/data/bookings";
import { getMenus, getRooms } from "@/lib/data/catalog";
import { canViewActivityLog } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Registro attività · Casale del Notaio",
};

/** Quante modifiche recenti leggere dal database prima del filtro per tipo. */
const ACTIVITY_LIMIT = 150;

type SearchParams = Promise<{ tipo?: string }>;

export default async function RegistroPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireProfile();
  if (!canViewActivityLog(profile)) redirect("/admin/agenda");

  const params = await searchParams;
  const filter = parseActivityFilter(params.tipo);

  const [entries, rooms, menus] = await Promise.all([
    getActivityLog(ACTIVITY_LIMIT),
    getRooms({ includeInactive: true }),
    getMenus({ includeInactive: true }),
  ]);

  const lookup: NameLookup = {
    rooms: Object.fromEntries(rooms.map((room) => [room.id, room.name])),
    menus: Object.fromEntries(menus.map((menu) => [menu.id, menu.name])),
    // I nomi dei clienti non arrivano nel registro: il cambio cliente è mostrato come "modificato".
    clients: {},
  };

  const visible = filterActivity(entries, filter);
  const groups = groupActivityByDay(visible, todayISO());

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        compact
        eyebrow="Attività"
        title="Registro attività"
        description="Modifiche recenti alle prenotazioni: chi ha cambiato cosa, e quando."
      />

      <ActivityFilterTabs active={filter} />

      {groups.length === 0 ? (
        <EmptyState
          title={entries.length === 0 ? "Nessuna attività registrata" : "Nessuna modifica per questo filtro"}
          description={
            entries.length === 0
              ? "Le modifiche alle prenotazioni compariranno qui."
              : "Prova a scegliere un altro tipo di prenotazione."
          }
        />
      ) : (
        <ActivityLog groups={groups} lookup={lookup} />
      )}
    </div>
  );
}
