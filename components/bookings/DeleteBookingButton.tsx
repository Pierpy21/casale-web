"use client";

import { useRouter } from "next/navigation";
import { deleteBooking } from "@/app/actions/bookings";
import { ConfirmAction } from "./ConfirmAction";

export function DeleteBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Elimina"
      variant="danger"
      title="Eliminare la prenotazione?"
      description="L’operazione non può essere annullata. La prenotazione verrà rimossa dall’agenda."
      confirmLabel="Elimina definitivamente"
      pendingLabel="Eliminazione…"
      run={() => deleteBooking(bookingId)}
      onSuccess={() => router.push("/admin/agenda")}
    />
  );
}
