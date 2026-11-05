"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { createBooking, updateBooking } from "@/app/actions/bookings";
import { isQueued, submitMutation, updatedAtOf } from "@/lib/offline/submit";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import {
  EVENT_TYPES,
  STATUS_LABELS,
  type BookingDetail,
  type BookingMeal,
  type BookingStatus,
  type ClientOption,
  type ClientSuggestion,
  type Room,
  type RoomBookingSlot,
} from "@/lib/types";
import { CountStepper } from "./CountStepper";
import { bookingPersonName } from "./format";
import {
  allergyPayload,
  allergyRowsFrom,
  describedBy,
  draftFromSuggestion,
  encodeWarnings,
  eventTypeState,
  first,
  guestPayload,
  mapServerErrors,
  newClientPayload,
  resolveEventType,
  roomWarnings,
  timeInputValue,
  validateAllergies,
  validateGuest,
  validateNewClient,
  type AllergyRow,
  type Errors,
  type EventTypeState,
  type GuestDraft,
  type NewClientDraft,
} from "./booking-form-model";
import {
  AllergyEditor,
  BookingFormHeader,
  CatalogHint,
  ChoiceChip,
  ClientSection,
  FormCard,
  GuestFields,
  MealChoice,
  SubmitBar,
  focusFirstInvalid,
  newAllergyRow,
  type ClientLink,
} from "./form-primitives";

export type SimpleKind = "normale" | "appuntamento";

export interface SimpleBookingFormProps {
  kind: SimpleKind;
  mode: "create" | "edit";
  booking?: BookingDetail;
  clients: ClientOption[];
  rooms: Room[];
  occupancy: RoomBookingSlot[];
  initialDate: string;
  /** Creazione da una scheda cliente: campi cliente precompilati. */
  prefill?: NewClientDraft;
  /**
   * Solo creazione. Admin: un cliente scelto dai suggerimenti va inviato come client_id.
   * La sala invia sempre new_client (il server riusa il cliente per telefono).
   */
  isAdmin?: boolean;
}

interface SimpleValues {
  event_date: string;
  eventType: EventTypeState;
  /** Orario (solo appuntamento, facoltativo). */
  event_time: string;
  /** Pasto (solo prenotazione normale, facoltativo): pranzo, cena o nessuno. */
  meal: BookingMeal | null;
  status: BookingStatus;
  adults: number;
  children: number;
  kids_menus: number;
  room_id: string | null;
  /** Tavolo come testo del campo (vuoto = nessun tavolo). Solo prenotazioni normali. */
  table_number: string;
  notes: string;
  allergies: AllergyRow[];
}

function initialValues(booking: BookingDetail | undefined, initialDate: string): SimpleValues {
  if (!booking) {
    return {
      event_date: initialDate,
      eventType: { choice: "", custom: "" },
      event_time: "",
      meal: null,
      status: "opzione",
      adults: 0,
      children: 0,
      kids_menus: 0,
      room_id: null,
      table_number: "",
      notes: "",
      allergies: [],
    };
  }
  return {
    event_date: booking.event_date,
    eventType: eventTypeState(booking.event_type),
    event_time: timeInputValue(booking.event_time),
    meal: booking.meal,
    status: booking.status,
    adults: booking.adults,
    children: booking.children,
    kids_menus: booking.kids_menus,
    room_id: booking.room_id,
    table_number: booking.table_number ? String(booking.table_number) : "",
    notes: booking.notes ?? "",
    allergies: allergyRowsFrom(booking),
  };
}

/** Tavolo digitato → numero 1-9999, null se vuoto o non valido. */
function parseTable(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null;
}

/** Stati scelgibili a mano: l'appuntamento ha Attesa/Confermato/Annullato; la prenotazione normale è sempre confermata, annullabile solo in modifica dall'admin. */
const APPOINTMENT_STATUSES: BookingStatus[] = ["opzione", "confermato", "annullato"];
const NORMAL_STATUSES: BookingStatus[] = ["confermato", "annullato"];

const TITLES: Record<SimpleKind, { create: string; edit: string; submit: string }> = {
  normale: { create: "Nuova prenotazione", edit: "Modifica prenotazione", submit: "Crea prenotazione" },
  appuntamento: { create: "Nuovo appuntamento", edit: "Modifica appuntamento", submit: "Crea appuntamento" },
};

/**
 * Prenotazione normale (tavolo) e appuntamento. Stesso form con campi diversi per tipo.
 * Niente menù né preventivo: questi tipi non li hanno. Campi nascosti (es. coperti dell'appuntamento) restano invariati in modifica.
 */
/** Stato di una prenotazione normale: confermata, oppure annullata se l'admin l'ha annullata. */
function normalStatusOf(status: BookingStatus): BookingStatus {
  return status === "annullato" ? "annullato" : "confermato";
}

