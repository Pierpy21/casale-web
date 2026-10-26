"use client";

import Link from "next/link";
import { Check, Plus, Search, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, ButtonLink, Field, Input, cn } from "@/components/ui";
import { SETUP_COLORS, SETUP_COLOR_HEX, type ClientOption, type ClientSuggestion } from "@/lib/types";
import {
  describedBy,
  first,
  nextRowKey,
  suggestionFullName,
  type AllergyRow,
  type Errors,
  type NewClientDraft,
} from "./booking-form-model";
import { ClientNameCombobox } from "./ClientNameCombobox";
import { CourseList } from "./MenuPreview";

/** Id del campo data nell'intestazione (usato anche per il focus dopo un errore). */
export const BOOKING_DATE_ID = "booking-date";

/** Dopo un errore di validazione porta il focus sul primo campo non valido (dopo il rendering). */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  window.setTimeout(() => {
    form?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus();
  }, 0);
}

// ---------------------------------------------------------------------------
// Contenitori e scelte
// ---------------------------------------------------------------------------

/** Card di una sezione del form. L'etichetta è piccola e maiuscola (niente numerazione). */
export function FormCard({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-5 rounded-[2px] border border-sand bg-paper p-4 shadow-sm shadow-ink/5 sm:p-6", className)}>
      {label && <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">{label}</h2>}
      {children}
    </section>
  );
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">{children}</p>;
}

/** Scelta singola a card (radio nascosto + card visiva, accessibile da tastiera). */
export function ChoiceCard({
  name,
  checked,
  onSelect,
  title,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  children?: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex min-w-0 cursor-pointer flex-col gap-3 rounded-btn border bg-paper p-4 transition-colors duration-200 hover:border-slate focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-petrol",
        checked ? "border-petrol bg-petrol/5 ring-1 ring-petrol" : "border-sand",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={() => onSelect()} className="sr-only" />
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 wrap-anywhere font-serif text-xl leading-tight text-ink">{title}</span>
        {checked && <Check aria-hidden="true" className="size-5 shrink-0 text-petrol" />}
      </span>
      {children}
    </label>
  );
}

/** Pillola a tocco ampio (sale): radio nascosto, almeno 44 px di altezza. */
export function ChoiceChip({
  name,
  selected,
  onSelect,
  children,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-btn border px-4 py-2 text-[15px] transition-colors duration-200 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-petrol",
        selected ? "border-petrol bg-petrol text-paper" : "border-slate/50 bg-paper text-ink hover:border-slate",
      )}
    >
      <input type="radio" name={name} checked={selected} onChange={() => onSelect()} className="sr-only" />
      {selected && <Check aria-hidden="true" className="size-4 shrink-0" />}
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}

export function CatalogHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-btn border border-dashed border-slate/40 px-4 py-4 text-[14px] text-slate-dark">
      {children}{" "}
      <Link href="/admin/catalogo" className="font-medium text-petrol underline-offset-2 hover:underline">
        Vai al catalogo
      </Link>
    </p>
  );
}

/** Colori di allestimento (scelta multipla). */
export function ColorChips({ selected, onToggle, disabled }: { selected: string[]; onToggle: (color: string) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Colori allestimento" className="flex flex-wrap gap-2">
      {SETUP_COLORS.map((color) => {
        const on = selected.includes(color);
        return (
          <button
            key={color}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(color)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-btn border px-3.5 py-2 text-[15px] transition-colors duration-200 disabled:opacity-50",
              on ? "border-petrol bg-petrol/10 text-ink" : "border-slate/40 bg-paper text-slate-dark hover:border-slate",
            )}
          >
            <span aria-hidden="true" className="size-4 rounded-full ring-1 ring-ink/25" style={{ backgroundColor: SETUP_COLOR_HEX[color] }} />
            {color}
            {on && <Check aria-hidden="true" className="size-3.5 text-petrol" />}
          </button>
        );
      })}
    </div>
  );
}

