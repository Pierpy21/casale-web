"use client";

import { Armchair, CalendarClock, PartyPopper, Plus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

const NEW_BOOKING_BASE = "/admin/prenotazioni/nuova";

interface CreateOption {
  href: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

/** Ordine fisso: Prenotazione, Evento, Appuntamento. */
const ADMIN_OPTIONS: CreateOption[] = [
  {
    href: `${NEW_BOOKING_BASE}?tipo=normale`,
    label: "Prenotazione",
    description: "Tavolo con orario e coperti.",
    Icon: Armchair,
  },
  {
    href: `${NEW_BOOKING_BASE}?tipo=evento`,
    label: "Evento",
    description: "Banchetto con menù, sala e preventivo.",
    Icon: PartyPopper,
  },
  {
    href: `${NEW_BOOKING_BASE}?tipo=appuntamento`,
    label: "Appuntamento",
    description: "Incontro con un cliente, senza menù.",
    Icon: CalendarClock,
  },
];

const FAB_CLASS =
  "no-print fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-5 z-40 grid size-14 place-items-center rounded-[2px] bg-petrol text-paper shadow-lg shadow-ink/30 transition-colors duration-200 hover:bg-petrol-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol lg:bottom-8 lg:right-8 lg:size-16";

const SHEET_CLASS =
  "no-print fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none rounded-none border-t border-sand bg-paper p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl shadow-ink/30 backdrop:bg-ink/50 lg:inset-auto lg:bottom-28 lg:right-8 lg:w-[24rem] lg:rounded-[2px] lg:border lg:pb-0";

/** Giorno selezionato in agenda (?date=YYYY-MM-DD), letto al momento del tap: l'agenda lo aggiorna con replaceState. */
function agendaDate(pathname: string): string | null {
  if (!pathname.startsWith("/admin/agenda")) return null;
  const date = new URLSearchParams(window.location.search).get("date");
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function withDate(href: string, date: string | null): string {
  return date ? `${href}&date=${date}` : href;
}

export interface CreateBookingFabProps {
  /** Admin: sheet con Prenotazione, Evento, Appuntamento. Sala: il pulsante apre direttamente la prenotazione. */
  canCreateEvent: boolean;
}

/**
 * Pulsante + flottante per creare prenotazioni (tutte le pagine admin e sala, non cucina).
 * Posizionato sopra la barra inferiore mobile e rispettando il safe-area inferiore.
 */
export function CreateBookingFab({ canCreateEvent }: CreateBookingFabProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Sulla pagina di creazione il pulsante non serve e coprirebbe i campi in fondo.
  if (pathname.startsWith(NEW_BOOKING_BASE)) return null;

  if (!canCreateEvent) {
    return (
      <Link
        href={`${NEW_BOOKING_BASE}?tipo=normale`}
        aria-label="Nuova prenotazione"
        onClick={(event) => {
          const selected = agendaDate(pathname);
          if (!selected) return;
          event.preventDefault();
          router.push(withDate(`${NEW_BOOKING_BASE}?tipo=normale`, selected));
        }}
        className={FAB_CLASS}
      >
        <Plus aria-hidden="true" className="size-7" />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Crea una prenotazione"
        onClick={() => {
          setDate(agendaDate(pathname));
          setOpen(true);
        }}
        className={FAB_CLASS}
      >
        <Plus aria-hidden="true" className="size-7" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clic sul fondo (fuori dal foglio) chiude il foglio.
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className={SHEET_CLASS}
      >
        <div className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4">
          <h2 id={titleId} className="font-serif text-2xl">
            Cosa vuoi creare?
          </h2>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => setOpen(false)}
            className="grid size-11 place-items-center rounded-[2px] text-slate-dark transition-colors hover:bg-cream"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <nav aria-label="Tipo di prenotazione" className="p-3">
          <ul className="flex flex-col gap-2">
            {ADMIN_OPTIONS.map(({ href, label, description, Icon }) => (
              <li key={href}>
                <Link
                  href={withDate(href, date)}
                  onClick={() => setOpen(false)}
                  className="flex min-h-16 items-center gap-4 rounded-[2px] border border-sand bg-paper px-4 py-3 transition-colors duration-200 hover:bg-cream active:bg-sand/60"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[2px] bg-petrol/10 text-petrol">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-serif text-xl leading-tight text-ink">{label}</span>
                    <span className="text-[13px] leading-snug text-slate-dark">{description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </dialog>
    </>
  );
}
