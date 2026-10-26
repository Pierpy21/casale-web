import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { capitalize, formatIt, toDate } from "@/components/agenda/agenda-utils";
import { BookingChangesTimeline } from "@/components/bookings/BookingChangesTimeline";
import { BookingSummary } from "@/components/bookings/BookingSummary";
import { CoversEditor } from "@/components/bookings/CoversEditor";
import { DeleteBookingButton } from "@/components/bookings/DeleteBookingButton";
import { DishesEditor } from "@/components/bookings/DishesEditor";
import { KindBadge } from "@/components/bookings/KindBadge";
import { decodeWarnings } from "@/components/bookings/booking-form-model";
import { PaymentsPanel } from "@/components/payments/PaymentsPanel";
import { CreateQuoteButton } from "@/components/bookings/QuoteActions";
import { CourseList } from "@/components/bookings/MenuPreview";
import { bookingTitle, formatTime } from "@/components/bookings/format";
import type { NameLookup } from "@/components/bookings/change-labels";
import { Alert, Badge, ButtonLink, Card, StatusBadge, buttonClasses, cn } from "@/components/ui";
import { isUuid } from "@/lib/action-utils";
import { canEditCovers, canEditDishes, isAdmin } from "@/lib/permissions";
import { requireProfile } from "@/lib/auth";
import { getBooking, getBookingChanges } from "@/lib/data/bookings";
import { getPayments } from "@/lib/data/payments";
import { getDishes, getMenus, getRooms } from "@/lib/data/catalog";
import { getQuotesForBooking } from "@/lib/data/quotes";
import { getPaymentSummary } from "@/lib/payment-utils";
import { computeQuoteTotals, formatEUR } from "@/lib/quote-utils";
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

function DetailCard({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-5 p-5 sm:p-6", className)}>
      <header className="flex flex-col gap-2 border-b border-sand pb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{eyebrow}</p>
        <h2 className="text-2xl wrap-anywhere">{title}</h2>
      </header>
      {children}
    </Card>
  );
}

