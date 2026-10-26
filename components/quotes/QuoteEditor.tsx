"use client";

import { isValid, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteQuote, updateQuote } from "@/app/actions/quotes";
import { ConfirmAction } from "@/components/bookings/ConfirmAction";
import { Alert, Button, Field, Input, Textarea, buttonClasses } from "@/components/ui";
import { buildQuoteDocumentModel } from "@/lib/documents/quote-model";
import { computeQuoteTotals, formatEUR } from "@/lib/quote-utils";
import type { QuoteLine, QuoteWithBooking } from "@/lib/types";
import { QuotePreview } from "./QuotePreview";

type Errors = Record<string, string[]>;

interface LineRow {
  key: string;
  description: string;
  quantity: string;
  unit_price: string;
}

let rowSeq = 0;
const nextKey = (): string => `line-${++rowSeq}`;

/** Campi numerici tenuti come stringa nel form: "" o non valido contano come 0 nei totali. */
const toNumber = (s: string): number => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function toRow(line: QuoteLine): LineRow {
  return { key: nextKey(), description: line.description, quantity: String(line.quantity), unit_price: String(line.unit_price) };
}

/** Firma dello stato del form, usata per capire se ci sono modifiche non salvate. */
function snapshotOf(
  issuedAt: string,
  validUntil: string,
  rows: LineRow[],
  discount: string,
  vatRate: string,
  notes: string,
): string {
  return JSON.stringify({
    issuedAt,
    validUntil,
    lines: rows.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
    discount,
    vatRate,
    notes,
  });
}

export interface QuoteEditorProps {
  quote: QuoteWithBooking;
}

