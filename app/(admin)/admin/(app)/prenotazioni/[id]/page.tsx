import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { capitalize, formatIt, toDate } from "@/components/agenda/agenda-utils";
import { AllergiesEditor } from "@/components/bookings/AllergiesEditor";
import { BookingChangesTimeline } from "@/components/bookings/BookingChangesTimeline";
import { BookingNotes } from "@/components/bookings/BookingNotes";
import { CoversEditor } from "@/components/bookings/CoversEditor";
import { DeleteBookingButton } from "@/components/bookings/DeleteBookingButton";
import { BookingStatusActions } from "@/components/bookings/BookingStatusActions";
import { BookingDishes } from "@/components/bookings/BookingDishes";
import { EventPriceCard } from "@/components/bookings/EventPriceCard";
import { KindBadge } from "@/components/bookings/KindBadge";
import { decodeWarnings } from "@/components/bookings/booking-form-model";
import { PreventivoMenu } from "@/components/bookings/QuoteActions";
import { CourseList } from "@/components/bookings/MenuPreview";
import { bookingTitle, formatCovers, formatTime, totalCovers } from "@/components/bookings/format";
import type { NameLookup } from "@/components/bookings/change-labels";
import {
  BookingNumbers,
  type BookingPanel,
  type BookingPanelKey,
  type NumberTile,
} from "@/components/booking-detail/BookingNumbers";
import { DetailCard, InfoRow, SummaryItem } from "@/components/booking-detail/DetailCard";
import { QuotesList } from "@/components/booking-detail/QuotesList";
import { MenuBadge } from "@/components/menu/MenuBadge";
import { PaymentsPanel } from "@/components/payments/PaymentsPanel";
import { Alert, Badge, ButtonLink, Card, Disclosure, StatusBadge, buttonClasses } from "@/components/ui";
import { isUuid } from "@/lib/action-utils";
import { canAddBookingNote, canEditAllergies, canEditCovers, canEditDishes, isAdmin } from "@/lib/permissions";
import { requireProfile } from "@/lib/auth";
import { getBooking, getBookingChanges, getBookingNotes } from "@/lib/data/bookings";
import { getPayments } from "@/lib/data/payments";
import { getDishes, getMenus, getRooms } from "@/lib/data/catalog";
import { getQuotesForBooking } from "@/lib/data/quotes";
import { getPaymentSummary } from "@/lib/payment-utils";
import { estimateBookingPrice, formatEUR } from "@/lib/quote-utils";
import { SETUP_COLOR_HEX } from "@/lib/types";

export const metadata: Metadata = {
  title: "Prenotazione · Casale del Notaio",
};