/** Riga etichetta + valore: etichette su una colonna fissa, allineate. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 wrap-anywhere text-[15px] text-ink">{children}</dd>
    </div>
  );
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payments_error?: string; warnings?: string }>;
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
  // Preventivi, acconti e prezzi esistono solo per gli eventi, e si gestiscono solo dall'admin.
  const isEvent = booking.kind === "evento";
  const financeVisible = admin && isEvent;

  const [changes, rooms, menus, quotes, payments, catalog] = await Promise.all([
    getBookingChanges(id),
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
  const dishesVersion = `${booking.menu_id ?? ""}|${booking.dishes
    .map((d) => `${d.id}:${d.course}:${d.name}:${d.sort}:${d.description ?? ""}`)
    .join("|")}`;

  const lookup: NameLookup = {
    rooms: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
    menus: Object.fromEntries(menus.map((m) => [m.id, m.name])),
    clients: { [booking.client_id]: clientName },
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-5 border-b border-sand pb-6">
        <Link
          href={`/admin/agenda?date=${booking.event_date}&view=day`}
          className="w-fit rounded-[2px] text-[13px] font-medium text-petrol underline-offset-4 hover:underline"
        >
          ← Torna all’agenda
        </Link>

        <div className="flex flex-col gap-3">
          <p className="wrap-anywhere text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">
            {capitalize(formatIt(eventDate, "EEEE d MMMM yyyy"))}
            {time ? ` · ore ${time}` : ""}
          </p>
          <h1 className="text-3xl leading-tight wrap-anywhere sm:text-4xl lg:text-5xl">{bookingTitle(booking)}</h1>
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

        {admin && (
          <div className="no-print flex flex-wrap gap-3">
            <ButtonLink href={`/admin/prenotazioni/${booking.id}/modifica`} variant="outline" size="md">
              Modifica
            </ButtonLink>
            <DeleteBookingButton bookingId={booking.id} quotesCount={quotes.length} paymentsCount={payments.length} />
          </div>
        )}
      </header>

      <BookingSummary booking={booking} time={time} finance={finance} />

      {warnings.length > 0 && (
        <div className="flex flex-col gap-3">
          {warnings.map((warning) => (
            <Alert key={warning} tone="warning">
              {warning}
            </Alert>
          ))}
        </div>
      )}

      {booking.allergies.length > 0 && (
        <section
          aria-labelledby="allergie-title"
          className="flex min-w-0 flex-col gap-4 rounded-[2px] border-l-[3px] border-danger bg-danger/5 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-danger">Attenzione</p>
            <h2 id="allergie-title" className="text-2xl">
              Allergie e patologie
            </h2>
          </div>
          <ul className="flex flex-col gap-3">
            {booking.allergies.map((allergy) => (
              <li key={allergy.id} className="flex flex-col gap-1 text-[15px] leading-snug text-ink break-words">
                <span className="font-medium">{allergy.condition}</span>
                {allergy.subject_name && <span className="text-slate-dark">Per: {allergy.subject_name}</span>}
                {allergy.notes && <span className="text-[14px] text-slate-dark">{allergy.notes}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <DetailCard eyebrow="Cliente" title={clientName}>
            <dl className="flex min-w-0 flex-col gap-4">
              <InfoRow label="Telefono">
                <a href={telHref(client.phone)} className="wrap-anywhere font-medium text-petrol underline-offset-4 hover:underline">
                  {client.phone}
                </a>
              </InfoRow>
              {client.email && (
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
              <a href={telHref(client.phone)} className={buttonClasses("outline", "sm")}>
                Chiama
              </a>
              <a
                href={whatsappHref(client.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("outline", "sm", "rounded-none")}
              >
                WhatsApp
              </a>
              {admin && (
                <ButtonLink href={`/admin/clienti/${client.id}`} variant="ghost" size="sm">
                  Scheda cliente
                </ButtonLink>
              )}
            </div>
          </DetailCard>

          <DetailCard eyebrow={isEvent ? "Evento" : "Prenotazione"} title={isEvent ? "Dettagli dell’evento" : "Dettagli"}>
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
          </DetailCard>

          {covers && (
            <DetailCard eyebrow="Coperti" title="Modifica coperti">
              <CoversEditor
                key={`${booking.adults}-${booking.children}-${booking.kids_menus}`}
                bookingId={booking.id}
                adults={booking.adults}
                childCount={booking.children}
                kidsMenus={booking.kids_menus}
              />
            </DetailCard>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {financeVisible && <PaymentsPanel booking={booking} payments={payments} paymentsError={paymentsError} />}

          {financeVisible && (
            <DetailCard eyebrow="Preventivi" title="Preventivi">
              {quotes.length === 0 ? (
                <p className="text-[14px] text-slate">Nessun preventivo emesso per questa prenotazione.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-sand">
                  {quotes.map((quote) => {
                    const totals = computeQuoteTotals(quote);
                    return (
                      <li key={quote.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-1">
                          <p className="wrap-anywhere font-medium text-ink">n. {quote.number}</p>
                          <p className="text-[13px] text-slate-dark">
                            Emesso il {formatIt(toDate(quote.issued_at), "d MMM yyyy")} · {formatEUR(totals.total)} IVA inclusa
                          </p>
                        </div>
                        <div className="no-print flex min-w-0 flex-wrap gap-2">
                          <ButtonLink href={`/admin/preventivi/${quote.id}`} variant="ghost" size="sm">
                            Apri
                          </ButtonLink>
                          <a href={`/api/quotes/${quote.id}/pdf`} download className={buttonClasses("outline", "sm")}>
                            PDF
                          </a>
                          <a href={`/api/quotes/${quote.id}/docx`} download className={buttonClasses("outline", "sm")}>
                            DOCX
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="no-print min-w-0 border-t border-sand pt-6">
                <CreateQuoteButton bookingId={booking.id} />
              </div>
            </DetailCard>
          )}

          <DetailCard eyebrow="Registro" title="Modifiche">
            <BookingChangesTimeline changes={changes} lookup={lookup} />
          </DetailCard>
        </div>
      </div>

      {/* Menù e piatti: in fondo alla pagina. L'editor è solo per l'admin; gli altri vedono l'elenco. */}
      {isEvent && (
        <section
          aria-labelledby="menu-title"
          className="flex min-w-0 flex-col gap-6 rounded-[2px] border border-sand border-t-[3px] border-t-petrol bg-paper p-5 shadow-sm shadow-ink/5 sm:p-8"
        >
          <header className="flex flex-col gap-3 border-b border-sand pb-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Menù e piatti</p>
            <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <h2 id="menu-title" className="min-w-0 text-3xl leading-tight wrap-anywhere sm:text-4xl">
                {booking.menu?.name ?? "Menù non selezionato"}
              </h2>
              {booking.menu && (
                <p className="text-[15px] tabular-nums text-slate-dark">{formatEUR(booking.menu.price_per_person)} a persona</p>
              )}
            </div>
          </header>

          {dishesEditable ? (
            <DishesEditor
              key={dishesVersion}
              bookingId={booking.id}
              dishes={booking.dishes}
              hasMenu={booking.menu_id !== null}
              catalog={catalog}
            />
          ) : (
            <CourseList items={booking.dishes} />
          )}

          {booking.kids_menu && (
            <div className="flex flex-col gap-5 border-t border-sand pt-6">
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Menù bambini</p>
                <p className="min-w-0 wrap-anywhere text-[15px] text-slate-dark">
                  <span className="font-medium text-ink">{booking.kids_menu.name}</span>
                  {" · "}
                  {formatEUR(booking.kids_menu.price_per_person)} a bambino
                </p>
              </div>
              <CourseList items={booking.kids_menu.items} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