/** Scelta del menù (adulti o bambini) con prezzo e portate. */
export function MenuChoice({
  name,
  title,
  price,
  items,
  checked,
  onSelect,
}: {
  name: string;
  title: string;
  price: string;
  items: Parameters<typeof CourseList>[0]["items"];
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <ChoiceCard name={name} title={title} checked={checked} onSelect={onSelect}>
      <span className="text-[14px] font-medium text-petrol">{price}</span>
      <CourseList items={items} className="text-[13px]" />
    </ChoiceCard>
  );
}

// ---------------------------------------------------------------------------
// Allergie
// ---------------------------------------------------------------------------

export function AllergyEditor({
  rows,
  errors,
  disabled,
  onUpdate,
  onAdd,
  onRemove,
}: {
  rows: AllergyRow[];
  errors: Errors;
  disabled?: boolean;
  onUpdate: (index: number, changes: Partial<Omit<AllergyRow, "key">>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 && <p className="text-[14px] text-slate">Nessuna allergia o patologia segnalata.</p>}
      {rows.map((row, index) => {
        const base = `allergy-${index}`;
        const conditionError = first(errors[`allergies.${index}.condition`]);
        return (
          <div key={row.key} className="grid min-w-0 grid-cols-1 gap-4 rounded-btn border border-danger/30 bg-danger/5 p-4 sm:grid-cols-2">
            <Field label="Chi" htmlFor={`${base}-subject`} hint="Lasciare vuoto se riguarda il cliente">
              <Input
                id={`${base}-subject`}
                disabled={disabled}
                value={row.subject_name}
                onChange={(e) => onUpdate(index, { subject_name: e.target.value })}
                placeholder="es. Maria, figlio…"
              />
            </Field>
            <Field label="Allergia o patologia" htmlFor={`${base}-condition`} required error={conditionError}>
              <Input
                id={`${base}-condition`}
                disabled={disabled}
                invalid={!!conditionError}
                aria-describedby={describedBy(`${base}-condition`, !!conditionError, false)}
                value={row.condition}
                onChange={(e) => onUpdate(index, { condition: e.target.value })}
                placeholder="es. Celiachia, lattosio…"
              />
            </Field>
            <Field label="Note" htmlFor={`${base}-notes`} className="sm:col-span-2">
              <Input id={`${base}-notes`} disabled={disabled} value={row.notes} onChange={(e) => onUpdate(index, { notes: e.target.value })} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button variant="ghost" size="sm" onClick={() => onRemove(index)} disabled={disabled}>
                <Trash2 aria-hidden="true" className="size-4" />
                Rimuovi
              </Button>
            </div>
          </div>
        );
      })}
      <div>
        <Button variant="outline" size="sm" onClick={onAdd} disabled={disabled}>
          <Plus aria-hidden="true" className="size-4" />
          Aggiungi allergia o patologia
        </Button>
      </div>
    </div>
  );
}

