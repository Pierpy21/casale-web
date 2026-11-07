"use client";

import { Armchair, CalendarClock, PartyPopper, type LucideIcon } from "lucide-react";
import { Montserrat } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { capitalize, formatIt, toDate, todayISO } from "@/components/agenda/agenda-utils";
import { buttonClasses } from "@/components/ui";
import { BookingDatePicker } from "./BookingDatePicker";

// Il "+" del tasto di creazione è un carattere in Montserrat regular (non un'icona).
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400"], display: "swap" });

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
    description: "Tavolo con pranzo o cena e coperti.",
    Icon: Armchair,
  },
  {
    href: `${NEW_BOOKING_BASE}?tipo=evento`,
    label: "Evento",
    description: "Banchetto con menù, sala e ordine di servizio.",
    Icon: PartyPopper,
  },
  {
    href: `${NEW_BOOKING_BASE}?tipo=appuntamento`,
    label: "Appuntamento",
    description: "Incontro con un cliente, senza menù.",
    Icon: CalendarClock,
  },
];

/** Passi del foglio: admin sceglie prima la data, poi il tipo. Sala resta sul passo data (Continua va alla prenotazione). */
type SheetStep = "date" | "type";

// Tasto di creazione: rotondo, rosa #DA528A (icona bianca, 3.6:1: sufficiente per un'icona grande, WCAG 1.4.11).
const FAB_CLASS =
  "no-print fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-5 z-40 grid size-14 place-items-center rounded-full bg-[#da528a] text-white shadow-lg shadow-ink/30 transition-colors duration-200 hover:bg-[#c2457a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#da528a] desk:bottom-8 desk:right-8 desk:size-16";

const SHEET_CLASS =
  "no-print fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-none border-t border-sand bg-paper p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl shadow-ink/30 backdrop:bg-ink/50 desk:inset-auto desk:bottom-28 desk:right-8 desk:max-h-[calc(100dvh-9rem)] desk:w-[24rem] desk:rounded-[2px] desk:border desk:pb-0";

/** Giorno selezionato in agenda (?date=YYYY-MM-DD), letto al momento del tap: l'agenda lo aggiorna con replaceState. */
function agendaDate(pathname: string): string | null {
  if (!pathname.startsWith("/admin/agenda")) return null;
  const date = new URLSearchParams(window.location.search).get("date");
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Link alla pagina di creazione con la data scelta: il form la mostra precompilata e resta modificabile. */
function withDate(href: string, date: string): string {
  return `${href}&date=${date}`;
}

export interface CreateBookingFabProps {
  /** Admin: data, poi Prenotazione / Evento / Appuntamento. Sala: data, poi il pulsante apre la prenotazione. */
  canCreateEvent: boolean;
}

/**
 * Pulsante + flottante per creare prenotazioni (tutte le pagine admin e sala, non cucina).
 * Posizionato sopra la barra inferiore mobile e rispettando il safe-area inferiore.
 */
export function CreateBookingFab({ canCreateEvent }: CreateBookingFabProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SheetStep>("date");
  // Data scelta e "oggi" sono fissati all'apertura del foglio.
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Ad ogni cambio di passo (e all'apertura) il focus va al titolo del foglio.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, step]);

  // Sulla pagina di creazione il pulsante non serve e coprirebbe i campi in fondo.
  if (pathname.startsWith(NEW_BOOKING_BASE)) return null;

  function openSheet() {
    const now = todayISO();
    setToday(now);
    setDate(agendaDate(pathname) ?? now);
    setStep("date");
    setOpen(true);
  }

  const longDate = date ? capitalize(formatIt(toDate(date), "EEE d MMMM")) : "";
  const headingClass = "font-serif text-2xl leading-tight focus:outline-none";

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={canCreateEvent ? "Crea una prenotazione" : "Nuova prenotazione"}
        onClick={openSheet}
        className={FAB_CLASS}
      >
        <span aria-hidden="true" className={`${montserrat.className} text-[2.25rem] leading-none desk:text-[2.5rem]`}>
          +
        </span>
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
        {open && (
          <>
            {/* Niente pulsante di chiusura: si chiude toccando fuori o con Escape. */}
            {step === "type" && (
              // Passo tipo: la data scelta diventa l'intestazione del foglio.
              <div className="flex items-center justify-between gap-3 border-b border-sand px-4 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-bronze">Data</span>
                  <h2 id={titleId} ref={headingRef} tabIndex={-1} className={headingClass}>
                    {longDate}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("date")}
                  className="min-h-11 shrink-0 rounded-btn px-3 text-[13px] font-medium text-petrol transition-colors hover:bg-cream"
                >
                  Cambia data
                </button>
              </div>
            )}

            {step === "date" ? (
              <div className="flex flex-col gap-3 p-4">
                {/* Titolo solo per i lettori di schermo: a video bastano data e calendario. */}
                <h2 id={titleId} ref={headingRef} tabIndex={-1} className="sr-only">
                  Quale giorno?
                </h2>
                <BookingDatePicker value={date} today={today} onChange={setDate} />
                {canCreateEvent ? (
                  <button type="button" onClick={() => setStep("type")} className={buttonClasses("primary", "md", "w-full")}>
                    Continua
                  </button>
                ) : (
                  <Link
                    href={withDate(`${NEW_BOOKING_BASE}?tipo=normale`, date)}
                    onClick={() => setOpen(false)}
                    className={buttonClasses("primary", "md", "w-full")}
                  >
                    Continua
                  </Link>
                )}
              </div>
            ) : (
              <nav aria-label="Tipo di prenotazione" className="p-3">
                <p className="px-2 pb-2 pt-1 text-[12px] font-medium uppercase tracking-[0.12em] text-bronze">
                  Cosa vuoi creare?
                </p>
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
            )}
          </>
        )}
      </dialog>
    </>
  );
}
