"use client";

import { useState, type KeyboardEvent } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS, type InventoryCategory } from "@/lib/types";

export interface InventoryNewProductFormProps {
  /** Prefisso degli id dei campi (unico nella pagina). */
  idPrefix: string;
  /** Categoria fissa (sezione della lista). Se assente, la si sceglie nel modulo. */
  category?: InventoryCategory;
  /** Nome proposto (es. il testo cercato nella lista). */
  defaultName?: string;
  /** Crea il prodotto. Ritorna il messaggio di errore, o null se è andata a buon fine. */
  onCreate: (input: { name: string; unit: string | null; category: InventoryCategory }) => Promise<string | null>;
  onClose: () => void;
  disabled?: boolean;
}

/**
 * Prodotto a testo libero aggiunto dalla giacenza: nome, unità e (se serve) categoria.
 * Non è un <form>: sta dentro il modulo della giacenza, quindi invio e pulsanti sono gestiti qui.
 */
export function InventoryNewProductForm({ idPrefix, category, defaultName = "", onCreate, onClose, disabled }: InventoryNewProductFormProps) {
  const [name, setName] = useState(defaultName);
  const [unit, setUnit] = useState("");
  const [chosen, setChosen] = useState<InventoryCategory>("altro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Indica il nome del prodotto.");
      return;
    }
    setError(null);
    setBusy(true);
    const message = await onCreate({ name: trimmed, unit: unit.trim() || null, category: category ?? chosen });
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  };

  const onNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submit();
  };

  const locked = busy || disabled;

  return (
    <div role="group" aria-label="Nuovo prodotto" className="flex min-w-0 flex-col gap-4 rounded-[2px] border border-petrol/40 bg-paper p-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nome" htmlFor={`${idPrefix}-name`} required>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={200}
          disabled={locked}
          autoFocus
          enterKeyHint="done"
          onKeyDown={onNameKeyDown}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Pomodori San Marzano"
          className="text-[17px]"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Unità" htmlFor={`${idPrefix}-unit`} hint="Facoltativa, es. kg, bottiglie">
          <Input id={`${idPrefix}-unit`} value={unit} maxLength={40} disabled={locked} onChange={(e) => setUnit(e.target.value)} placeholder="es. kg" />
        </Field>
        {!category && (
          <Field label="Categoria" htmlFor={`${idPrefix}-category`}>
            <Select id={`${idPrefix}-category`} value={chosen} disabled={locked} onChange={(e) => setChosen(e.target.value as InventoryCategory)}>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {INVENTORY_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="md" onClick={onClose} disabled={locked} className="min-h-11">
          Annulla
        </Button>
        <Button variant="primary" size="md" onClick={submit} disabled={locked} aria-busy={busy || undefined} className="min-h-11">
          {busy ? "Salvataggio…" : "Aggiungi"}
        </Button>
      </div>
    </div>
  );
}