export function newAllergyRow(): AllergyRow {
  return { key: nextRowKey(), subject_name: "", condition: "", notes: "" };
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

/**
 * Collegamento a un cliente della rubrica scelto dai suggerimenti del campo Nome.
 * `linked` = cliente scelto (null = cliente nuovo). Modificare nome, cellulare o email lo scollega.
 */
export interface ClientLink {
  linked: ClientSuggestion | null;
  onSelect: (client: ClientSuggestion) => void;
  onClear: () => void;
}

/** Chip "Cliente esistente · Mario Rossi" con × per tornare a cliente nuovo (i campi restano compilati). */
function ClientLinkChip({ client, onClear, disabled }: { client: ClientSuggestion; onClear: () => void; disabled?: boolean }) {
  const name = suggestionFullName(client);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-btn border border-petrol bg-petrol/5 py-1.5 pl-3.5 pr-1.5 text-[14px] text-ink">
      <span className="min-w-0 wrap-anywhere">
        Cliente esistente · <span className="font-medium">{name}</span>
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        aria-label={`Rimuovi collegamento a ${name}: torna a cliente nuovo`}
        className="-my-2 ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-btn text-slate-dark transition-colors hover:bg-cream hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/**
 * Cliente nuovo: nome, cellulare, email (il server riusa il cliente se il telefono esiste già).
 * Con `link` il campo Nome suggerisce i clienti esistenti.
 */
export function NewClientFields({
  value,
  errors,
  onChange,
  disabled,
  link,
}: {
  value: NewClientDraft;
  errors: Errors;
  onChange: (changes: Partial<NewClientDraft>) => void;
  disabled?: boolean;
  link?: ClientLink;
}) {
  const nameError = first(errors["new_client.full_name"]);
  const phoneError = first(errors["new_client.phone"]);
  const emailError = first(errors["new_client.email"]);
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Field label="Nome" htmlFor="client-full-name" required error={nameError} className="sm:col-span-2">
        {link ? (
          <ClientNameCombobox
            id="client-full-name"
            value={value.full_name}
            disabled={disabled}
            invalid={!!nameError}
            describedBy={describedBy("client-full-name", !!nameError, false)}
            onChangeText={(text) => onChange({ full_name: text })}
            onSelect={link.onSelect}
          />
        ) : (
          <Input
            id="client-full-name"
            autoComplete="name"
            disabled={disabled}
            invalid={!!nameError}
            aria-describedby={describedBy("client-full-name", !!nameError, false)}
            value={value.full_name}
            onChange={(e) => onChange({ full_name: e.target.value })}
            placeholder="Nome e cognome"
          />
        )}
        {link?.linked && <ClientLinkChip client={link.linked} onClear={link.onClear} disabled={disabled} />}
      </Field>
      <Field label="Cellulare" htmlFor="client-phone" required error={phoneError} hint="Es. +39 340 1234567">
        <Input
          id="client-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          disabled={disabled}
          invalid={!!phoneError}
          aria-describedby={describedBy("client-phone", !!phoneError, true)}
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Field>
      <Field label="Email" htmlFor="client-email" error={emailError}>
        <Input
          id="client-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          disabled={disabled}
          invalid={!!emailError}
          aria-describedby={describedBy("client-email", !!emailError, false)}
          value={value.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </Field>
    </div>
  );
}

/** Ricerca nella rubrica (solo modifica di una prenotazione esistente). */
export function ClientPicker({
  clients,
  selectedId,
  onSelect,
  onCancel,
}: {
  clients: ClientOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const digits = normalized.replace(/\D/g, "");
  const options = clients
    .filter((c) => {
      if (!normalized) return true;
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      return name.includes(normalized) || (digits.length > 0 && c.phone.replace(/\D/g, "").includes(digits));
    })
    .slice(0, 50);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Cerca cliente" htmlFor="client-search" hint="Per nome, cognome o telefono">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate" />
          <Input
            id="client-search"
            type="search"
            autoComplete="off"
            aria-describedby="client-search-hint"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="es. Rossi, 340…"
            className="pl-10"
          />
        </div>
      </Field>

      {options.length === 0 ? (
        <p className="rounded-btn border border-dashed border-slate/40 px-4 py-6 text-center text-[14px] text-slate">
          Nessun cliente corrisponde alla ricerca.
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col divide-y divide-sand overflow-y-auto rounded-btn border border-sand bg-paper">
          {options.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex min-h-14 w-full min-w-0 items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-cream",
                    active && "bg-petrol/5",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="wrap-anywhere font-medium text-ink">
                      {c.first_name} {c.last_name}
                    </span>
                    <span className="text-[13px] text-slate-dark">{c.phone}</span>
                  </span>
                  {active && <Check aria-hidden="true" className="size-5 shrink-0 text-petrol" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {onCancel && (
        <div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Annulla
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Sezione cliente. Creazione: sempre nuovo cliente (nome, cellulare, email).
 * Modifica: cliente attuale con "Cambia cliente" che apre la ricerca in rubrica.
 */
export function ClientSection({
  mode,
  clients,
  currentClient,
  clientId,
  onClientIdChange,
  newClient,
  onNewClientChange,
  clientLink,
  errors,
  disabled,
}: {
  mode: "create" | "edit";
  clients: ClientOption[];
  currentClient?: ClientOption;
  clientId: string | null;
  onClientIdChange: (id: string) => void;
  newClient: NewClientDraft;
  onNewClientChange: (changes: Partial<NewClientDraft>) => void;
  /** Creazione: suggerimenti dalla rubrica sul campo Nome (senza, il campo è semplice). */
  clientLink?: ClientLink;
  errors: Errors;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);

  if (mode === "create") {
    return (
      <NewClientFields
        value={newClient}
        errors={errors}
        onChange={onNewClientChange}
        disabled={disabled}
        link={clientLink}
      />
    );
  }

  const selected =
    clients.find((c) => c.id === clientId) ?? (currentClient && currentClient.id === clientId ? currentClient : undefined);

  return (
    <div className="flex flex-col gap-4">
      {selected && !picking ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-btn border border-petrol bg-petrol/5 px-4 py-3">
          <div className="min-w-0">
            <p className="wrap-anywhere font-medium text-ink">
              {selected.first_name} {selected.last_name}
            </p>
            <p className="text-[14px] text-slate-dark">{selected.phone}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPicking(true)} disabled={disabled}>
            Cambia cliente
          </Button>
        </div>
      ) : (
        <ClientPicker
          clients={clients}
          selectedId={clientId}
          onSelect={(id) => {
            onClientIdChange(id);
            setPicking(false);
          }}
          onCancel={selected ? () => setPicking(false) : undefined}
        />
      )}
      {first(errors.client_id) && <p className="text-[13px] text-danger">{first(errors.client_id)}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intestazione e barra finale
// ---------------------------------------------------------------------------

/**
 * Intestazione compatta: titolo a sinistra; a destra la DATA in grande (è il campo data del form)
 * e il link di ritorno.
 */
export function BookingFormHeader({
  title,
  date,
  onDateChange,
  dateError,
  backHref,
  backLabel,
  submit,
}: {
  title: string;
  date: string;
  onDateChange: (date: string) => void;
  dateError?: string;
  backHref: string;
  backLabel: string;
  /** Tasto di invio anche in alto, sulla stessa riga della data (oltre a quello in fondo al form). */
  submit?: { label: string; pendingLabel: string; pending: boolean };
}) {
  return (
    <header className="flex min-w-0 flex-col gap-4 border-b border-sand pb-5 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="min-w-0 text-3xl leading-tight wrap-anywhere lg:text-4xl">{title}</h1>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:justify-end">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={BOOKING_DATE_ID} className="text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">
            Data
          </label>
          <input
            id={BOOKING_DATE_ID}
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? `${BOOKING_DATE_ID}-error` : undefined}
            className={cn(
              "min-w-0 rounded-btn border-0 bg-transparent p-0 font-serif text-2xl leading-tight transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40 sm:text-3xl",
              dateError ? "text-danger" : "text-ink",
            )}
          />
          {dateError && (
            <p id={`${BOOKING_DATE_ID}-error`} className="text-[13px] text-danger">
              {dateError}
            </p>
          )}
        </div>
        <ButtonLink href={backHref} variant="ghost" size="sm">
          ← {backLabel}
        </ButtonLink>
        {submit && (
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={submit.pending}
            aria-busy={submit.pending || undefined}
            className="w-full sm:w-auto"
          >
            {submit.pending ? submit.pendingLabel : submit.label}
          </Button>
        )}
      </div>
    </header>
  );
}

export function SubmitBar({
  backHref,
  backLabel,
  submitLabel,
  pendingLabel,
  pending,
}: {
  backHref: string;
  backLabel: string;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-sand pt-6 sm:flex-row sm:items-center sm:justify-between">
      <ButtonLink href={backHref} variant="ghost" size="md" className="w-full sm:w-auto">
        {backLabel}
      </ButtonLink>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending}
        aria-busy={pending || undefined}
        className="w-full sm:w-auto"
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}
