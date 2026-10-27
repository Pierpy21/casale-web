"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { createBooking, updateBooking } from "@/app/actions/bookings";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import {
  EVENT_TYPES,
  STATUS_LABELS,
  type BookingDetail,
  type BookingStatus,
  type ClientOption,
  type ClientSuggestion,
  type Room,
  type RoomBookingSlot,
} from "@/lib/types";
import { CountStepper } from "./CountStepper";
import {
  allergyPayload,
  allergyRowsFrom,
  describedBy,
  draftFromSuggestion,
  encodeWarnings,
  eventTypeState,
  first,
  mapServerErrors,
  newClientPayload,
  resolveEventType,
  roomWarnings,
  timeInputValue,
  validateAllergies,
  validateNewClient,
  type AllergyRow,
  type Errors,
  type EventTypeState,
  type NewClientDraft,
} from "./booking-form-model";
import {
  AllergyEditor,
  BookingFormHeader,
  CatalogHint,
  ChoiceChip,
  ClientSection,
  FormCard,
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
  /** Titolo dell'appuntamento (non usato per le prenotazioni normali). */
  title: string;
  eventType: EventTypeState;
  event_time: string;
  status: BookingStatus;
  adults: number;
  children: number;
  kids_menus: number;
  room_id: string | null;
  notes: string;
  allergies: AllergyRow[];
}

function initialValues(booking: BookingDetail | undefined, initialDate: string): SimpleValues {
  if (!booking) {
    return {
      event_date: initialDate,
      title: "",
      eventType: { choice: "", custom: "" },
      event_time: "",
      status: "opzione",
      adults: 0,
      children: 0,
      kids_menus: 0,
      room_id: null,
      notes: "",
      allergies: [],
    };
  }
  return {
    event_date: booking.event_date,
    title: booking.event_name ?? "",
    eventType: eventTypeState(booking.event_type),
    event_time: timeInputValue(booking.event_time),
    status: booking.status,
    adults: booking.adults,
    children: booking.children,
    kids_menus: booking.kids_menus,
    room_id: booking.room_id,
    notes: booking.notes ?? "",
    allergies: allergyRowsFrom(booking),
  };
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

  const [values, setValues] = useState<SimpleValues>(() => initialValues(booking, initialDate));
  const [clientId, setClientId] = useState<string | null>(booking?.client_id ?? null);
  const [newClient, setNewClient] = useState<NewClientDraft>(prefill ?? { full_name: "", phone: "", email: "" });
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

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const local: Errors = {};
    const add = (key: string, message: string) => {
      (local[key] ??= []).push(message);
    };

    if (isEdit) {
      if (!clientId) add("client_id", "Seleziona un cliente");
    } else {
      Object.assign(local, validateNewClient(newClient));
    }
    if (!values.event_date) add("event_date", "Data obbligatoria");
    if (!values.event_time) add("event_time", "Indica l’ora");
    if (isAppointment) {
      if (!values.title.trim()) add("event_name", "Inserisci il titolo dell’appuntamento");
      if (!eventType) add("event_type", "Scegli il tipo");
    } else {
      if (covers < 1) add("adults", "Indicare almeno un coperto");
      if (values.kids_menus > values.children) add("kids_menus", "I menù bambini non possono superare i bambini");
    }
    Object.assign(local, validateAllergies(values.allergies));

    setErrors(local);
    if (Object.keys(local).length > 0) {
      setFormError("Controlla i campi evidenziati.");
      focusFirstInvalid(formRef.current);
      return;
    }

    const payload = {
      kind,
      ...(isEdit
        ? { client_id: clientId }
        : isAdmin && linkedClient
          ? { client_id: linkedClient.id }
          : { new_client: newClientPayload(newClient) }),
      event_name: isAppointment ? values.title.trim() : null,
      event_type: isAppointment ? eventType : null,
      event_date: values.event_date,
      event_time: values.event_time || null,
      // Le prenotazioni normali scelgono la sala; per l'appuntamento resta quella salvata (di norma nessuna).
      room_id: isAppointment ? (booking?.room_id ?? null) : values.room_id,
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

    startTransition(async () => {
      if (isEdit && booking) {
        const result = await updateBooking(booking.id, payload);
        if (!result.ok) {
          applyError(result);
          return;
        }
        router.push(`/admin/prenotazioni/${booking.id}`);
        return;
      }

      const result = await createBooking(payload);
      if (!result.ok) {
        applyError(result);
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

      <FormCard>
        <ClientSection
          mode={mode}
          clients={clients}
          currentClient={booking?.client}
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

      <FormCard label={isAppointment ? "Appuntamento" : "Prenotazione"}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {isAppointment && (
            <Field label="Titolo" htmlFor="appointment-title" required error={first(errors.event_name)} className="sm:col-span-2">
              <Input
                id="appointment-title"
                autoComplete="off"
                invalid={!!errors.event_name}
                aria-describedby={describedBy("appointment-title", !!errors.event_name, false)}
                value={values.title}
                onChange={(e) => change({ title: e.target.value })}
                placeholder="es. Sopralluogo, degustazione…"
                maxLength={200}
              />
            </Field>
          )}

          <Field label="Ora" htmlFor="booking-time" required error={first(errors.event_time)}>
            <Input
              id="booking-time"
              type="time"
              invalid={!!errors.event_time}
              aria-describedby={describedBy("booking-time", !!errors.event_time, false)}
              value={values.event_time}
              onChange={(e) => change({ event_time: e.target.value })}
            />
          </Field>

          {isAppointment && (
            <Field label="Tipo evento" htmlFor="appointment-type" required error={first(errors.event_type)}>
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
            <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
              <CountStepper id="adults" label="Adulti" value={values.adults} onChange={(n) => change({ adults: n })} error={first(errors.adults)} />
              <CountStepper
                id="children"
                label="Bambini"
                value={values.children}
                onChange={(n) => change({ children: n, kids_menus: Math.min(values.kids_menus, n) })}
              />
            </div>
            <p className="text-[14px] text-slate-dark">
              Totale coperti: <span className="font-serif text-2xl tabular-nums text-ink">{covers}</span>
            </p>
            {first(errors.kids_menus) && <p className="text-[13px] text-danger">{first(errors.kids_menus)}</p>}
          </FormCard>

          <FormCard label="Sala (facoltativa)">
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