/** Numero WhatsApp in formato internazionale senza simboli (wa.me). Default prefisso Italia. */
function whatsappHref(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!digits.startsWith("39") && digits.length <= 10) digits = `39${digits}`;
  return `https://wa.me/${digits}`;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, "")}`;
}

const CALL_BUTTON = buttonClasses("outline", "sm", "min-h-11");

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payments_error?: string; warnings?: string; pannello?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const profile = await requireProfile();
  if (!isUuid(id)) notFound();

  const booking = await getBooking(id);
  if (!booking) notFound();

  const admin = isAdmin(profile);
  const covers = canEditCovers(profile);
  const dishesEditable = canEditDishes(profile);
  const allergiesEditable = canEditAllergies(profile, booking.kind);
  const kitchen = profile.role === "cucina";
  // Preventivi, acconti e prezzi esistono solo per gli eventi, e si gestiscono solo dall'admin.
  const isEvent = booking.kind === "evento";
  const financeVisible = admin && isEvent;

  const [changes, notes, rooms, menus, quotes, payments, catalog] = await Promise.all([
    getBookingChanges(id),
    getBookingNotes(id),
    getRooms({ includeInactive: true }),
    getMenus({ includeInactive: true }),
    financeVisible ? getQuotesForBooking(id) : Promise.resolve([]),
    financeVisible ? getPayments(id) : Promise.resolve([]),
    dishesEditable && isEvent ? getDishes() : Promise.resolve([]),
  ]);
  const failedDeposits = Number.parseInt(query.payments_error ?? "", 10);
  const paymentsError = Number.isFinite(failedDeposits) && failedDeposits > 0 ? failedDeposits : undefined;
  const warnings = decodeWarnings(query.warnings);

  const client = booking.client;
  const clientName = `${client.first_name} ${client.last_name}`;
  const eventDate = toDate(booking.event_date);
  const time = formatTime(booking.event_time);
  const finance = financeVisible ? getPaymentSummary(booking, payments) : null;
  // Prezzo finale: quello del preventivo più recente (null = calcolo automatico).
  const latestQuote = [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const finalTotal = latestQuote?.final_total ?? null;
  const totals = totalCovers(booking);
  const coversPanel = covers ? ("coperti" as const) : undefined;

  const lookup: NameLookup = {
    rooms: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
    menus: Object.fromEntries(menus.map((m) => [m.id, m.name])),
    clients: { [booking.client_id]: clientName },
  };

  // Numeri in alto: i riquadri economici compaiono solo per l'admin.
  const tiles: NumberTile[] = [];
  if (isEvent) {
    tiles.push({
      key: "covers",
      label: "Coperti totali",
      value: totals,
      hint: `Adulti ${booking.adults} · Bambini ${booking.children}`,
      panel: coversPanel,
      cta: "Modifica coperti",
    });
    tiles.push({
      key: "kids",
      label: "Menù bambini",
      value: booking.kids_menus,
      hint: booking.kids_menu?.name ?? "Nessun menù bambini",
      panel: coversPanel,
      cta: "Modifica coperti",
    });
    if (finance) {
      tiles.push({
        key: "expected",
        label: "Totale previsto",
        value: formatEUR(finance.expected_total),
        hint: booking.menu ? `${formatEUR(booking.menu.price_per_person)} a persona` : "Menù non scelto",
        panel: "prezzo",
        cta: "Vedi prezzo",
      });
      tiles.push({
        key: "balance",
        label: "Residuo",
        value: formatEUR(Math.max(0, finance.balance)),
        hint: `Versato ${formatEUR(finance.paid_total)}`,
        highlight: finance.balance > 0,
        panel: "pagamenti",
        cta: "Pagamenti e acconti",
      });
    }
  } else if (booking.kind === "normale") {
    tiles.push({
      key: "covers",
      label: "Coperti",
      value: totals,
      hint: formatCovers(booking),
      panel: coversPanel,
      cta: "Modifica coperti",
    });
    tiles.push({ key: "time", label: "Ora", value: time ?? "—" });
  } else {
    tiles.push({ key: "time", label: "Ora", value: time ?? "—" });
    tiles.push({ key: "type", label: "Tipo evento", value: booking.event_type?.trim() || "—" });
  }

  // Pannelli apribili, uno alla volta: solo quelli che il ruolo può usare.
  const panels: BookingPanel[] = [];
  if (covers) {
    panels.push({
      key: "coperti",
      title: "Modifica coperti",
      content: (
        <CoversEditor
          key={`${booking.adults}-${booking.children}-${booking.kids_menus}`}
          bookingId={booking.id}
          adults={booking.adults}
          childCount={booking.children}
          kidsMenus={booking.kids_menus}
        />
      ),
    });
  }
  if (financeVisible) {
    panels.push({
      key: "prezzo",
      title: "Prezzo dell’evento",
      content: (
        <EventPriceCard
          key={finalTotal ?? "auto"}
          bookingId={booking.id}
          estimate={estimateBookingPrice(booking)}
          finalTotal={finalTotal}
        />
      ),
    });
    panels.push({
      key: "pagamenti",
      title: "Pagamenti e acconti",
      content: (
        <div className="flex min-w-0 flex-col gap-5">
          <PaymentsPanel booking={booking} payments={payments} paymentsError={paymentsError} />
          <div className="flex min-w-0 flex-col gap-3 border-t border-sand pt-4">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-dark">Preventivi</h3>
            <QuotesList quotes={quotes} />
          </div>
        </div>
      ),
    });
  }
  // ?pannello=coperti | prezzo | pagamenti (pagamenti resta valido anche per gli acconti non salvati).
  const requestedPanel = query.pannello;
  const initialPanel: BookingPanelKey | null =
    requestedPanel === "coperti" && covers
      ? "coperti"
      : requestedPanel === "prezzo" && financeVisible
        ? "prezzo"
        : (requestedPanel === "pagamenti" || paymentsError !== undefined) && financeVisible
          ? "pagamenti"
          : null;

  const menuPrice = admin && booking.menu ? formatEUR(booking.menu.price_per_person) : null;

  // Riepilogo sempre visibile della tendina "Dettagli e menù".
  const detailsSummary = (
    <span className="flex min-w-0 flex-col gap-4">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
          {isEvent ? "Evento" : "Prenotazione"}
        </span>
        <span className="font-serif text-2xl leading-tight wrap-anywhere sm:text-3xl">
          {isEvent ? "Dettagli e menù" : "Dettagli"}
        </span>
      </span>
      <span className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <SummaryItem label="Data">{capitalize(formatIt(eventDate, "EEE d MMM yyyy"))}</SummaryItem>
        <SummaryItem label="Ora">{time ?? "Non indicata"}</SummaryItem>
        <SummaryItem label="Sala">{booking.room?.name ?? "Da assegnare"}</SummaryItem>
        {isEvent && (
          <SummaryItem label="Menù">
            {booking.menu ? <MenuBadge menuId={booking.menu.id} name={booking.menu.name} /> : "Non scelto"}
          </SummaryItem>
        )}
        {menuPrice && <SummaryItem label="Costo">{`${menuPrice} a persona`}</SummaryItem>}
      </span>
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-5 border-b border-sand pb-6">
        <Link
          href={`/admin/agenda?date=${booking.event_date}&view=day`}
          className="inline-flex min-h-11 w-fit items-center rounded-btn px-1 text-[13px] font-medium text-petrol underline-offset-4 hover:underline"
        >
          ← Torna all’agenda
        </Link>

        <div className="flex flex-col gap-3">
          <p className="wrap-anywhere text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">
            {capitalize(formatIt(eventDate, "EEEE d MMMM yyyy"))}
            {time ? ` · ore ${time}` : ""}
          </p>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <h1 className="min-w-0 flex-1 text-3xl leading-tight wrap-anywhere sm:text-4xl lg:text-5xl">{bookingTitle(booking)}</h1>
            {financeVisible && (
              <PreventivoMenu
                bookingId={booking.id}
                latest={latestQuote ? { id: latestQuote.id, number: latestQuote.number } : null}
                quotesCount={quotes.length}
              />
            )}
          </div>
          {booking.event_name && <p className="wrap-anywhere text-[15px] text-slate-dark">{clientName}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <KindBadge kind={booking.kind} />
            <StatusBadge status={booking.status} />
            {booking.room ? (
              <Badge tone="petrol">{booking.room.name}</Badge>
            ) : (
              <Badge tone="neutral">Sala da assegnare</Badge>
            )}
          </div>
        </div>
      </header>

      {/* Numeri: riquadri cliccabili, con un solo pannello aperto sotto (coperti o pagamenti e prezzo). */}
      <BookingNumbers tiles={tiles} panels={panels} initialPanel={initialPanel} />

      {warnings.length > 0 && (
        <div className="flex flex-col gap-3">
          {warnings.map((warning) => (
            <Alert key={warning} tone="warning">
              {warning}
            </Alert>
          ))}
        </div>
      )}

      {/* Allergie: modificabili da admin e sala; per la cucina sono in sola lettura, ben evidenti. */}
      <AllergiesEditor bookingId={booking.id} allergies={booking.allergies} editable={allergiesEditable} />

      <Disclosure
        defaultOpen={kitchen}
        className="min-w-0 rounded-[2px] border border-sand border-t-[3px] border-t-petrol bg-paper shadow-sm shadow-ink/5"
        summaryClassName="min-h-11 w-full gap-4 p-5 text-left text-ink hover:bg-cream/40 sm:p-6"
        summary={detailsSummary}
      >
        <div className="flex min-w-0 flex-col gap-10 border-t border-sand p-5 sm:p-6">
          {isEvent && (
            <section aria-labelledby="menu-title" className="flex min-w-0 flex-col gap-6">
              <header className="flex min-w-0 flex-col gap-3 border-b border-sand pb-6">
                <h3 id="menu-title" className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
                  Menù e piatti
                </h3>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  {booking.menu ? (
                    <MenuBadge menuId={booking.menu.id} name={booking.menu.name} size="lg" />
                  ) : (
                    <p className="font-serif text-2xl text-slate-dark">Menù non selezionato</p>
                  )}
                  {menuPrice && <p className="text-[15px] tabular-nums text-slate-dark">{menuPrice} a persona</p>}
                </div>
              </header>

              <BookingDishes
                bookingId={booking.id}
                dishes={booking.dishes}
                hasMenu={booking.menu_id !== null}
                canEdit={dishesEditable}
                catalog={catalog}
              />

              {booking.kids_menu && (
                <div className="flex flex-col gap-5 border-t border-sand pt-6">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Menù bambini</p>
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <MenuBadge menuId={booking.kids_menu.id} name={booking.kids_menu.name} />
                      {admin && (
                        <span className="text-[15px] text-slate-dark">{formatEUR(booking.kids_menu.price_per_person)} a bambino</span>
                      )}
                    </div>
                  </div>
                  <CourseList items={booking.kids_menu.items} />
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="cliente-title" className="flex min-w-0 flex-col gap-5 border-t border-sand pt-8 first:border-t-0 first:pt-0">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Cliente</p>
              <h3 id="cliente-title" className="text-2xl wrap-anywhere">
                {clientName}
              </h3>
            </div>
            <dl className="flex min-w-0 flex-col gap-4">
              {!kitchen && client.phone && (
                <InfoRow label="Telefono">
                  <a href={telHref(client.phone)} className="wrap-anywhere font-medium text-petrol underline-offset-4 hover:underline">
                    {client.phone}
                  </a>
                </InfoRow>
              )}
              {!kitchen && client.email && (
                <InfoRow label="Email">
                  <a href={`mailto:${client.email}`} className="wrap-anywhere text-petrol underline-offset-4 hover:underline">
                    {client.email}
                  </a>
                </InfoRow>
              )}
              {admin && client.tax_code && (
                <InfoRow label="Codice fiscale">
                  <span className="wrap-anywhere font-mono text-[14px]">{client.tax_code}</span>
                </InfoRow>
              )}
              {admin && client.vat_number && (
                <InfoRow label="P.IVA">
                  <span className="wrap-anywhere font-mono text-[14px]">{client.vat_number}</span>
                </InfoRow>
              )}
              {admin && client.notes && (
                <InfoRow label="Note cliente">
                  <span className="wrap-anywhere text-[14px] text-slate-dark">{client.notes}</span>
                </InfoRow>
              )}
            </dl>
            <div className="no-print flex flex-wrap gap-3">
              {!kitchen && client.phone && (
                <>
                  <a href={telHref(client.phone)} className={CALL_BUTTON}>
                    Chiama
                  </a>
                  <a
                    href={whatsappHref(client.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses("outline", "sm", "min-h-11 rounded-none")}
                  >
                    WhatsApp
                  </a>
                </>
              )}
              {admin && (
                <ButtonLink href={`/admin/clienti/${client.id}`} variant="ghost" size="sm" className="min-h-11">
                  Scheda cliente
                </ButtonLink>
              )}
            </div>
          </section>

          <section aria-labelledby="evento-title" className="flex min-w-0 flex-col gap-5 border-t border-sand pt-8">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{isEvent ? "Evento" : "Prenotazione"}</p>
              <h3 id="evento-title" className="text-2xl">
                {isEvent ? "Dettagli dell’evento" : "Dettagli"}
              </h3>
            </div>
            <dl className="flex min-w-0 flex-col gap-4">
              <InfoRow label="Data">{capitalize(formatIt(eventDate, "EEEE d MMMM yyyy"))}</InfoRow>
              <InfoRow label="Ora">{time ?? "Non indicata"}</InfoRow>
              <InfoRow label="Sala">{booking.room?.name ?? "Da assegnare"}</InfoRow>
              <InfoRow label="Stato">
                <StatusBadge status={booking.status} />
              </InfoRow>
              {isEvent && <InfoRow label="Tipo evento">{booking.event_type?.trim() || "Non indicato"}</InfoRow>}
              {booking.event_name && <InfoRow label="Nome evento">{booking.event_name}</InfoRow>}
              {isEvent && (
                <InfoRow label="Colori">
                  {booking.setup_colors.length > 0 ? (
                    <ul className="flex flex-wrap gap-2" aria-label="Colori scelti">
                      {booking.setup_colors.map((name) => (
                        <li
                          key={name}
                          className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-[2px] border border-sand bg-paper px-2.5 py-1 text-[14px] text-ink wrap-anywhere"
                        >
                          <span
                            aria-hidden="true"
                            className="size-3 rounded-full ring-1 ring-ink/25"
                            style={{ backgroundColor: SETUP_COLOR_HEX[name as keyof typeof SETUP_COLOR_HEX] ?? "#B0B0B0" }}
                          />
                          {name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate">Nessun colore scelto.</span>
                  )}
                </InfoRow>
              )}
              {isEvent && booking.setup_notes && <InfoRow label="Allestimento">{booking.setup_notes}</InfoRow>}
              {booking.notes && (
                <InfoRow label="Note interne">
                  <span className="whitespace-pre-line">{booking.notes}</span>
                </InfoRow>
              )}
            </dl>
          </section>
        </div>
      </Disclosure>

      {/* Note cucina: sempre visibili, aggiunta a chi può. */}
      <Card className="min-w-0 p-5 sm:p-6">
        <BookingNotes
          bookingId={booking.id}
          notes={notes}
          canAdd={canAddBookingNote(profile)}
          currentUserId={profile.id}
          isAdmin={admin}
        />
      </Card>

      {admin && (
        <div className="no-print flex flex-wrap items-center gap-3">
          <ButtonLink href={`/admin/prenotazioni/${booking.id}/modifica`} variant="primary" size="md">
            Modifica
          </ButtonLink>
          <DeleteBookingButton bookingId={booking.id} quotesCount={quotes.length} paymentsCount={payments.length} />
          <div className="ml-auto">
            <BookingStatusActions bookingId={booking.id} kind={booking.kind} status={booking.status} paymentsCount={payments.length} />
          </div>
        </div>
      )}

      {/* Registro delle modifiche: solo admin, in fondo alla pagina, a tutta larghezza. */}
      {admin && (
        <DetailCard eyebrow="Registro" title="Modifiche" className="w-full">
          <BookingChangesTimeline changes={changes} lookup={lookup} />
        </DetailCard>
      )}
    </div>
  );
}
