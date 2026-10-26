"use client";

import {
  ArrowLeftRight,
  Bell,
  BellRing,
  CalendarPlus,
  CalendarX,
  CheckCheck,
  ClipboardList,
  PencilLine,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { it } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { AppNotification, NotificationType } from "@/lib/types";
import { PushToggle } from "./PushToggle";
import { useNotifications } from "./NotificationsProvider";

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  booking_created: CalendarPlus,
  booking_updated: PencilLine,
  booking_status: ArrowLeftRight,
  booking_cancelled: CalendarX,
  booking_deleted: Trash2,
  covers_updated: Users,
  dishes_updated: UtensilsCrossed,
  event_reminder: BellRing,
  inventory_report: ClipboardList,
};

const BADGE_MAX = 99;

export interface NotificationBellProps {
  /** sidebar: bottone scuro in fondo alla sidebar desktop. header: bottone nell'header mobile. */
  variant?: "sidebar" | "header";
}

/** Campanella con badge e pannello (sheet dal basso su mobile, colonna accanto alla sidebar su desktop). */
export function NotificationBell({ variant = "header" }: NotificationBellProps) {
  const { unreadCount, pulse } = useNotifications();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const titleId = useId();

  // Animazione breve del badge quando arriva una notifica in tempo reale.
  useEffect(() => {
    if (pulse === 0) return;
    const start = window.setTimeout(() => setFlash(true), 0);
    const end = window.setTimeout(() => setFlash(false), 1200);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [pulse]);

  const badge = unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : String(unreadCount);
  const label = unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche";

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative grid size-10 shrink-0 place-items-center rounded-[2px] text-sand transition-colors duration-200 hover:bg-white/5 hover:text-logo-cream",
          open && "bg-white/5 text-logo-cream",
        )}
      >
        <Bell aria-hidden="true" className="size-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex min-w-[1.25rem] items-center justify-center rounded-full bg-logo-cream px-1 text-[11px] font-semibold leading-5 tabular-nums text-ink"
          >
            {badge}
            {flash && (
              <span className="absolute inset-0 animate-ping rounded-full bg-logo-cream/70" />
            )}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          titleId={titleId}
          variant={variant}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface NotificationPanelProps {
  titleId: string;
  variant: "sidebar" | "header";
  onClose: () => void;
}

function NotificationPanel({ titleId, variant, onClose }: NotificationPanelProps) {
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Il link esplicito (url) ha la precedenza; altrimenti si apre la prenotazione collegata.
  const openItem = (n: AppNotification) => {
    markRead(n.id);
    onClose();
    const target = n.url || (n.booking_id ? `/admin/prenotazioni/${n.booking_id}` : null);
    if (target) router.push(target);
  };

  // Portal nel body: il pannello sta sopra la barra di navigazione mobile e l'header sticky.
  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 lg:bg-transparent" />
      <div
        role="dialog"
        aria-labelledby={titleId}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-[2px] border-t border-sand bg-paper pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl shadow-ink/30",
          "lg:inset-x-auto lg:bottom-6 lg:max-h-[min(70vh,40rem)] lg:w-[24rem] lg:rounded-[2px] lg:border lg:pb-0",
          variant === "sidebar" ? "lg:left-[17.5rem]" : "lg:left-auto lg:right-6",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-sand px-5 py-4">
          <h2 id={titleId} className="font-serif text-2xl">
            Attività
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1.5 rounded-[2px] px-2 py-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-petrol transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent"
            >
              <CheckCheck aria-hidden="true" className="size-4" />
              Segna tutte come lette
            </button>
            <button
              type="button"
              aria-label="Chiudi"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-[2px] text-slate-dark transition-colors hover:bg-cream"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nessuna attività"
                description="Qui compariranno le nuove prenotazioni, le modifiche e i promemoria degli eventi."
                icon={<Bell aria-hidden="true" className="size-6" />}
              />
            </div>
          ) : (
            <ul className="divide-y divide-sand">
              {items.map((n) => (
                <NotificationRow key={n.id} notification={n} onOpen={() => openItem(n)} />
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-sand px-5 py-4">
          <PushToggle />
        </footer>
      </div>
    </>,
    document.body,
  );
}

function NotificationRow({ notification: n, onOpen }: { notification: AppNotification; onOpen: () => void }) {
  const Icon = TYPE_ICONS[n.type] ?? BellRing;
  const unread = !n.read_at;
  const when = formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true, locale: it });
  const meta = [n.actor_name, when].filter(Boolean).join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-start gap-3.5 px-5 py-4 text-left transition-colors duration-200 hover:bg-cream",
          unread && "bg-petrol/5",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-[2px]",
            unread ? "bg-petrol text-paper" : "bg-cream text-petrol",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {unread && <span className="sr-only">Non letta: </span>}
          <span className={cn("break-words text-[15px] leading-snug", unread ? "font-semibold text-ink" : "text-slate-dark")}>
            {n.title}
          </span>
          {n.body && <span className="break-words text-[13px] leading-snug text-slate-dark">{n.body}</span>}
          <span className="mt-1 text-[12px] text-slate">{meta}</span>
        </span>
        {unread && <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-petrol" />}
      </button>
    </li>
  );
}
