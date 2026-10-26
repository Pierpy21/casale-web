"use client";

import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { useRef } from "react";
import { Button, Field, Input, Select, buttonClasses, cn } from "@/components/ui";
import { PAYMENT_METHOD_LABELS } from "@/lib/types";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_NOTES_MAX,
  RECEIPT_ACCEPT,
  formatFileSize,
  isPdfReceipt,
  type DraftErrors,
  type PaymentDraft,
} from "./draft";

export interface PaymentDraftFieldsProps {
  /** Prefisso degli id DOM (es. "deposits-0" o "payment-new"): stesso schema di idFor() nel form prenotazione. */
  idPrefix: string;
  draft: PaymentDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<PaymentDraft>) => void;
  disabled?: boolean;
}

/** Campi di un singolo acconto: cifra, data, metodo, nota, ricevuta. Riutilizzato in form e pannello. */
export function PaymentDraftFields({ idPrefix, draft, errors, onChange, disabled }: PaymentDraftFieldsProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (file: File | undefined) => {
    onChange({ receipt: file ?? null });
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Importo" htmlFor={id("amount")} required error={errors.amount}>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-dark">
            €
          </span>
          <Input
            id={id("amount")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            disabled={disabled}
            invalid={!!errors.amount}
            aria-describedby={errors.amount ? `${id("amount")}-error` : undefined}
            className="pl-8 tabular-nums"
            value={draft.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
        </div>
      </Field>

      <Field label="Data" htmlFor={id("paid_at")} required error={errors.paid_at}>
        <Input
          id={id("paid_at")}
          type="date"
          disabled={disabled}
          invalid={!!errors.paid_at}
          aria-describedby={errors.paid_at ? `${id("paid_at")}-error` : undefined}
          value={draft.paid_at}
          onChange={(e) => onChange({ paid_at: e.target.value })}
        />
      </Field>

      <Field label="Metodo" htmlFor={id("method")} error={errors.method}>
        <Select
          id={id("method")}
          disabled={disabled}
          invalid={!!errors.method}
          value={draft.method}
          onChange={(e) => onChange({ method: e.target.value as PaymentDraft["method"] })}
        >
          <option value="">Non specificato</option>
          {PAYMENT_METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Nota" htmlFor={id("notes")} error={errors.notes} hint={`Facoltativa · max ${PAYMENT_NOTES_MAX} caratteri`}>
        <Input
          id={id("notes")}
          disabled={disabled}
          invalid={!!errors.notes}
          placeholder="es. caparra, saldo parziale…"
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">Ricevuta</span>
        <input
          ref={fileRef}
          id={id("receipt")}
          type="file"
          accept={RECEIPT_ACCEPT}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            // Permette di riselezionare lo stesso file dopo una rimozione.
            e.target.value = "";
          }}
        />

        {draft.receipt ? (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-btn border bg-paper px-3.5 py-2.5",
              errors.receipt ? "border-danger" : "border-sand",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              {isPdfReceipt(draft.receipt) ? (
                <FileText aria-hidden="true" className="size-5 shrink-0 text-bronze" />
              ) : (
                <ImageIcon aria-hidden="true" className="size-5 shrink-0 text-bronze" />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-medium text-ink" title={draft.receipt.name}>
                  {draft.receipt.name}
                </span>
                <span className="text-[12px] tabular-nums text-slate-dark">{formatFileSize(draft.receipt.size)}</span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => fileRef.current?.click()}
              >
                Cambia
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label="Rimuovi ricevuta"
                onClick={() => onChange({ receipt: null })}
              >
                <X aria-hidden="true" className="size-4" />
                Rimuovi
              </Button>
            </span>
          </div>
        ) : (
          <div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              className={buttonClasses("outline", "sm", "disabled:opacity-50")}
            >
              <Paperclip aria-hidden="true" className="size-4" />
              Carica ricevuta
            </button>
            <p className="mt-1.5 text-[13px] text-slate">Foto o PDF, fino a 10 MB.</p>
          </div>
        )}
        {errors.receipt && (
          <p className="text-[13px] text-danger" role="alert">
            {errors.receipt}
          </p>
        )}
      </div>
    </div>
  );
}
