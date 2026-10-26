"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { searchClients } from "@/app/actions/clients";
import { Input, cn } from "@/components/ui";
import type { ClientSuggestion } from "@/lib/types";
import { suggestionFullName } from "./booking-form-model";

/** Attesa dopo l'ultima lettera prima di interrogare il server. */
const DEBOUNCE_MS = 200;
/** Sotto questa lunghezza il server non cerca (risponde []): inutile chiamarlo. */
const MIN_CHARS = 2;

export interface ClientNameComboboxProps {
  /** Id del campo (collegato a <Field htmlFor>). */
  id: string;
  /** Nome digitato (campo "Nome" del nuovo cliente). */
  value: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  onChangeText: (text: string) => void;
  /** Suggerimento scelto: il chiamante riempie nome, cellulare ed email. */
  onSelect: (client: ClientSuggestion) => void;
}

/**
 * Campo "Nome" con suggerimenti dalla rubrica (ARIA combobox + listbox, come DishPicker).
 * La ricerca parte solo dai gesti dell'utente (digitazione): la scelta di un suggerimento
 * non rilancia la ricerca. Le risposte vecchie vengono scartate con un id di richiesta.
 */
export function ClientNameCombobox({ id, value, invalid, describedBy, disabled, onChangeText, onSelect }: ClientNameComboboxProps) {
  const [results, setResults] = useState<ClientSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestRef = useRef(0);
  const listId = `${id}-list`;

  const listOpen = open && results.length > 0;

  // Annulla la ricerca in attesa e invalida quella in corso (la sua risposta non sarà più usata).
  function cancelSearch() {
    clearTimeout(timerRef.current);
    requestRef.current += 1;
    setLoading(false);
  }

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      requestRef.current += 1;
    },
    [],
  );

  function scheduleSearch(text: string) {
    cancelSearch();
    const term = text.trim();
    if (term.length < MIN_CHARS) {
      setResults([]);
      setHighlight(-1);
      return;
    }
    const requestId = requestRef.current;
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      let found: ClientSuggestion[] = [];
      try {
        const res = await searchClients(term);
        if (res.ok) found = res.data;
      } catch {
        found = [];
      }
      if (requestId !== requestRef.current) return;
      setLoading(false);
      setResults(found);
      setHighlight(-1);
    }, DEBOUNCE_MS);
  }

  function choose(client: ClientSuggestion) {
    cancelSearch();
    setResults([]);
    setOpen(false);
    setHighlight(-1);
    onSelect(client);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => {
        if (h < 0) return delta === 1 ? 0 : results.length - 1;
        return (h + delta + results.length) % results.length;
      });
    } else if (event.key === "Enter") {
      // Con la lista aperta Invio non invia il form: sceglie la voce evidenziata oppure chiude la lista.
      if (!listOpen) return;
      event.preventDefault();
      const target = highlight >= 0 ? results[highlight] : undefined;
      if (target) choose(target);
      else setOpen(false);
    } else if (event.key === "Escape" && listOpen) {
      event.preventDefault();
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <div className="relative min-w-0">
      <Input
        id={id}
        role="combobox"
        autoComplete="off"
        autoCapitalize="words"
        disabled={disabled}
        value={value}
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listId : undefined}
        aria-activedescendant={listOpen && highlight >= 0 ? `${id}-opt-${highlight}` : undefined}
        aria-busy={loading || undefined}
        aria-describedby={describedBy}
        invalid={invalid}
        className="pr-10"
        placeholder="Nome e cognome"
        onChange={(e) => {
          onChangeText(e.target.value);
          setOpen(true);
          scheduleSearch(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setHighlight(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {loading && (
        <LoaderCircle
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate"
        />
      )}

      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Clienti suggeriti"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto border border-sand bg-paper shadow-lg shadow-ink/10"
        >
          {results.map((client, index) => {
            const email = client.email;
            return (
              <li
                key={client.id}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => {
                  // Evita che il campo perda il focus prima della selezione (vale anche per il tocco).
                  event.preventDefault();
                  choose(client);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 px-3.5 py-2.5",
                  index === highlight ? "bg-cream" : "hover:bg-cream/60",
                )}
              >
                <span className="wrap-anywhere text-[15px] text-ink">
                  {suggestionFullName(client)}
                  <span className="text-slate-dark"> · {client.phone}</span>
                </span>
                {email && <span className="block truncate text-[13px] text-slate">{email}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
