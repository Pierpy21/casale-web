"use client";

import { useRouter } from "next/navigation";
import { deleteBooking } from "@/app/actions/bookings";
import { submitMutation } from "@/lib/offline/submit";
import { ConfirmAction } from "./ConfirmAction";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Eliminazione definitiva: preventivi e acconti collegati vengono eliminati insieme, con avviso nella conferma. */
export function DeleteBookingButton({
  bookingId,
  quotesCount = 0,
  paymentsCount = 0,
  expectedUpdated,
}: {
  bookingId: string;
  quotesCount?: number;
  paymentsCount?: number;
  /** `updated_at` della prenotazione letto con la pagina (controllo di conflitto offline). */
  expectedUpdated?: string;
}) {
  const router = useRouter();
  const linked = [
    quotesCount > 0 ? plural(quotesCount, "preventivo", "preventivi") : null,
    paymentsCount > 0 ? plural(paymentsCount, "acconto registrato", "acconti registrati") : null,
  ].filter(Boolean);
  const description =
    linked.length > 0
      ? `Attenzione: verranno eliminati definitivamente anche ${linked.join(" e ")}. L’operazione non può essere annullata e la prenotazione verrà rimossa dall’agenda.`
      : "L’operazione non può essere annullata. La prenotazione verrà rimossa dall’agenda.";

  return (
    <ConfirmAction
      label="Elimina"
      variant="danger"
      title="Eliminare la prenotazione?"
      description={description}
      confirmLabel="Elimina definitivamente"
      pendingLabel="Eliminazione…"
      run={() =>
        submitMutation("bookings.deleteBooking", deleteBooking, [bookingId], {
          label: "Elimina prenotazione",
          entity: { type: "booking", id: bookingId },
          expectedUpdated,
        })
      }
      onSuccess={() => router.push("/admin/agenda")}
    />
  );
}
