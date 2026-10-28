"use client";

import {
  BarChart3,
  Boxes,
  CalendarDays,
  Ellipsis,
  History,
  LayoutDashboard,
  PartyPopper,
  RefreshCw,
  UserCog,
  UtensilsCrossed,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { SignOutForm } from "@/components/pwa/SignOutForm";
import { QueueBadge } from "@/components/offline/QueueBadge";
import { useOnline } from "@/components/offline/useOnline";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/components/ui/cn";
import type { NavIcon, NavLink } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  event: PartyPopper,
  agenda: CalendarDays,
  dashboard: LayoutDashboard,
  clients: Users,
  operators: UserCog,
  catalog: UtensilsCrossed,
  inventory: Boxes,
  activity: History,
  stats: BarChart3,
  sync: RefreshCw,
};

/** Numero di voci dirette nella barra mobile; le altre finiscono nel menù "Altro". */
const MOBILE_DIRECT_LINKS = 3;

/** Confronto sul percorso (senza query string: le voci possono avere ?tipo=...). */
function isActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Navigazione laterale desktop (≥ lg). La voce in evidenza (Crea evento) sta in cima, in colore sabbia. */
export function SidebarNav({ items }: { items: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigazione principale">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          if (item.prominent) {
            return (
              <li key={item.href} className="mb-3">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[2px] border px-3.5 py-3 text-[13px] font-semibold uppercase tracking-[0.12em] transition-colors duration-300",
                    active
                      ? "border-logo-cream bg-logo-cream text-ink"
                      : "border-sand/60 bg-sand/15 text-logo-cream hover:bg-sand/25",
                  )}
                >
                  <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[2px] px-3 py-2.5 text-[13px] font-medium uppercase tracking-[0.12em] transition-colors duration-300",
                  active
                    ? "bg-petrol text-paper"
                    : "text-sand hover:bg-white/5 hover:text-logo-cream",
                )}
              >
                <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                {item.label}
                {item.badge === "queue" && <QueueBadge className="ml-auto" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const MOBILE_LINK_CLASS =
  "relative flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors duration-300";

/**
 * Barra di navigazione inferiore mobile (< lg), con safe-area.
 * Mostra le prime voci dirette e un pulsante "Altro" che apre un foglio con le restanti voci e l'uscita.
 */
export function BottomNav({ items }: { items: NavLink[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const sheetTitleId = useId();
  const online = useOnline();

  // Su telefono la creazione passa dal pulsante +: le voci con mobileBar=false restano fuori dalla barra.
  const mobileItems = items.filter((item) => item.mobileBar !== false);
  const direct = mobileItems.slice(0, MOBILE_DIRECT_LINKS);
  const overflow = mobileItems.slice(MOBILE_DIRECT_LINKS);
  const overflowActive = overflow.some((item) => isActive(pathname, item.href));

  useEffect(() => {
    const dialog = sheetRef.current;
    if (!dialog) return;
    if (moreOpen && !dialog.open) dialog.showModal();
    if (!moreOpen && dialog.open) dialog.close();
  }, [moreOpen]);

  return (
    <>
      <nav
        aria-label="Navigazione principale"
        className="no-print fixed inset-x-0 bottom-0 left-0 right-0 z-30 w-full max-w-full border-t border-sand/15 bg-ink pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
      >
        <ul
          className="grid w-full"
          style={{ gridTemplateColumns: `repeat(${direct.length + 1}, minmax(0, 1fr))` }}
        >
          {direct.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    MOBILE_LINK_CLASS,
                    active ? "text-logo-cream" : "text-sand/75 hover:text-sand",
                  )}
                >
                  {active && (
                    <span aria-hidden="true" className="absolute inset-x-6 top-0 h-[2px] bg-sand" />
                  )}
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  <span className="block max-w-full truncate">{item.label}</span>
                  {item.badge === "queue" && (
                    <QueueBadge className="absolute left-[calc(50%+0.5rem)] top-1 h-4 min-w-4 px-1 text-[10px]" />
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
              className={cn(
                MOBILE_LINK_CLASS,
                "w-full",
                overflowActive || moreOpen ? "text-logo-cream" : "text-sand/75 hover:text-sand",
              )}
            >
              {overflowActive && (
                <span aria-hidden="true" className="absolute inset-x-6 top-0 h-[2px] bg-sand" />
              )}
              <Ellipsis aria-hidden="true" className="size-5 shrink-0" />
              <span className="block max-w-full truncate">Altro</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={sheetRef}
        onClose={() => setMoreOpen(false)}
        aria-labelledby={sheetTitleId}
        className="no-print fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none rounded-none border-t border-sand bg-paper p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl shadow-ink/30 backdrop:bg-ink/50 lg:hidden"
      >
        <div className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4">
          <h2 id={sheetTitleId} className="font-serif text-2xl">
            Altro
          </h2>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => setMoreOpen(false)}
            className="rounded-[2px] p-2 text-slate-dark hover:bg-cream"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="px-3 pt-3">
          <InstallAppButton variant="menu" onBeforeAction={() => setMoreOpen(false)} />
        </div>

        {overflow.length > 0 && (
          <nav aria-label="Altre sezioni" className="px-3 py-3">
            <ul className="flex flex-col gap-1">
              {overflow.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-[2px] px-3 py-3.5 text-[13px] font-medium uppercase tracking-[0.12em]",
                        active ? "bg-petrol text-paper" : "text-ink hover:bg-cream",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-5 shrink-0" />
                      {item.label}
                      {item.badge === "queue" && <QueueBadge className="ml-auto" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="border-t border-sand px-5 py-4">
          <SignOutForm action={signOut}>
            <SubmitButton variant="outline" size="md" className="w-full" pendingLabel="Uscita…" disabled={!online}>
              Esci
            </SubmitButton>
          </SignOutForm>
          {!online && <p className="mt-2 text-center text-[13px] text-slate">Uscita disponibile solo online.</p>}
        </div>
      </dialog>
    </>
  );
}
