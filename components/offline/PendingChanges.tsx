"use client";

import Link from "next/link";
import type { EntityRef } from "@/lib/offline/contract";
import { Alert } from "@/components/ui";
import { useOfflineQueue } from "./OfflineProvider";

/** Come nominare il record nel messaggio ("…su questa prenotazione"). */
const PLACE: Partial<Record<EntityRef["type"], string>> = {
  booking: "questa prenotazione",
  quote: "questo preventivo",
  client: "questo cliente",
  payment: "questo pagamento",
  menu: "questo menù",
  dish: "questo piatto",
  room: "questa sala",
};

/**
 * Avviso sulle modifiche in coda relative a un singolo record (es. una prenotazione).
 * Non renderizza nulla se non ce ne sono.
 */
export function PendingChanges({ entity }: { entity: EntityRef }) {
  const { items } = useOfflineQueue();
  const mine = items.filter((m) => m.entity?.type === entity.type && m.entity?.id === entity.id);
  if (mine.length === 0) return null;

  const total = mine.length;
  const attention = mine.filter((m) => m.status === "conflict" || m.status === "error").length;
  const place = PLACE[entity.type] ?? "questa scheda";

  return (
    <Alert tone={attention > 0 ? "danger" : "warning"}>
      <p>
        {`Hai ${total} ${total === 1 ? "modifica in attesa" : "modifiche in attesa"} di invio su ${place}.`}
        {attention > 0 && ` ${attention} ${attention === 1 ? "richiede" : "richiedono"} una scelta.`}
      </p>
      <Link href="/admin/sincronizzazione" className="mt-1 inline-block font-medium text-petrol underline-offset-4 hover:underline">
        Vedi le modifiche in attesa
      </Link>
    </Alert>
  );
}
