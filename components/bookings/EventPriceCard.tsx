"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setEventFinalPrice } from "@/app/actions/quotes";
import { Alert, Button, Field, Input } from "@/components/ui";
import { isBrowserOnline } from "@/lib/offline/network";
import { submitMutation } from "@/lib/offline/submit";
import { formatEUR } from "@/lib/quote-utils";

export interface EventPriceCardProps {
  bookingId: string;
  /** Prezzo calcolato da menù e coperti (estimateBookingPrice), IVA inclusa. */
  estimate: number;
  /** Prezzo finale concordato del preventivo più recente; null = calcolo automatico. */
  finalTotal: number | null;
  /** `updated` del preventivo più recente (controllo di conflitto offline), se noto. */
  expectedUpdated?: string;
}

/** Accetta "1200", "1200,50" o "1200.5"; minimo 0,01 €, due decimali al massimo. */
function parsePrice(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Math.round(Number(normalized) * 100) / 100;
  return value >= 0.01 ? value : null;
}

/** Prezzo dell'evento (solo admin), dentro il pannello "Prezzo": calcolato, prezzo finale, ripristino. */
export function EventPriceCard({ bookingId, estimate, finalTotal, expectedUpdated }: EventPriceCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(finalTotal !== null ? String(finalTotal) : "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Prezzo salvato offline: mostrato al posto di quello del server finché non cambia la pagina.
  const [local, setLocal] = useState<{ value: number | null } | null>(null);

  const effective = local ? local.value : finalTotal;
  const parsed = parsePrice(draft);
  const canSave = parsed !== null && parsed !== effective && !pending;
  const shown = effective ?? estimate;

  const save = (value: number | null) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await submitMutation("quotes.setEventFinalPrice", setEventFinalPrice, [bookingId, value], {
        label: value === null ? "Prezzo: ripristino calcolo automatico" : `Prezzo finale ${formatEUR(value)}`,
        entity: { type: "booking", id: bookingId },
        expectedUpdated,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(value === null ? "" : String(value));
      if ("queued" in result && result.queued) {
        setLocal({ value });
        setMessage("Salvato sul dispositivo: verrà inviato appena torna la rete.");
        return;
      }
      setMessage(value === null ? "Prezzo riportato al calcolo automatico." : "Prezzo finale salvato.");
      if (isBrowserOnline()) router.refresh();
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-slate-dark">
        <span>
          {effective !== null ? "Prezzo finale concordato · IVA incl." : "Calcolato da menù e coperti · IVA incl."}
        </span>
        <span className="font-serif text-xl tabular-nums text-ink">{formatEUR(shown)}</span>
      </p>
      {effective !== null && (
        <p className="flex justify-between gap-4 text-[13px] text-slate-dark">
          <span>Calcolo automatico</span>
          <span className="tabular-nums">{formatEUR(estimate)}</span>
        </p>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {message && !error && <Alert tone="success">{message}</Alert>}

      <form
        className="flex min-w-0 flex-col gap-3 border-t border-sand pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave && parsed !== null) save(parsed);
        }}
      >
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <Field
            label="Prezzo finale (€)"
            htmlFor="final-price"
            hint="Es. 1200 oppure 1200,50"
            className="min-w-0 flex-1 basis-40 sm:max-w-56"
          >
            <Input
              id="final-price"
              inputMode="decimal"
              autoComplete="off"
              value={draft}
              disabled={pending}
              invalid={draft.trim() !== "" && parsed === null}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={estimate.toFixed(2).replace(".", ",")}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={!canSave} aria-busy={pending || undefined} className="min-h-11">
              {pending ? "Salvataggio…" : "Salva"}
            </Button>
            {effective !== null && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => save(null)} className="min-h-11">
                Ripristina calcolo
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
