"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Input, cn } from "@/components/ui";
import type { Dish } from "@/lib/types";
import { normalizeSearch } from "./search";

export interface DishPickerProps {
  /** Id del campo (collegato a <label htmlFor> o <Field htmlFor>). */
  id: string;
  /** Testo del campo: ricerca nel catalogo oppure nome libero. */
  value: string;
  /** Piatti attivi della portata della riga. */
  options: Dish[];
  /** Piatto del catalogo attualmente collegato alla riga (null = testo libero). */
  selectedId?: string | null;
  /** Piatti già presenti nel menù: visibili ma non selezionabili. */
  unavailableIds?: ReadonlySet<string>;
  invalid?: boolean;
  /** Id di un messaggio di errore/aiuto da collegare al campo. */
  describedBy?: string;
  /** Avviso "Nuovo piatto: verrà aggiunto al catalogo" (solo per i menù; i piatti dell'evento sono copie libere). */
  showNewHint?: boolean;
  onChangeText: (text: string) => void;
  onSelect: (dish: Dish) => void;
}

const MAX_RESULTS = 8;

/**
 * Campo combobox per scegliere un piatto del catalogo (ARIA combobox + listbox).
 * Il testo digitato senza selezione resta un nome libero: il server lo collega o crea il piatto.
 */
export function DishPicker({
  id,
  value,
  options,
  selectedId = null,
  unavailableIds,
  invalid,
  describedBy,
  showNewHint = true,
  onChangeText,
  onSelect,
}: DishPickerProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = `${id}-list`;

  const matches = useMemo(() => {
    const q = normalizeSearch(value);
    return options.filter((dish) => normalizeSearch(dish.name).includes(q));
  }, [options, value]);
  const shown = matches.slice(0, MAX_RESULTS);
  const listOpen = open && shown.length > 0;

  const typed = value.trim().length > 0;
  // Con un piatto collegato il testo è il nome del catalogo: nessun avviso "nuovo piatto".
  const isNew =
    selectedId === null && typed && !options.some((dish) => normalizeSearch(dish.name) === normalizeSearch(value));

  function isUnavailable(dish: Dish): boolean {
    return unavailableIds?.has(dish.id) ?? false;
  }

  function choose(dish: Dish) {
    if (isUnavailable(dish)) return;
    setOpen(false);
    setHighlight(-1);
    onSelect(dish);
  }

  /** Prossima voce selezionabile nella direzione indicata (-1 = nessuna). Salta quelle già nel menù. */
  function step(from: number, delta: 1 | -1): number {
    const n = shown.length;
    if (n === 0) return -1;
    let idx = from < 0 ? (delta === 1 ? -1 : n) : from;
    for (let i = 0; i < n; i++) {
      idx = (idx + delta + n) % n;
      if (!isUnavailable(shown[idx])) return idx;
    }
    return -1;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight(step(highlight, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight(step(highlight, -1));
    } else if (event.key === "Enter") {
      // Invio non invia mai l'intero menù: sceglie la voce evidenziata o quella con lo stesso nome.
      event.preventDefault();
      if (!listOpen) return;
      const exact = shown.find((dish) => normalizeSearch(dish.name) === normalizeSearch(value));
      const target = highlight >= 0 ? shown[highlight] : exact;
      if (target) choose(target);
    } else if (event.key === "Escape" && open) {
      // Esc chiude solo la lista, senza chiudere la finestra dell'editor.
      event.preventDefault();
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="relative min-w-0">
        <Input
          id={id}
          role="combobox"
          value={value}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={listOpen && highlight >= 0 ? `${id}-opt-${highlight}` : undefined}
          aria-describedby={describedBy}
          invalid={invalid}
          onChange={(e) => {
            onChangeText(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setHighlight(-1);
          }}
          onKeyDown={handleKeyDown}
        />

        {listOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Piatti del catalogo"
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto border border-sand bg-paper shadow-lg shadow-ink/10"
          >
            {shown.map((dish, index) => {
              const unavailable = isUnavailable(dish);
              return (
                <li
                  key={dish.id}
                  id={`${id}-opt-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  aria-disabled={unavailable || undefined}
                  onMouseDown={(event) => {
                    // Evita che il campo perda il focus prima della selezione.
                    event.preventDefault();
                    choose(dish);
                  }}
                  onMouseEnter={() => {
                    if (!unavailable) setHighlight(index);
                  }}
                  className={cn(
                    "px-3.5 py-2.5",
                    unavailable ? "cursor-not-allowed" : "cursor-pointer",
                    index === highlight ? "bg-cream" : !unavailable && "hover:bg-cream/60",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("text-[15px]", unavailable ? "text-slate" : "text-ink")}>{dish.name}</span>
                    {unavailable && (
                      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-dark">
                        Già nel menù
                      </span>
                    )}
                  </span>
                  {dish.description && (
                    <span className="block truncate text-[13px] text-slate-dark">{dish.description}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isNew && showNewHint && (
        <p className="text-[13px] text-slate">Nuovo piatto: verrà aggiunto al catalogo se non esiste già.</p>
      )}
    </div>
  );
}
