"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { createBooking, updateBooking } from "@/app/actions/bookings";
import { Alert, Field, Input, Select, Textarea, cn } from "@/components/ui";
import {
  EVENT_TYPES,
  STATUS_LABELS,
  type BookingDetail,
  type BookingStatus,
  type ClientOption,
  type ClientSuggestion,
  type Menu,
  type Room,
  type RoomBookingSlot,
} from "@/lib/types";
import { formatEUR } from "@/lib/quote-utils";
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
  ChoiceCard,
  ChoiceChip,
  ClientSection,
  ColorChips,
  FormCard,
  GroupLabel,
  MenuChoice,
  SubmitBar,
  focusFirstInvalid,
  newAllergyRow,
  type ClientLink,
} from "./form-primitives";
import { QuotePanel } from "./QuotePanel";
import { EMPTY_QUOTE_DRAFT, autoQuoteLines, buildQuotePayload, type QuoteDraft, type QuotePayload } from "./quote-draft";

export interface EventFormProps {
  mode: "create" | "edit";
  booking?: BookingDetail;
  /** Rubrica (solo modifica: per cambiare cliente). */
  clients: ClientOption[];
  rooms: Room[];
  menus: Menu[];
  occupancy: RoomBookingSlot[];
  initialDate: string;
  /** Creazione da una scheda cliente: campi cliente precompilati (il server riusa il cliente per telefono). */
  prefill?: NewClientDraft;
  /**
   * Solo creazione. Admin: un cliente scelto dai suggerimenti va inviato come client_id.
   * La sala invia sempre new_client (il server riusa il cliente per telefono).
   */
  isAdmin?: boolean;
}

interface EventValues {
  event_date: string;
  event_name: string;
  eventType: EventTypeState;
  event_time: string;
  status: BookingStatus;
  adults: number;
  children: number;
  kids_menus: number;
  room_id: string | null;
  menu_id: string | null;
  kids_menu_id: string | null;
  setup_colors: string[];
  setup_notes: string;
  notes: string;
  allergies: AllergyRow[];
}

function initialValues(booking: BookingDetail | undefined, initialDate: string): EventValues {
  if (!booking) {
    return {
      event_date: initialDate,
      event_name: "",
      eventType: { choice: "", custom: "" },
      event_time: "",
      status: "opzione",
      adults: 0,
      children: 0,
      kids_menus: 0,
      room_id: null,
      menu_id: null,
      kids_menu_id: null,
      setup_colors: [],
      setup_notes: "",
      notes: "",
      allergies: [],
    };
  }
  return {
    event_date: booking.event_date,
    event_name: booking.event_name ?? "",
    eventType: eventTypeState(booking.event_type),
    event_time: timeInputValue(booking.event_time),
    status: booking.status,
    adults: booking.adults,
    children: booking.children,
    kids_menus: booking.kids_menus,
    room_id: booking.room_id,
    menu_id: booking.menu_id,
    kids_menu_id: booking.kids_menu_id,
    setup_colors: [...booking.setup_colors],
    setup_notes: booking.setup_notes ?? "",
    notes: booking.notes ?? "",
    allergies: allergyRowsFrom(booking),
  };
}

/** Stato di un evento: non si sceglie a mano, deriva dagli acconti (vedi syncEventStatusFromPayments). */
export function eventStatusLabel(status: BookingStatus): string {
  return status === "opzione" ? "In attesa di acconto" : STATUS_LABELS[status];
}

/**
 * "Crea evento" (e modifica di un evento). Sezioni in colonna, preventivo live a destra su desktop
 * e sotto il form su mobile. In modifica il preventivo non è mostrato (si gestisce dalla scheda).
 */