/** Editor del preventivo con totali live e anteprima del template. Va montato con `key` sulla versione salvata. */
export function QuoteEditor({ quote }: QuoteEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issuedAt, setIssuedAt] = useState(quote.issued_at);
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? "");
  const [rows, setRows] = useState<LineRow[]>(() => quote.lines.map(toRow));
  const [discount, setDiscount] = useState(String(quote.discount));
  const [vatRate, setVatRate] = useState(String(quote.vat_rate));
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshotOf(
      quote.issued_at,
      quote.valid_until ?? "",
      quote.lines.map(toRow),
      String(quote.discount),
      String(quote.vat_rate),
      quote.notes ?? "",
    ),
  );

  const numericLines: QuoteLine[] = rows.map((r) => ({
    description: r.description,
    quantity: toNumber(r.quantity),
    unit_price: toNumber(r.unit_price),
  }));
  const totals = computeQuoteTotals({
    lines: numericLines,
    discount: toNumber(discount),
    vat_rate: toNumber(vatRate),
  });

  // Anteprima = stesso modello di PDF e DOCX, con i valori del form. Una data emissione vuota
  // (campo cancellato) ripiega sulla data salvata: il modello non accetta date invalide.
  const previewModel = buildQuoteDocumentModel({
    ...quote,
    issued_at: isValid(parseISO(issuedAt)) ? issuedAt : quote.issued_at,
    valid_until: validUntil || null,
    lines: numericLines,
    discount: toNumber(discount),
    vat_rate: toNumber(vatRate),
    notes: notes.trim() || null,
  });

  const snapshot = snapshotOf(issuedAt, validUntil, rows, discount, vatRate, notes);
  const dirty = snapshot !== savedSnapshot;

  const updateRow = (index: number, changes: Partial<Omit<LineRow, "key">>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...changes } : r)));
    setErrors({});
    setSaved(false);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey(), description: "", quantity: "1", unit_price: "0" }]);
    setSaved(false);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setErrors({});
    setSaved(false);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    setSaved(false);
    if (rows.length === 0) {
      setErrors({ lines: ["Il preventivo deve avere almeno una riga."] });
      setFormError("Controlla i campi evidenziati.");
      return;
    }
    const currentSnapshot = snapshot;
    startTransition(async () => {
      const result = await updateQuote(quote.id, {
        issued_at: issuedAt,
        valid_until: validUntil || null,
        lines: rows.map((r) => ({ description: r.description, quantity: r.quantity, unit_price: r.unit_price })),
        discount,
        vat_rate: vatRate,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      setSavedSnapshot(currentSnapshot);
      setSaved(true);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      <form onSubmit={onSubmit} noValidate className="no-print flex min-w-0 flex-col gap-6" aria-label="Modifica preventivo">
        {formError && <Alert tone="danger">{formError}</Alert>}

        <section className="grid gap-5 rounded-[2px] border border-sand bg-paper p-5 sm:grid-cols-2 sm:p-6" aria-label="Date">
          <Field label="Data emissione" htmlFor="issued_at" required error={errors.issued_at?.[0]}>
            <Input id="issued_at" type="date" required invalid={!!errors.issued_at} value={issuedAt} onChange={(e) => { setIssuedAt(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="Valido fino al" htmlFor="valid_until" error={errors.valid_until?.[0]} hint="Facoltativa">
            <Input id="valid_until" type="date" invalid={!!errors.valid_until} value={validUntil} onChange={(e) => { setValidUntil(e.target.value); setSaved(false); }} />
          </Field>
        </section>

        <section className="flex flex-col gap-4 rounded-[2px] border border-sand bg-paper p-5 sm:p-6" aria-labelledby="righe-title">
          <div className="flex flex-col gap-1 border-b border-sand pb-3">
            <h2 id="righe-title" className="text-2xl">Righe</h2>
            <p className="text-[13px] text-slate-dark">Prezzi IVA inclusa.</p>
          </div>

          {errors.lines?.[0] && <p className="text-[13px] text-danger">{errors.lines[0]}</p>}

          {rows.length === 0 && <p className="text-[14px] text-slate">Nessuna riga. Aggiungine una.</p>}

          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const lineTotal = toNumber(row.quantity) * toNumber(row.unit_price);
              const descId = `line-${index}-description`;
              const qtyId = `line-${index}-quantity`;
              const priceId = `line-${index}-unit_price`;
              return (
                <li key={row.key} className="grid gap-3 rounded-btn border border-sand bg-white p-4 sm:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem]">
                  <Field label="Descrizione" htmlFor={descId} error={errors[`lines.${index}.description`]?.[0]} className="sm:col-span-3">
                    <Input id={descId} invalid={!!errors[`lines.${index}.description`]} value={row.description} onChange={(e) => updateRow(index, { description: e.target.value })} />
                  </Field>
                  <Field label="Quantità" htmlFor={qtyId} error={errors[`lines.${index}.quantity`]?.[0]}>
                    <Input id={qtyId} type="number" inputMode="decimal" step="any" min="0" invalid={!!errors[`lines.${index}.quantity`]} value={row.quantity} onChange={(e) => updateRow(index, { quantity: e.target.value })} />
                  </Field>
                  <Field label="Prezzo unit. (€)" htmlFor={priceId} error={errors[`lines.${index}.unit_price`]?.[0]}>
                    <Input id={priceId} type="number" inputMode="decimal" step="0.01" min="0" invalid={!!errors[`lines.${index}.unit_price`]} value={row.unit_price} onChange={(e) => updateRow(index, { unit_price: e.target.value })} />
                  </Field>
                  <div className="flex flex-col justify-end gap-1">
                    <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">Totale riga</span>
                    <span className="tabular-nums text-[15px] font-medium text-ink">{formatEUR(lineTotal)}</span>
                  </div>
                  <div className="flex justify-end sm:col-span-3">
                    <Button variant="ghost" size="sm" aria-label={`Rimuovi riga ${index + 1}`} onClick={() => removeRow(index)}>
                      <Trash2 aria-hidden="true" className="size-4" />
                      Rimuovi
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>

          <div>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus aria-hidden="true" className="size-4" />
              Aggiungi riga
            </Button>
          </div>
        </section>

        <section className="grid gap-5 rounded-[2px] border border-sand bg-paper p-5 sm:grid-cols-2 sm:p-6" aria-label="Sconto e IVA">
          <Field label="Sconto (€)" htmlFor="discount" error={errors.discount?.[0]} hint="Importo, IVA inclusa">
            <Input id="discount" type="number" inputMode="decimal" step="0.01" min="0" invalid={!!errors.discount} value={discount} onChange={(e) => { setDiscount(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="Aliquota IVA (%)" htmlFor="vat_rate" error={errors.vat_rate?.[0]}>
            <Input id="vat_rate" type="number" inputMode="decimal" step="0.5" min="0" max="100" invalid={!!errors.vat_rate} value={vatRate} onChange={(e) => { setVatRate(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="Note" htmlFor="notes" error={errors.notes?.[0]} className="sm:col-span-2">
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} />
          </Field>
        </section>

        <dl className="flex flex-col gap-2 rounded-[2px] border border-sand bg-cream/60 p-5 text-[15px]" aria-label="Totali">
          <div className="flex justify-between"><dt>Subtotale</dt><dd className="tabular-nums">{formatEUR(totals.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Sconto</dt><dd className="tabular-nums">− {formatEUR(totals.discount)}</dd></div>
          <div className="flex justify-between border-t border-sand pt-2 text-lg font-medium"><dt>Totale IVA inclusa</dt><dd className="tabular-nums">{formatEUR(totals.total)}</dd></div>
          <div className="flex justify-between text-[13px] text-slate-dark"><dt>Imponibile</dt><dd className="tabular-nums">{formatEUR(totals.taxable)}</dd></div>
          <div className="flex justify-between text-[13px] text-slate-dark"><dt>IVA {toNumber(vatRate)}%</dt><dd className="tabular-nums">{formatEUR(totals.vat)}</dd></div>
        </dl>

        <div className="flex flex-col gap-3 border-t border-sand pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="md" disabled={pending || !dirty || rows.length === 0} aria-busy={pending || undefined}>
              {pending ? "Salvataggio…" : "Salva preventivo"}
            </Button>
            {saved && !dirty && (
              <span role="status" className="text-[13px] text-success">Preventivo salvato.</span>
            )}
          </div>

          <div className="no-print flex flex-wrap items-center gap-3">
            <a href={`/api/quotes/${quote.id}/pdf`} download className={buttonClasses("outline", "md")}>
              Scarica PDF
            </a>
            <a href={`/api/quotes/${quote.id}/docx`} download className={buttonClasses("outline", "md")}>
              Scarica DOCX
            </a>
          </div>
          {dirty && (
            <p className="text-[13px] text-slate-dark">
              Ci sono modifiche non salvate: i file scaricati riflettono l’ultima versione salvata.
            </p>
          )}

          <div className="border-t border-sand pt-5">
            <ConfirmAction
              label="Elimina preventivo"
              variant="danger"
              title="Eliminare il preventivo?"
              description={`Il preventivo n. ${quote.number} verrà eliminato definitivamente.`}
              confirmLabel="Elimina"
              pendingLabel="Eliminazione…"
              run={() => deleteQuote(quote.id)}
              onSuccess={() => router.push(`/admin/prenotazioni/${quote.booking_id}`)}
            />
          </div>
        </div>
      </form>

      <aside aria-label="Anteprima" className="min-w-0 lg:sticky lg:top-8">
        <p className="no-print mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">Anteprima</p>
        <QuotePreview model={previewModel} />
      </aside>
    </div>
  );
}
