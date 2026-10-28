import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { BookingCard } from "@/components/bookings/BookingCard";
import { ClientForm } from "@/components/clients/ClientForm";
import { DeleteClientButton } from "@/components/clients/DeleteClientButton";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getClient, getClientBookings } from "@/lib/data/clients";

export const metadata: Metadata = {
  title: "Scheda cliente · Casale del Notaio",
};

type Params = Promise<{ id: string }>;

export default async function ClientDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;

  const client = await getClient(id);
  if (!client) notFound();

  const bookings = await getClientBookings(client.id);
  const name = `${client.first_name} ${client.last_name}`;
  const newBookingHref = `/admin/prenotazioni/nuova?client=${client.id}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Scheda cliente"
        title={name}
        description={`Telefono ${client.phone}${client.email ? ` · ${client.email}` : ""}`}
        actions={
          <>
            <ButtonLink href="/admin/clienti" variant="ghost" size="sm">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Clienti
            </ButtonLink>
            <ButtonLink
              href={newBookingHref}
              variant="primary"
              size="md"
              className="max-sm:w-full max-sm:whitespace-normal max-sm:px-5 max-sm:text-center"
            >
              <CalendarPlus aria-hidden="true" className="size-4 shrink-0" />
              Nuova prenotazione per questo cliente
            </ButtonLink>
          </>
        }
      />

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section aria-labelledby="dati-cliente" className="flex flex-col gap-5">
          <h2 id="dati-cliente" className="text-2xl">
            Dati del cliente
          </h2>
          <Card className="p-6">
            <ClientForm key={client.updated_at} mode="edit" client={client} />
          </Card>
          <div className="flex flex-col items-start gap-3 border-t border-sand pt-5">
            <p className="text-[13px] text-slate-dark">
              Un cliente con prenotazioni collegate non può essere eliminato.
            </p>
            <DeleteClientButton clientId={client.id} clientName={name} />
          </div>
        </section>

        <section aria-labelledby="prenotazioni-cliente" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 border-b border-sand pb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
              Storico ed eventi
            </p>
            <h2 id="prenotazioni-cliente" className="text-2xl">
              Prenotazioni ({bookings.length})
            </h2>
          </div>

          {bookings.length === 0 ? (
            <EmptyState
              title="Nessuna prenotazione"
              description="Questo cliente non ha ancora banchetti in agenda."
              action={
                <ButtonLink href={newBookingHref} variant="outline" size="md">
                  Crea prenotazione
                </ButtonLink>
              }
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <BookingCard
                    booking={booking}
                    variant="full"
                    dishes="collapsible"
                    showDate
                    className="h-full"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
