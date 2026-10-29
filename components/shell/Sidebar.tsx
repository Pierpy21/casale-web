import Image from "next/image";
import { signOut } from "@/app/actions/auth";
import { Badge, SubmitButton } from "@/components/ui";
import { ROLE_LABELS, type Profile } from "@/lib/types";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { SignOutForm } from "@/components/pwa/SignOutForm";
import { SidebarNav } from "./NavLinks";
import type { NavLink } from "./nav";

/** Sidebar desktop (≥ lg): logo crema, navigazione per ruolo, utente ed uscita. */
export function Sidebar({ profile, links }: { profile: Profile; links: NavLink[] }) {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh flex-col bg-ink text-sand lg:flex">
      <div className="px-7 pb-6 pt-9">
        <Image
          src="/logo.svg"
          alt="Il Casale del Notaio"
          width={675}
          height={225}
          unoptimized
          className="h-auto w-44"
        />
        <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-sand/75">
          Agenda digitale
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <SidebarNav items={links} />
      </div>

      <div className="border-t border-sand/15 px-7 py-6">
        <div className="mb-5">
          <InstallAppButton variant="sidebar" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-serif text-lg text-logo-cream">{profile.full_name}</p>
          <NotificationBell variant="sidebar" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="bronze" className="border-sand/40 bg-transparent text-sand">
            {ROLE_LABELS[profile.role]}
          </Badge>
        </div>
        <SignOutForm action={signOut} className="mt-5">
          <SubmitButton variant="light" size="sm" className="w-full" pendingLabel="Uscita…">
            Esci
          </SubmitButton>
        </SignOutForm>
      </div>
    </aside>
  );
}

/**
 * Header mobile (< lg): logo compatto ed uscita.
 * Fisso e su un layer GPU, non sticky: su iOS un header sticky segue il rimbalzo elastico dello scroll e sembra
 * in ritardo. Altezza fissa (safe area + 4rem) uguale allo spaziatore sotto e agli offset degli elementi sticky.
 */
export function MobileHeader() {
  return (
    <>
      <MobileHeaderBar />
      <div aria-hidden="true" className="no-print h-[calc(env(safe-area-inset-top)+4rem)] lg:hidden" />
    </>
  );
}

function MobileHeaderBar() {
  return (
    <header className="no-print fixed inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+4rem)] transform-gpu items-center justify-between gap-3 bg-ink px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:hidden">
      <Image
        src="/logo.svg"
        alt="Il Casale del Notaio"
        width={675}
        height={225}
        unoptimized
        className="h-8 w-auto"
      />
      <div className="flex items-center gap-1">
        <NotificationBell variant="header" />
        <SignOutForm action={signOut}>
          <SubmitButton variant="light" size="sm" pendingLabel="Uscita…">
            Esci
          </SubmitButton>
        </SignOutForm>
      </div>
    </header>
  );
}