export function EventForm({
  mode,
  booking,
  clients,
  rooms,
  menus,
  occupancy,
  initialDate,
  prefill,
  isAdmin = false,
}: EventFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = mode === "edit";

  const [values, setValues] = useState<EventValues>(() => initialValues(booking, initialDate));
  const [clientId, setClientId] = useState<string | null>(booking?.client_id ?? null);
  const [newClient, setNewClient] = useState<NewClientDraft>(prefill ?? { full_name: "", phone: "", email: "" });
  const [linkedClient, setLinkedClient] = useState<ClientSuggestion | null>(null);
  const [createQuote, setCreateQuote] = useState(true);
  const [quote, setQuote] = useState<QuoteDraft>(EMPTY_QUOTE_DRAFT);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  /** Ogni modifica dell'utente toglie gli errori visibili: si ricalcolano alla prossima pressione di "salva". */
  const change = (changes: Partial<EventValues>) => {
    setErrors({});
    setValues((v) => ({ ...v, ...changes }));
  };
  const changeQuote = (changes: Partial<QuoteDraft>) => {
    setErrors({});
    setQuote((q) => ({ ...q, ...changes }));
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
  const adultMenus = menus.filter((m) => !m.is_kids && (m.active || m.id === values.menu_id));
  const kidsMenuOptions = menus.filter((m) => m.is_kids && (m.active || m.id === values.kids_menu_id));
  const roomOptions = rooms.filter((r) => r.active || r.id === values.room_id);
  const selectedMenu = menus.find((m) => m.id === values.menu_id) ?? null;
  const selectedKidsMenu = menus.find((m) => m.id === values.kids_menu_id) ?? null;
  const autoLines = autoQuoteLines(
    {
      adults: values.adults,
      kids_menus: values.kids_menus,
      menu: selectedMenu,
      kids_menu: selectedKidsMenu,
    },
    quote.priceOverrides,
  );
  const quoteLines = [...autoLines, ...quote.extra];
  const warnings = roomWarnings({
    roomId: values.room_id,
    eventDate: values.event_date,
    covers,
    rooms,
    occupancy,
    bookingId: booking?.id,
  });
  const hasActiveRooms = rooms.some((r) => r.active);
  const hasActiveAdultMenus = adultMenus.some((m) => m.active);
  const hasActiveKidsMenus = kidsMenuOptions.some((m) => m.active);
  const activeKidsMenus = kidsMenuOptions.filter((m) => m.active);
  // Con un solo menù bambini attivo lo si sceglie in automatico appena servono menù bambini.
  const soleKidsMenuId = activeKidsMenus.length === 1 ? activeKidsMenus[0].id : null;

  // Di norma ogni bambino prende il menù bambini: il contatore segue i bambini finché non lo si cambia a mano.
  const changeChildren = (n: number) => {
    const synced = values.kids_menus === values.children;
    const kidsMenus = synced ? n : Math.min(values.kids_menus, n);
    change({
      children: n,
      kids_menus: kidsMenus,
      kids_menu_id: values.kids_menu_id ?? (kidsMenus > 0 ? soleKidsMenuId : null),
    });
  };

  const cancelHref = isEdit && booking
    ? `/admin/prenotazioni/${booking.id}`
    : `/admin/agenda?date=${values.event_date || initialDate}&view=day`;

  const toggleColor = (color: string) =>
    change({
      setup_colors: values.setup_colors.includes(color)
        ? values.setup_colors.filter((c) => c !== color)
        : [...values.setup_colors, color],
    });

  const updateAllergy = (index: number, changes: Partial<Omit<AllergyRow, "key">>) =>
    change({ allergies: values.allergies.map((a, i) => (i === index ? { ...a, ...changes } : a)) });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save();
  };

  /** Salva il form. Lo stato inviato è quello attuale: il server ricalcola gli eventi e mantiene saldato/annullato. */
  const save = () => {
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
    if (!values.event_name.trim()) add("event_name", "Inserisci il nome dell’evento");
    if (!eventType) add("event_type", "Scegli il tipo di evento");
    if (covers < 1) add("adults", "Indicare almeno un coperto");
    if (values.kids_menus > values.children) add("kids_menus", "I menù bambini non possono superare i bambini");
    Object.assign(local, validateAllergies(values.allergies));

    let quotePayload: QuotePayload | null = null;
    if (!isEdit && createQuote) {
      const built = buildQuotePayload(quote, quoteLines);
      Object.assign(local, built.errors);
      quotePayload = built.payload;
    }

    setErrors(local);
    if (Object.keys(local).length > 0) {
      setFormError("Controlla i campi evidenziati.");
      focusFirstInvalid(formRef.current);
      return;
    }

    const payload = {
      kind: "evento",
      ...(isEdit
        ? { client_id: clientId }
        : isAdmin && linkedClient
          ? { client_id: linkedClient.id }
          : { new_client: newClientPayload(newClient) }),
      event_name: values.event_name.trim(),
      event_type: eventType,
      event_date: values.event_date,
      event_time: values.event_time || null,
      room_id: values.room_id,
      adults: values.adults,
      children: values.children,
      kids_menus: values.kids_menus,
      menu_id: values.menu_id,
      kids_menu_id: values.kids_menu_id,
      setup_colors: values.setup_colors,
      setup_notes: values.setup_notes.trim() || null,
      status: values.status,
      notes: values.notes.trim() || null,
      allergies: allergyPayload(values.allergies),
      ...(isEdit ? {} : { create_quote: createQuote, quote: createQuote ? quotePayload : null }),
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
      // Con preventivo creato si apre il preventivo; altrimenti la prenotazione (con eventuali avvisi).
      const { id, quote_id, warnings: serverWarnings } = result.data;
      const target = quote_id ? `/admin/preventivi/${quote_id}` : `/admin/prenotazioni/${id}`;
      router.push(serverWarnings.length > 0 ? `${target}?warnings=${encodeWarnings(serverWarnings)}` : target);
    });
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label={isEdit ? "Modifica evento" : "Crea evento"}
      className="flex min-w-0 flex-col gap-6"
    >
      <BookingFormHeader
        title={isEdit ? "Modifica evento" : "Crea evento"}
        date={values.event_date}
        onDateChange={(date) => change({ event_date: date })}
        dateError={first(errors.event_date)}
        backHref={cancelHref}
        backLabel={isEdit ? "Torna al dettaglio" : "Torna all’agenda"}
        submit={{ label: isEdit ? "Salva modifiche" : "Crea evento", pendingLabel: "Salvataggio…", pending }}
      />

      {formError && <Alert tone="danger">{formError}</Alert>}

      <div className={cn("grid min-w-0 gap-6", !isEdit && "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:items-start")}>
        <div className="flex min-w-0 flex-col gap-6">
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

          <FormCard label="Evento">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Nome evento" htmlFor="event-name" required error={first(errors.event_name)} className="sm:col-span-2">
                <Input
                  id="event-name"
                  autoComplete="off"
                  invalid={!!errors.event_name}
                  aria-describedby={describedBy("event-name", !!errors.event_name, false)}
                  value={values.event_name}
                  onChange={(e) => change({ event_name: e.target.value })}
                  placeholder="es. Matrimonio Rossi"
                  maxLength={200}
                />
              </Field>

              <Field label="Tipo evento" htmlFor="event-type" required error={first(errors.event_type)}>
                <Select
                  id="event-type"
                  invalid={!!errors.event_type}
                  aria-describedby={describedBy("event-type", !!errors.event_type, false)}
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

              {values.eventType.choice === "Altro" && (
                <Field label="Specifica il tipo" htmlFor="event-type-custom" hint="Massimo 60 caratteri">
                  <Input
                    id="event-type-custom"
                    autoComplete="off"
                    maxLength={60}
                    value={values.eventType.custom}
                    onChange={(e) => change({ eventType: { ...values.eventType, custom: e.target.value } })}
                    placeholder="es. Festa aziendale"
                  />
                </Field>
              )}

              <Field label="Ora" htmlFor="event-time" error={first(errors.event_time)} hint="Facoltativa">
                <Input
                  id="event-time"
                  type="time"
                  invalid={!!errors.event_time}
                  aria-describedby={describedBy("event-time", !!errors.event_time, true)}
                  value={values.event_time}
                  onChange={(e) => change({ event_time: e.target.value })}
                />
              </Field>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink">Stato</span>
                <p className="rounded-btn border border-sand bg-cream/60 px-3.5 py-2.5 text-[15px] text-ink">{eventStatusLabel(values.status)}</p>
                <span className="text-[13px] text-slate-dark">Si aggiorna da solo con gli acconti registrati.</span>
                {isEdit && (
                  <span className="text-[13px] text-slate-dark">
                    Per segnare saldato o annullare usa le azioni nella scheda della prenotazione.
                  </span>
                )}
              </div>
            </div>
          </FormCard>

          <FormCard label="Coperti">
            <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-3">
              <CountStepper id="adults" label="Adulti" value={values.adults} onChange={(n) => change({ adults: n })} error={first(errors.adults)} />
              <CountStepper
                id="children"
                label="Bambini"
                value={values.children}
                onChange={(n) => changeChildren(n)}
              />
              <CountStepper
                id="kids_menus"
                label="Menù bambini"
                value={values.kids_menus}
                max={values.children}
                onChange={(n) => change({ kids_menus: n, kids_menu_id: values.kids_menu_id ?? (n > 0 ? soleKidsMenuId : null) })}
                hint="Non può superare i bambini"
                error={first(errors.kids_menus)}
              />
            </div>
            <p className="text-[14px] text-slate-dark">
              Totale coperti: <span className="font-serif text-2xl tabular-nums text-ink">{covers}</span>
            </p>
          </FormCard>

          <FormCard label="Sala">
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
            {!hasActiveRooms && <CatalogHint>Nessuna sala attiva. Si può salvare comunque senza assegnare una sala.</CatalogHint>}
            {warnings.map((warning) => (
              <Alert key={warning} tone="warning">
                {warning}
              </Alert>
            ))}
          </FormCard>

          <FormCard label="Menù (facoltativo)">
            <div data-invalid={errors.menu_id ? "true" : undefined} className="flex flex-col gap-3">
              <GroupLabel>Menù adulti</GroupLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ChoiceCard name="menu_id" title="Nessun menù" checked={values.menu_id === null} onSelect={() => change({ menu_id: null })}>
                  <span className="text-[14px] text-slate-dark">Il menù si può scegliere anche più avanti</span>
                </ChoiceCard>
                {adultMenus.map((menu) => (
                  <MenuChoice
                    key={menu.id}
                    name="menu_id"
                    title={menu.name}
                    price={`${formatEUR(menu.price_per_person)} a persona`}
                    items={menu.items}
                    checked={values.menu_id === menu.id}
                    onSelect={() => change({ menu_id: menu.id })}
                  />
                ))}
              </div>
              {!hasActiveAdultMenus && <CatalogHint>Nessun menù adulti attivo: l’evento si può salvare anche senza menù.</CatalogHint>}
              {first(errors.menu_id) && <p className="text-[13px] text-danger">{first(errors.menu_id)}</p>}
            </div>

            <div className="flex flex-col gap-3">
              <GroupLabel>Menù bambini</GroupLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ChoiceCard name="kids_menu_id" title="Nessuno" checked={values.kids_menu_id === null} onSelect={() => change({ kids_menu_id: null })}>
                  <span className="text-[14px] text-slate-dark">Nessun menù bambini</span>
                </ChoiceCard>
                {kidsMenuOptions.map((menu) => (
                  <MenuChoice
                    key={menu.id}
                    name="kids_menu_id"
                    title={menu.name}
                    price={`${formatEUR(menu.price_per_person)} a bambino`}
                    items={menu.items}
                    checked={values.kids_menu_id === menu.id}
                    onSelect={() => change({ kids_menu_id: menu.id, kids_menus: values.kids_menus || values.children })}
                  />
                ))}
              </div>
              {!hasActiveKidsMenus && <CatalogHint>Nessun menù bambini attivo.</CatalogHint>}
              {first(errors.kids_menu_id) && <p className="text-[13px] text-danger">{first(errors.kids_menu_id)}</p>}
            </div>

            <p className="rounded-btn bg-cream/70 px-4 py-3 text-[14px] leading-relaxed text-slate-dark">
              {isEdit
                ? "Cambiando menù, i piatti dell’evento vengono riallineati al nuovo menù. Le personalizzazioni si gestiscono dalla pagina della prenotazione."
                : "Alla creazione i piatti dell’evento vengono copiati dal menù scelto e possono essere personalizzati dalla pagina della prenotazione."}
            </p>
          </FormCard>

          <FormCard label="Allestimento">
            <div className="flex flex-col gap-3">
              <GroupLabel>Colori (scelta multipla)</GroupLabel>
              <ColorChips selected={values.setup_colors} onToggle={toggleColor} disabled={pending} />
            </div>
            <Field label="Descrizione allestimento" htmlFor="setup-notes" error={first(errors.setup_notes)}>
              <Textarea
                id="setup-notes"
                rows={3}
                value={values.setup_notes}
                onChange={(e) => change({ setup_notes: e.target.value })}
                placeholder="Tovaglie, centrotavola, composizioni floreali…"
              />
            </Field>
          </FormCard>

          <FormCard label="Allergie e patologie">
            <AllergyEditor
              rows={values.allergies}
              errors={errors}
              disabled={pending}
              onUpdate={updateAllergy}
              onAdd={() => change({ allergies: [...values.allergies, newAllergyRow()] })}
              onRemove={(index) => change({ allergies: values.allergies.filter((_, i) => i !== index) })}
            />
          </FormCard>

          <FormCard label="Note">
            <Field label="Note interne" htmlFor="notes" error={first(errors.notes)}>
              <Textarea id="notes" rows={4} value={values.notes} onChange={(e) => change({ notes: e.target.value })} />
            </Field>
          </FormCard>
        </div>

        {!isEdit && (
          <div className="min-w-0 lg:sticky lg:top-6">
            <QuotePanel
              enabled={createQuote}
              onEnabledChange={setCreateQuote}
              draft={quote}
              lines={quoteLines}
              onChange={changeQuote}
              errors={errors}
              disabled={pending}
            />
          </div>
        )}
      </div>

      {/* Fuori dalla griglia: il pannello sticky del preventivo si ferma alla fine della griglia e non copre il tasto. */}
      <SubmitBar
        backHref={cancelHref}
        backLabel="Annulla"
        submitLabel={isEdit ? "Salva modifiche" : "Crea evento"}
        pendingLabel="Salvataggio…"
        pending={pending}
      />

    </form>
  );
}