export function SimpleBookingForm({ kind, mode, booking, clients, rooms, occupancy, initialDate, prefill, isAdmin = false }: SimpleBookingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = mode === "edit";
  const isAppointment = kind === "appuntamento";

  const isNormal = kind === "normale";

  const [values, setValues] = useState<SimpleValues>(() => initialValues(booking, initialDate));
  const [clientId, setClientId] = useState<string | null>(booking?.client_id ?? null);
  const [newClient, setNewClient] = useState<NewClientDraft>(prefill ?? { full_name: "", phone: "", email: "" });
  // Prenotazione normale: nome e cellulare dell'ospite (in modifica quelli salvati; in creazione quelli della scheda cliente, se c'è).
  const [guest, setGuest] = useState<GuestDraft>(() =>
    isNormal && booking
      ? { name: booking.guest_name ?? "", phone: booking.guest_phone ?? "" }
      : { name: prefill?.full_name ?? "", phone: prefill?.phone ?? "" },
  );
  const [linkedClient, setLinkedClient] = useState<ClientSuggestion | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const change = (changes: Partial<SimpleValues>) => {
    setErrors({});
    setValues((v) => ({ ...v, ...changes }));
  };
  const changeNewClient = (changes: Partial<NewClientDraft>) => {
    setErrors({});
    // Modificare nome, cellulare o email di un cliente scelto dai suggerimenti lo scollega: torna cliente nuovo.
    if (linkedClient && ("full_name" in changes || "phone" in changes || "email" in changes)) setLinkedClient(null);
    setNewClient((c) => ({ ...c, ...changes }));
  };
  const changeGuest = (changes: Partial<GuestDraft>) => {
    setErrors({});
    setGuest((g) => ({ ...g, ...changes }));
  };
  const clientLink: ClientLink = {
    linked: linkedClient,
    onSelect: (client) => {
      setErrors({});
      setNewClient((c) => draftFromSuggestion(client, c));
      setLinkedClient(client);
    },
    onClear: () => setLinkedClient(null),
  };

  const eventType = resolveEventType(values.eventType);
  const covers = values.adults + values.children;
  const roomOptions = rooms.filter((r) => r.active || r.id === values.room_id);
  const hasActiveRooms = rooms.some((r) => r.active);
  const warnings = roomWarnings({
    roomId: values.room_id,
    eventDate: values.event_date,
    covers,
    rooms,
    occupancy,
    bookingId: booking?.id,
  });

  const cancelHref = isEdit && booking
    ? `/admin/prenotazioni/${booking.id}`
    : `/admin/agenda?date=${values.event_date || initialDate}&view=day`;
  /** Data di ripiego se il campo data viene svuotato: quella della prenotazione (in modifica) o quella iniziale. */
  const dateFallback = booking?.event_date ?? initialDate;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const local: Errors = {};
    const add = (key: string, message: string) => {
      (local[key] ??= []).push(message);
    };

    if (isNormal) {
      Object.assign(local, validateGuest(guest));
    } else if (isEdit) {
      if (!clientId) add("client_id", "Seleziona un cliente");
    } else {
      Object.assign(local, validateNewClient(newClient));
    }
    // Data: se il campo è stato svuotato si usa la data iniziale (la prenotazione ha sempre una data).
    const eventDate = values.event_date || dateFallback;
    if (!values.event_date) setValues((v) => ({ ...v, event_date: eventDate }));
    if (!isAppointment && values.table_number.trim() !== "" && parseTable(values.table_number) === null) {
      add("table_number", "Numero del tavolo non valido: usa un numero da 1 a 9999.");
    }
    Object.assign(local, validateAllergies(values.allergies));

    setErrors(local);
    if (Object.keys(local).length > 0) {
      setFormError("Controlla i campi evidenziati.");
      focusFirstInvalid(formRef.current);
      return;
    }

    // Normale: l'ospite sulla prenotazione, nessun cliente di rubrica. Appuntamento: cliente di rubrica.
    const personPayload = isNormal
      ? guestPayload(guest)
      : isEdit
        ? { client_id: clientId }
        : isAdmin && linkedClient
          ? { client_id: linkedClient.id }
          : { new_client: newClientPayload(newClient) };

    const payload = {
      kind,
      ...personPayload,
      event_type: isAppointment ? eventType : null,
      event_date: eventDate,
      // Appuntamento: orario. Prenotazione normale: pasto (pranzo o cena), senza orario.
      meal: isAppointment ? null : values.meal,
      event_time: isAppointment ? values.event_time || null : null,
      // Le prenotazioni normali scelgono la sala; per l'appuntamento resta quella salvata (di norma nessuna).
      room_id: isAppointment ? (booking?.room_id ?? null) : values.room_id,
      // Tavolo solo per le prenotazioni normali; l'appuntamento non lo invia (resta com'è).
      ...(isAppointment ? {} : { table_number: parseTable(values.table_number) }),
      adults: isAppointment ? (booking?.adults ?? 0) : values.adults,
      children: isAppointment ? (booking?.children ?? 0) : values.children,
      kids_menus: isAppointment ? (booking?.kids_menus ?? 0) : values.kids_menus,
      menu_id: null,
      kids_menu_id: null,
      setup_colors: booking?.setup_colors ?? [],
      setup_notes: booking?.setup_notes ?? null,
      status: isAppointment ? values.status : normalStatusOf(values.status),
      notes: values.notes.trim() || null,
      allergies: allergyPayload(values.allergies),
    };

    const applyError = (result: { error: string; fieldErrors?: Errors }) => {
      setErrors(mapServerErrors(result.fieldErrors, values.allergies));
      setFormError(result.error);
      focusFirstInvalid(formRef.current);
    };

    const who = isNormal
      ? guest.name.trim()
      : isEdit && booking
        ? bookingPersonName(booking)
        : newClient.full_name.trim();

    startTransition(async () => {
      if (isEdit && booking) {
        const result = await submitMutation("bookings.updateBooking", updateBooking, [booking.id, payload], {
          label: `Modifica prenotazione · ${who}`,
          entity: { type: "booking", id: booking.id },
          expectedUpdated: updatedAtOf(booking),
        });
        if (!result.ok) {
          applyError(result);
          return;
        }
        // Offline: torna al dettaglio (in cache), che mostra le modifiche in attesa.
        router.push(`/admin/prenotazioni/${booking.id}`);
        return;
      }

      const result = await submitMutation("bookings.createBooking", createBooking, [payload, undefined], {
        label: `Nuova prenotazione · ${who || "cliente"}`,
        createsTempId: true,
      });
      if (!result.ok) {
        applyError(result);
        return;
      }
      // Offline: la prenotazione non ha ancora un id reale, quindi si torna all'agenda (in cache).
      if (isQueued(result)) {
        router.push(`/admin/agenda?date=${eventDate}&view=day`);
        return;
      }
      const { id, warnings: serverWarnings } = result.data;
      router.push(
        serverWarnings.length > 0 ? `/admin/prenotazioni/${id}?warnings=${encodeWarnings(serverWarnings)}` : `/admin/prenotazioni/${id}`,
      );
    });
  };

  const title = TITLES[kind][isEdit ? "edit" : "create"];

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label={title}
      className="flex w-full min-w-0 max-w-3xl flex-col gap-6"
    >
      <BookingFormHeader
        title={title}
        date={values.event_date}
        onDateChange={(date) => change({ event_date: date })}
        dateError={first(errors.event_date)}
        backHref={cancelHref}
        backLabel={isEdit ? "Torna al dettaglio" : "Torna all’agenda"}
        submit={{ label: isEdit ? "Salva modifiche" : TITLES[kind].submit, pendingLabel: "Salvataggio…", pending }}
      />

      {formError && <Alert tone="danger">{formError}</Alert>}

      {isNormal ? (
        <FormCard label="Ospite">
          <GuestFields value={guest} errors={errors} onChange={changeGuest} disabled={pending} />
        </FormCard>
      ) : (
        <FormCard>
          <ClientSection
            mode={mode}
            clients={clients}
            currentClient={booking?.client ?? undefined}
            clientId={clientId}
            onClientIdChange={(id) => {
              setErrors({});
              setClientId(id);
            }}
            newClient={newClient}
            onNewClientChange={changeNewClient}
            clientLink={clientLink}
            errors={errors}
            disabled={pending}
          />
        </FormCard>
      )}

      <FormCard label={isAppointment ? "Appuntamento" : "Prenotazione"}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {isAppointment ? (
            <Field label="Ora" htmlFor="booking-time" error={first(errors.event_time)} hint="Facoltativa">
              <Input
                id="booking-time"
                type="time"
                invalid={!!errors.event_time}
                aria-describedby={describedBy("booking-time", !!errors.event_time, true)}
                value={values.event_time}
                onChange={(e) => change({ event_time: e.target.value })}
              />
            </Field>
          ) : (
            <MealChoice value={values.meal} onChange={(meal) => change({ meal })} disabled={pending} />
          )}

          {isAppointment && (
            <Field label="Tipo evento" htmlFor="appointment-type" error={first(errors.event_type)}>
              <Select
                id="appointment-type"
                invalid={!!errors.event_type}
                aria-describedby={describedBy("appointment-type", !!errors.event_type, false)}
                value={values.eventType.choice}
                onChange={(e) => change({ eventType: { ...values.eventType, choice: e.target.value } })}
              >
                <option value="">Scegli…</option>
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {isAppointment && values.eventType.choice === "Altro" && (
            <Field label="Specifica il tipo" htmlFor="appointment-type-custom" hint="Massimo 60 caratteri">
              <Input
                id="appointment-type-custom"
                autoComplete="off"
                maxLength={60}
                value={values.eventType.custom}
                onChange={(e) => change({ eventType: { ...values.eventType, custom: e.target.value } })}
              />
            </Field>
          )}

          {(isAppointment || (isEdit && isAdmin)) && (
            <Field label="Stato" htmlFor="status" error={first(errors.status)} className="sm:col-span-2">
              <Select
                id="status"
                value={isAppointment ? values.status : normalStatusOf(values.status)}
                onChange={(e) => change({ status: e.target.value as BookingStatus })}
              >
                {(isAppointment ? APPOINTMENT_STATUSES : NORMAL_STATUSES).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </FormCard>

      {!isAppointment && (
        <>
          <FormCard label="Coperti">
            {/* Come negli eventi: menù bambini subito dopo gli adulti, seggioloni indipendenti (contano nei coperti). */}
            <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-3">
              <CountStepper id="adults" label="Adulti" value={values.adults} onChange={(n) => change({ adults: n })} error={first(errors.adults)} />
              <CountStepper
                id="kids_menus"
                label="Menù bambini"
                value={values.kids_menus}
                onChange={(n) => change({ kids_menus: n })}
                error={first(errors.kids_menus)}
              />
              <CountStepper id="children" label="Seggioloni" value={values.children} onChange={(n) => change({ children: n })} />
            </div>
            <p className="text-[14px] text-slate-dark">
              Totale coperti: <span className="font-serif text-2xl tabular-nums text-ink">{covers}</span>
            </p>
          </FormCard>

          <FormCard label="Sala e tavolo">
            <div role="radiogroup" aria-label="Sala" className="flex flex-wrap gap-2">
              <ChoiceChip name="room_id" selected={values.room_id === null} onSelect={() => change({ room_id: null })}>
                Da assegnare
              </ChoiceChip>
              {roomOptions.map((room) => (
                <ChoiceChip key={room.id} name="room_id" selected={values.room_id === room.id} onSelect={() => change({ room_id: room.id })}>
                  {room.name} <span className="text-[13px] opacity-75">· fino a {room.capacity}</span>
                </ChoiceChip>
              ))}
            </div>
            {!hasActiveRooms && <CatalogHint>Nessuna sala attiva.</CatalogHint>}
            {/* Tavolo: riga compatta (etichetta a sinistra, numero a destra) come i contatori dei coperti. */}
            <div className="flex min-w-0 flex-col gap-2 border-t border-sand pt-4">
              <div className="flex min-w-0 items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <label htmlFor="table-number" className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">
                    Tavolo
                  </label>
                  <span id="table-number-hint" className="text-[13px] text-slate">
                    Numero del tavolo in sala
                  </span>
                </div>
                <div className="w-24 shrink-0">
                  <Input
                    id="table-number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="off"
                    placeholder="N°"
                    invalid={!!errors.table_number}
                    aria-describedby={errors.table_number ? "table-number-hint table-number-error" : "table-number-hint"}
                    value={values.table_number}
                    onChange={(e) => change({ table_number: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    className="text-center tabular-nums"
                  />
                </div>
              </div>
              {first(errors.table_number) && (
                <p id="table-number-error" className="text-[13px] text-danger">
                  {first(errors.table_number)}
                </p>
              )}
            </div>
            {warnings.map((warning) => (
              <Alert key={warning} tone="warning">
                {warning}
              </Alert>
            ))}
          </FormCard>
        </>
      )}

      <FormCard label="Allergie e patologie">
        <AllergyEditor
          rows={values.allergies}
          errors={errors}
          disabled={pending}
          onUpdate={(index, changes) =>
            change({ allergies: values.allergies.map((a, i) => (i === index ? { ...a, ...changes } : a)) })
          }
          onAdd={() => change({ allergies: [...values.allergies, newAllergyRow()] })}
          onRemove={(index) => change({ allergies: values.allergies.filter((_, i) => i !== index) })}
        />
      </FormCard>

      <FormCard label="Note">
        <Field label="Note" htmlFor="notes" error={first(errors.notes)}>
          <Textarea id="notes" rows={4} value={values.notes} onChange={(e) => change({ notes: e.target.value })} />
        </Field>
      </FormCard>

      <SubmitBar
        backHref={cancelHref}
        backLabel="Annulla"
        submitLabel={isEdit ? "Salva modifiche" : TITLES[kind].submit}
        pendingLabel="Salvataggio…"
        pending={pending}
      />
    </form>
  );
}
