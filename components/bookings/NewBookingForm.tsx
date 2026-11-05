"use client";

import { useEffect, useState } from "react";
import { parseDateParam } from "@/components/agenda/agenda-utils";
import { BookingForm, type BookingFormProps } from "./BookingForm";

const NEW_BOOKING_PATH = "/admin/prenotazioni/nuova";

/**
 * Data dell'URL aperto davvero, letta quando il modulo si carica (prima dell'idratazione).
 * Offline il service worker serve la copia preparata senza data (?tipo=… soltanto) e Next riscrive l'indirizzo con
 * quello della copia: senza questa lettura la data scelta nel calendario andrebbe persa. Usata una volta sola.
 */
let loadedDate: string | null = (() => {
  if (typeof window === "undefined" || window.location.pathname !== NEW_BOOKING_PATH) return null;
  const date = new URLSearchParams(window.location.search).get("date");
  return date ? parseDateParam(date) : null;
})();

/** Form di creazione: come BookingForm, ma con la data dell'URL originale se la pagina arriva dalla copia offline. */
export function NewBookingForm(props: BookingFormProps) {
  const [initialDate, setInitialDate] = useState(props.initialDate);

  useEffect(() => {
    const date = loadedDate;
    loadedDate = null;
    // Dopo il montaggio (niente differenze con l'HTML): il form riparte, vuoto, sulla data giusta.
    if (date && date !== props.initialDate) setInitialDate(date);
  }, [props.initialDate]);

  return <BookingForm key={initialDate} {...props} initialDate={initialDate} />;
}
