import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { ButtonLink, Button, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getClients } from "@/lib/data/clients";
import type { ClientWithStats } from "@/lib/types";

export const metadata: Metadata = {
  title: "Clienti · Casale del Notaio",
};

type SearchParams = Promise<{ q?: string }>;

function fullName(c: Pick<ClientWithStats, "first_name" | "last_name">): string {
  return `${c.first_name} ${c.last_name}`;
}

function taxIds(c: Pick<ClientWithStats, "tax_code" | "vat_number">): string {
  return [c.tax_code, c.vat_number].filter(Boolean).join(" · ") || "—";
}

function nextEvent(c: Pick<ClientWithStats, "next_event_date">): string {
  return c.next_event_date ? formatIt(toDate(c.next_event_date), "d MMM yyyy") : "—";
}

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const term = q.trim().slice(0, 100);
  const clients = await getClients(term);

  const count = `${clients.length} ${clients.length === 1 ? "cliente" : "clienti"}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Anagrafica"
        title="Clienti"
        description={term ? `${count} per “${term}”.` : `${count} in anagrafica.`}
        actions={
          <ButtonLink href="/admin/clienti/nuovo" variant="primary" size="md">
            <Plus aria-hidden="true" className="size-4" />
            Nuovo cliente
          </ButtonLink>
        }
      />

      <form
        role="search"
        action="/admin/clienti"
        method="get"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <Field label="Cerca per nome o telefono" htmlFor="q" className="sm:max-w-md sm:flex-1">
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={term}
            placeholder="Es. Rossi oppure 340"
            autoComplete="off"
          />
        </Field>
        <div className="flex gap-3">
          <Button type="submit" variant="primary" size="md">
            Cerca
          </Button>
          {term && (
            <ButtonLink href="/admin/clienti" variant="ghost" size="md">
              Azzera
            </ButtonLink>
          )}
        </div>
      </form>

      {clients.length === 0 ? (
        <EmptyState
          title={term ? "Nessun cliente trovato" : "Nessun cliente in anagrafica"}
          description={
            term
              ? "Prova con un altro nome o con il numero di telefono."
              : "Aggiungi il primo cliente per iniziare a organizzare i banchetti."
          }
          action={
            term ? undefined : (
              <ButtonLink href="/admin/clienti/nuovo" variant="outline" size="md">
                Nuovo cliente
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto border border-sand bg-paper lg:block">
            <table className="w-full min-w-[56rem] text-left text-[14px]">
              <caption className="sr-only">Elenco dei clienti</caption>
              <thead className="border-b border-sand bg-cream/60 text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
                <tr>
                  <th scope="col" className="px-4 py-3">Nome</th>
                  <th scope="col" className="px-4 py-3">Telefono</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">CF / P.IVA</th>
                  <th scope="col" className="px-4 py-3 text-right">Eventi</th>
                  <th scope="col" className="px-4 py-3">Prossimo evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {clients.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-cream/50">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                      <Link
                        href={`/admin/clienti/${c.id}`}
                        className="rounded-[2px] underline-offset-4 hover:text-petrol hover:underline"
                      >
                        {fullName(c)}
                      </Link>
                    </th>
                    <td className="px-4 py-3 tabular-nums text-slate-dark">{c.phone}</td>
                    <td className="px-4 py-3 text-slate-dark">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-dark">{taxIds(c)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.bookings_count}</td>
                    <td className="px-4 py-3 text-slate-dark">{nextEvent(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 lg:hidden">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/clienti/${c.id}`}
                  className="flex flex-col gap-2 border border-sand bg-paper p-4 transition-colors duration-200 hover:border-petrol/60 hover:bg-cream/40"
                >
                  <span className="font-serif text-xl leading-tight text-ink">{fullName(c)}</span>
                  <span className="text-[14px] tabular-nums text-slate-dark">{c.phone}</span>
                  {c.email && <span className="truncate text-[14px] text-slate-dark">{c.email}</span>}
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 border-t border-sand pt-2 text-[12px] font-medium uppercase tracking-[0.12em] text-bronze">
                    <span>
                      {c.bookings_count} {c.bookings_count === 1 ? "evento" : "eventi"}
                    </span>
                    <span>Prossimo: {nextEvent(c)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
