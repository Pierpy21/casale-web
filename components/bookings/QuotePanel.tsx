"use client";

import { Plus, RotateCcw, X } from "lucide-react";
import { Button, Checkbox, Field, Input, Textarea, cn } from "@/components/ui";
import { formatEUR } from "@/lib/quote-utils";
import { describedBy, first, type Errors } from "./booking-form-model";
import { lineSubtotal, newQuoteLine, quoteTotals, type QuoteDraft, type QuoteLineDraft } from "./quote-draft";

export interface QuotePanelProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  draft: QuoteDraft;
  /** Righe mostrate: prima quelle automatiche dei menù, poi le voci aggiunte a mano. */
  lines: QuoteLineDraft[];
  onChange: (changes: Partial<QuoteDraft>) => void;
  errors: Errors;
  disabled?: boolean;
}

const LABEL = "text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark";

/** Preventivo live del form evento: righe, sconto, IVA, scadenza, note e totali. Sticky su desktop, in fondo su mobile. */
export function QuotePanel({ enabled, onEnabledChange, draft, lines, onChange, errors, disabled = false }: QuotePanelProps) {
  const totals = quoteTotals(draft, lines);
  const vatLabel = draft.vat_rate.trim() === "" ? "10" : draft.vat_rate.trim();

  // Le righe automatiche cambiano solo il prezzo; le voci a mano vivono in draft.extra.
  const updateLine = (line: QuoteLineDraft, changes: Partial<QuoteLineDraft>) => {
    if (line.auto) {
      if (changes.unit_price !== undefined) {
        onChange({ priceOverrides: { ...draft.priceOverrides, [line.key]: changes.unit_price } });
      }
      return;
    }
    onChange({ extra: draft.extra.map((l) => (l.key === line.key ? { ...l, ...changes } : l)) });
  };
  const removeLine = (line: QuoteLineDraft) => onChange({ extra: draft.extra.filter((l) => l.key !== line.key) });
  const addLine = () => onChange({ extra: [...draft.extra, newQuoteLine()] });
  const hasPriceOverrides = Object.keys(draft.priceOverrides).length > 0;

  return (
    <section
      aria-labelledby="quote-title"
      className="flex min-w-0 flex-col gap-5 rounded-[2px] border border-sand border-t-[3px] border-t-bronze bg-cream/60 p-4 shadow-sm shadow-ink/5 sm:p-6"
    >
      <header className="flex flex-col gap-3">
        <h2 id="quote-title" className="font-serif text-3xl leading-none">
          Preventivo
        </h2>
        <Checkbox
          id="create-quote"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          label="Crea preventivo"
        />
      </header>

      {!enabled ? (
        <p className="text-[14px] leading-relaxed text-slate-dark">
          Nessun preventivo verrà creato. Potrai crearlo in seguito dalla pagina della prenotazione.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] leading-snug text-slate-dark">
              Le righe dei menù seguono coperti e menù scelti; puoi cambiarne il prezzo e aggiungere altre voci.
            </p>
            {hasPriceOverrides && (
              <Button variant="ghost" size="sm" onClick={() => onChange({ priceOverrides: {} })} disabled={disabled}>
                <RotateCcw aria-hidden="true" className="size-4" />
                Prezzi del menù
              </Button>
            )}
          </div>

          {errors["quote.lines"] && <p className="text-[13px] text-danger">{first(errors["quote.lines"])}</p>}

          {lines.length > 0 && (
            <ol className="flex flex-col gap-3" aria-label="Voci del preventivo">
              {lines.map((line, index) => {
                const base = `quote-line-${index}`;
                const descErr = errors[`quote.lines.${index}.description`];
                const qtyErr = errors[`quote.lines.${index}.quantity`];
                const priceErr = errors[`quote.lines.${index}.unit_price`];
                return (
                  <li key={line.key} className="flex min-w-0 flex-col gap-3 rounded-btn border border-sand bg-paper p-3">
                    {line.auto ? (
                      <p className="text-[15px] font-medium text-ink">{line.description}</p>
                    ) : (
                    <div className="flex min-w-0 items-start gap-2">
                      <Field label="Voce" htmlFor={`${base}-description`} error={first(descErr)} className="min-w-0 flex-1">
                        <Input
                          id={`${base}-description`}
                          value={line.description}
                          disabled={disabled}
                          invalid={!!descErr}
                          aria-describedby={describedBy(`${base}-description`, !!descErr, false)}
                          onChange={(e) => updateLine(line, { description: e.target.value })}
                          placeholder="es. Menù adulti"
                          maxLength={200}
                        />
                      </Field>
                      <button
                        type="button"
                        aria-label={`Rimuovi la voce ${index + 1}`}
                        onClick={() => removeLine(line)}
                        disabled={disabled}
                        className="mt-6 grid size-11 shrink-0 place-items-center rounded-[2px] text-slate-dark transition-colors hover:bg-cream hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X aria-hidden="true" className="size-5" />
                      </button>
                    </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Q.tà" htmlFor={`${base}-quantity`} error={first(qtyErr)}>
                        <Input
                          id={`${base}-quantity`}
                          inputMode="decimal"
                          value={line.quantity}
                          disabled={disabled}
                          readOnly={line.auto}
                          invalid={!!qtyErr}
                          aria-describedby={describedBy(`${base}-quantity`, !!qtyErr, false)}
                          onChange={(e) => updateLine(line, { quantity: e.target.value })}
                          className="tabular-nums"
                        />
                      </Field>
                      <Field label="Prezzo €" htmlFor={`${base}-price`} error={first(priceErr)}>
                        <Input
                          id={`${base}-price`}
                          inputMode="decimal"
                          value={line.unit_price}
                          disabled={disabled}
                          invalid={!!priceErr}
                          aria-describedby={describedBy(`${base}-price`, !!priceErr, false)}
                          onChange={(e) => updateLine(line, { unit_price: e.target.value })}
                          className="tabular-nums"
                        />
                      </Field>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className={LABEL}>Totale</span>
                        <span className="py-2.5 text-[15px] font-medium tabular-nums text-ink">
                          {formatEUR(lineSubtotal(line))}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <Button variant="outline" size="sm" onClick={addLine} disabled={disabled} className="self-start">
            <Plus aria-hidden="true" className="size-4" />
            Aggiungi voce
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sconto €" htmlFor="quote-discount" error={first(errors["quote.discount"])}>
              <Input
                id="quote-discount"
                inputMode="decimal"
                placeholder="0"
                value={draft.discount}
                disabled={disabled}
                invalid={!!errors["quote.discount"]}
                aria-describedby={describedBy("quote-discount", !!errors["quote.discount"], false)}
                onChange={(e) => onChange({ discount: e.target.value })}
              />
            </Field>
            <Field label="IVA %" htmlFor="quote-vat" error={first(errors["quote.vat_rate"])}>
              <Input
                id="quote-vat"
                inputMode="decimal"
                value={draft.vat_rate}
                disabled={disabled}
                invalid={!!errors["quote.vat_rate"]}
                aria-describedby={describedBy("quote-vat", !!errors["quote.vat_rate"], false)}
                onChange={(e) => onChange({ vat_rate: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Valido fino al" htmlFor="quote-valid-until" error={first(errors["quote.valid_until"])}>
            <Input
              id="quote-valid-until"
              type="date"
              value={draft.valid_until}
              disabled={disabled}
              invalid={!!errors["quote.valid_until"]}
              aria-describedby={describedBy("quote-valid-until", !!errors["quote.valid_until"], false)}
              onChange={(e) => onChange({ valid_until: e.target.value })}
            />
          </Field>

          <Field label="Note sul preventivo" htmlFor="quote-notes">
            <Textarea
              id="quote-notes"
              rows={2}
              value={draft.notes}
              disabled={disabled}
              onChange={(e) => onChange({ notes: e.target.value })}
            />
          </Field>

          <dl className="flex flex-col gap-2 border-t border-sand pt-4 text-[14px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-dark">Subtotale</dt>
              <dd className="tabular-nums text-ink">{formatEUR(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-dark">Sconto</dt>
                <dd className="tabular-nums text-ink">−{formatEUR(totals.discount)}</dd>
              </div>
            )}
            <div className="flex items-end justify-between gap-3 pt-2">
              <dt className={cn("text-[12px] font-medium uppercase tracking-[0.14em] text-bronze")}>
                Totale IVA incl.
              </dt>
              <dd className="font-serif text-4xl leading-none tabular-nums text-ink">{formatEUR(totals.total)}</dd>
            </div>
            <p className="text-right text-[12px] text-slate-dark tabular-nums">
              di cui IVA {vatLabel}%: {formatEUR(totals.vat)}
            </p>
          </dl>
        </div>
      )}
    </section>
  );
}
