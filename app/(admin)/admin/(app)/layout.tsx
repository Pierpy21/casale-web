import { requireProfile } from "@/lib/auth";
import { canCreateAnyBooking, isAdmin } from "@/lib/permissions";
import { BottomNav } from "@/components/shell/NavLinks";
import { MobileHeader, Sidebar } from "@/components/shell/Sidebar";
import { getNavLinks } from "@/components/shell/nav";
import { CreateBookingFab } from "@/components/bookings/CreateBookingFab";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";
import { getNotifications, getUnreadCount } from "@/lib/data/notifications";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireProfile();
  const links = getNavLinks(profile);
  const [notifications, unreadCount] = await Promise.all([getNotifications(30), getUnreadCount()]);

  return (
    <NotificationsProvider
      profileId={profile.id}
      initialItems={notifications}
      initialUnread={unreadCount}
    >
      <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <a
          href="#contenuto"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-4 focus:py-2 focus:text-petrol"
        >
          Vai al contenuto
        </a>

        <Sidebar profile={profile} links={links} />
        <MobileHeader />

        <main id="contenuto" className="min-w-0 clip-x px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">
          {children}
        </main>

        <BottomNav items={links} />
        {/* Pulsante + per admin e sala (la cucina non crea prenotazioni). */}
        {canCreateAnyBooking(profile) && <CreateBookingFab canCreateEvent={isAdmin(profile)} />}
        <InstallPrompt />
      </div>
    </NotificationsProvider>
  );
}
