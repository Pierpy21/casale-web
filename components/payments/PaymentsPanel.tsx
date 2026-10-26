"use client";

import { FileText, ImageIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { addPayment, deletePayment, getReceiptUrl } from "@/app/actions/payments";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { Alert, Button, ButtonLink, Modal, cn } from "@/components/ui";
import { getPaymentSummary } from "@/lib/payment-utils";
import { formatEUR } from "@/lib/quote-utils";
import {
  PAYMENT_METHOD_LABELS,
  type BookingDetail,
  type Payment,
} from "@/lib/types";
import { PaymentDraftFields } from "./PaymentDraftFields";
import {
  buildPaymentFormData,
  emptyPaymentDraft,
  isPdfReceipt,
  serverDraftErrors,
  validateDraft,
  type DraftErrors,
  type PaymentDraft,
} from "./draft";

export interface PaymentsPanelProps {
  booking: BookingDetail;
  /** Pagamenti della prenotazione, già filtrati lato server per l'admin. */
  payments: Payment[];
  /** Acconti della creazione non salvati (dal parametro ?payments_error=N). */
  paymentsError?: number;
}

/** Pannello Pagamenti (solo admin): riepilogo previsto/versato/residuo, elenco acconti, aggiunta rapida. */
export function PaymentsPanel({ booking, payments, paymentsError }: PaymentsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Eliminazioni ottimistiche: l'id resta escluso anche quando il server rinvia la lista aggiornata.
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PaymentDraft>(() => emptyPaymentDraft());
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showError, setShowError] = useState(true);

  const visible = payments.filter((p) => !deletedIds.includes(p.id));
  const summary = getPaymentSummary(booking, visible);
  const progress =
    summary.expected_total > 0 ? Math.min(100, (summary.paid_total / summary.expected_total) * 100) : 0;
  const showSettledHint =
    summary.paid_total > 0 &&
    summary.balance <= 0 &&
    booking.status !== "saldato" &&
    booking.status !== "annullato";

  const patchDraft = (changes: Partial<PaymentDraft>) => {
    setDraft((d) => ({ ...d, ...changes }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const errors = validateDraft(draft);
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError("Controlla i campi evidenziati.");
      return;
    }
    const formData = buildPaymentFormData(draft);
    startTransition(async () => {
      const result = await addPayment(booking.id, formData);
      if (!result.ok) {
        setDraftErrors(serverDraftErrors(result.fieldErrors));
        setFormError(result.error);
        return;
      }
      setDraft(emptyPaymentDraft());
      router.refresh();
    });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    if (!target) return;
    setPanelError(null);
    setDeleteTarget(null);
    setDeletedIds((ids) => [...ids, target.id]);
    startTransition(async () => {
      const result = await deletePayment(target.id);
      if (!result.ok) {
        // Rollback: l'acconto torna nell'elenco.
        setDeletedIds((ids) => ids.filter((id) => id !== target.id));
        setPanelError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const openReceipt = async (payment: Payment) => {
    setPanelError(null);
    // La scheda va aperta subito (gesto dell'utente) per non farla bloccare dai popup dopo l'attesa.
    const tab = window.open("about:blank", "_blank");
    setOpeningId(payment.id);
    const result = await getReceiptUrl(payment.id);
    setOpeningId(null);
    if (!result.ok) {
      tab?.close();
      setPanelError(result.error);
      return;
    }
    if (!tab) {
      setPanelError("Il browser ha bloccato la nuova scheda. Consenti i popup per questo sito e riprova.");
      return;
    }
    tab.location.href = result.data.url;
  };

  return (
    <section
      id="pagamenti"
      aria-labelledby="pagamenti-title"
      className="flex scroll-mt-6 flex-col gap-6 rounded-[2px] border border-sand border-t-[3px] border-t-bronze bg-paper p-5 shadow-sm shadow-ink/5 sm:p-6"
    >
      <header className="flex flex-col gap-2 border-b border-sand pb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Solo amministrazione</p>
        <h2 id="pagamenti-title" className="text-2xl">
          Pagamenti
        </h2>
      </header>

      {paymentsError && showError && (
        <Alert tone="danger">
          <span className="flex flex-wrap items-start justify-between gap-3">
            <span>
              {paymentsError === 1
                ? "Un acconto non è stato salvato con la prenotazione."
                : `${paymentsError} acconti non sono stati salvati con la prenotazione.`}{" "}
              Puoi aggiungerli di nuovo qui sotto.
            </span>
            <button
              type="button"
              onClick={() => setShowError(false)}
              className="text-[13px] font-medium text-petrol underline-offset-2 hover:underline"
            >
              Chiudi
            </button>
          </span>
        </Alert>
      )}

      {panelError && <Alert tone="danger">{panelError}</Alert>}

      {/* Riepilogo */}
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCell label="Previsto" value={formatEUR(summary.expected_total)} />
          <SummaryCell label="Versato" value={formatEUR(summary.paid_total)} />
          <SummaryCell
            label="Residuo"
            value={formatEUR(Math.max(0, summary.balance))}
            emphasis={summary.balance > 0}
          />
        </dl>
        <div
          role="progressbar"
          aria-label="Avanzamento pagamenti"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-cream"
        >
          <div
            className="h-full rounded-full bg-petrol transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {summary.expected_total === 0 && (
          <p className="text-[13px] text-slate-dark">Il previsto si calcola dal menù scelto: al momento è zero.</p>
        )}
        {summary.balance < 0 && (
          <p className="text-[13px] text-slate-dark">Versato {formatEUR(-summary.balance)} in più del previsto.</p>
        )}
        {showSettledHint && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-btn bg-success/10 px-4 py-3">
            <p className="text-[14px] text-ink">Il saldo è completo: segna come Saldato.</p>
            <ButtonLink href={`/admin/prenotazioni/${booking.id}/modifica`} variant="outline" size="sm">
              Modifica stato
            </ButtonLink>
          </div>
        )}
      </div>

      {/* Elenco */}
      {visible.length === 0 ? (
        <p className="text-[14px] text-slate">Nessun acconto registrato.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-sand border-y border-sand">
          {visible.map((payment) => {
            const pdf = isPdfReceipt({ type: payment.receipt_type ?? "", name: payment.receipt_name ?? "" });
            const dateLabel = formatIt(toDate(payment.paid_at), "d MMM yyyy");
            return (
              <li key={payment.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-serif text-xl tabular-nums text-ink">{formatEUR(payment.amount)}</span>
                    <span className="text-[13px] text-slate-dark">{dateLabel}</span>
                  </p>
                  <p className="break-words text-[13px] text-slate-dark">
                    {payment.method ? PAYMENT_METHOD_LABELS[payment.method] : "Metodo non specificato"}
                    {payment.notes ? ` · ${payment.notes}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {payment.receipt_path && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openReceipt(payment)}
                      disabled={openingId === payment.id}
                      aria-busy={openingId === payment.id || undefined}
                      aria-label={`Apri ricevuta ${payment.receipt_name ?? ""}`.trim()}
                    >
                      {pdf ? (
                        <FileText aria-hidden="true" className="size-4" />
                      ) : (
                        <ImageIcon aria-hidden="true" className="size-4" />
                      )}
                      {openingId === payment.id ? "Apertura…" : "Apri ricevuta"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Elimina acconto di ${formatEUR(payment.amount)} del ${dateLabel}`}
                    onClick={() => setDeleteTarget(payment)}
                    disabled={isPending}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Elimina
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Aggiunta rapida */}
      <form onSubmit={onSubmit} noValidate aria-label="Aggiungi acconto" className="flex flex-col gap-5">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">Aggiungi acconto</p>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <PaymentDraftFields
          idPrefix="payment-new"
          draft={draft}
          errors={draftErrors}
          onChange={patchDraft}
          disabled={isPending}
        />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="md" disabled={isPending} aria-busy={isPending || undefined}>
            {isPending ? "Salvataggio…" : "Registra acconto"}
          </Button>
        </div>
      </form>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Eliminare l’acconto?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Annulla
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Elimina acconto
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-[15px] leading-relaxed text-slate-dark">
            Eliminare l’acconto di <span className="font-medium text-ink">{formatEUR(deleteTarget.amount)}</span>
            {deleteTarget.receipt_name ? (
              <>
                {" "}e la ricevuta <span className="break-all">{deleteTarget.receipt_name}</span>
              </>
            ) : null}
            ? L’operazione non può essere annullata.
          </p>
        )}
      </Modal>
    </section>
  );
}

function SummaryCell({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-[2px] border p-3 sm:p-4",
        emphasis ? "border-petrol/40 bg-petrol/5" : "border-sand bg-cream/40",
      )}
    >
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-bronze">{label}</dt>
      <dd className="font-serif text-xl tabular-nums text-ink break-words sm:text-2xl">{value}</dd>
    </div>
  );
}
