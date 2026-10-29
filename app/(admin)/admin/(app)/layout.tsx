import { requireProfile } from "@/lib/auth";
import { canCreateAnyBooking, canUseInventory, isAdmin } from "@/lib/permissions";
import { BottomNav } from "@/components/shell/NavLinks";
import { MobileHeader, Sidebar } from "@/components/shell/Sidebar";
import { getNavLinks } from "@/components/shell/nav";
import { OPERATOR_SHELL } from "@/components/shell/shell-mode";
import { CreateBookingFab } from "@/components/bookings/CreateBookingFab";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { OfflineProvider as SwOfflineProvider } from "@/components/pwa/OfflineProvider";
import { buildAgendaWarmUrls } from "@/components/pwa/offline-warm-urls";
import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";
import { MenuColorsProvider } from "@/components/menu/MenuColorsProvider";
import { OfflineProvider } from "@/components/offline/OfflineProvider";
import { SyncStatus } from "@/components/offline/SyncStatus";
import { todayISO } from "@/components/agenda/agenda-utils";
import { getNotifications, getUnreadCount } from "@/lib/data/notifications";
import { getMenuColors } from "@/lib/data/catalog";
import { getUpcomingBookingIds } from "@/lib/data/bookings";

/** Giorni di prenotazioni da tenere disponibili offline. */
const WARM_DAYS = 14;

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireProfile();
  const links = getNavLinks(profile);
  const [notifications, unreadCount, menuColors, bookingIds] = await Promise.all([
    getNotifications(30),
    getUnreadCount(),
    getMenuColors(),
    getUpcomingBookingIds(WARM_DAYS),
  ]);

  // Pagine da tenere disponibili offline: agenda, dettaglio delle prenotazioni dei prossimi giorni e le
  // sezioni che il ruolo usa di frequente.
  const today = todayISO();
  const extraPaths = [
    ...(isAdmin(profile) ? ["/admin/dashboard", "/admin/clienti", "/admin/catalogo"] : []),
    ...(canUseInventory(profile) ? ["/admin/giacenza"] : []),
  ];
  const warmUrls = buildAgendaWarmUrls({ today, bookingIds, extraPaths });

  return (
    <NotificationsProvider
      profileId={profile.id}
      initialItems={notifications}
      initialUnread={unreadCount}
    >
      <SwOfflineProvider profileId={profile.id} warmUrls={warmUrls} />
      <OfflineProvider profileId={profile.id}>
        <MenuColorsProvider colors={menuColors}>
          {/* data-shell: sala e cucina su tablet restano sul layout da telefono (varianti desk:/optouch: in globals.css). */}
          <div
            data-shell={isAdmin(profile) ? undefined : OPERATOR_SHELL}
            className="min-h-dvh bg-paper desk:grid desk:grid-cols-[17rem_minmax(0,1fr)]"
          >
            <a
              href="#contenuto"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-4 focus:py-2 focus:text-petrol"
            >
              Vai al contenuto
            </a>

            <Sidebar profile={profile} links={links} />
            <MobileHeader />

            <main
              id="contenuto"
              className="min-w-0 clip-x px-4 pb-32 pt-6 sm:px-6 desk:px-10 desk:pb-14 desk:pt-10 optouch:mx-auto optouch:w-full optouch:max-w-[56rem] optouch:px-8 optouch:pt-8"
            >
              <OfflineBanner />
              {children}
            </main>

            <BottomNav items={links} />
            {/* Pulsante + per admin e sala (la cucina non crea prenotazioni). */}
            {canCreateAnyBooking(profile) && <CreateBookingFab canCreateEvent={isAdmin(profile)} />}
            {/* Pillola della coda offline: fissa, fuori dal flusso della griglia. */}
            <SyncStatus />
            <InstallPrompt />
          </div>
        </MenuColorsProvider>
      </OfflineProvider>
    </NotificationsProvider>
  );
}
