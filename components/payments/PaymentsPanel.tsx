"use client";

import { FileText, ImageIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { addPayment, deletePayment, getReceiptUrl } from "@/app/actions/payments";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { useOnline } from "@/components/offline/useOnline";
import { Alert, Button, ButtonLink, Modal, cn } from "@/components/ui";
import { isQueued, submitMutation, updatedAtOf } from "@/lib/offline/submit";
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

/** Contenuto del pannello "Pagamenti e acconti" (solo admin): riepilogo, elenco acconti, aggiunta rapida. */
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
  const [notice, setNotice] = useState<string | null>(null);
  const online = useOnline();

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
      const result = await submitMutation("payments.addPayment", addPayment, [booking.id, formData], {
        label: `Nuovo acconto · ${draft.amount.trim()} €`,
        entity: { type: "booking", id: booking.id },
        expectedUpdated: updatedAtOf(booking),
      });
      if (!result.ok) {
        setDraftErrors(serverDraftErrors(result.fieldErrors));
        setFormError(result.error);
        return;
      }
      setDraft(emptyPaymentDraft());
      if (isQueued(result)) {
        setNotice("Acconto salvato sul dispositivo: verrà inviato appena torna la rete.");
        return;
      }
      setNotice(null);
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
      const result = await submitMutation("payments.deletePayment", deletePayment, [target.id], {
        label: `Elimina acconto · ${formatEUR(target.amount)}`,
        entity: { type: "booking", id: booking.id },
        expectedUpdated: updatedAtOf(booking),
      });
      if (!result.ok) {
        // Rollback: l'acconto torna nell'elenco.
        setDeletedIds((ids) => ids.filter((id) => id !== target.id));
        setPanelError(result.error);
        return;
      }
      if (isQueued(result)) {
        setNotice("Eliminazione salvata sul dispositivo: verrà inviata appena torna la rete.");
        return;
      }
      router.refresh();
    });
  };

  const openReceipt = async (payment: Payment) => {
    setPanelError(null);
    if (!online) {
      setPanelError("La ricevuta è disponibile solo online.");
      return;
    }
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
    <section aria-label="Pagamenti e acconti" className="flex min-w-0 flex-col gap-4">
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
              className="min-h-11 text-[13px] font-medium text-petrol underline-offset-2 hover:underline"
            >
              Chiudi
            </button>
          </span>
        </Alert>
      )}

      {panelError && <Alert tone="danger">{panelError}</Alert>}
      {notice && !panelError && <Alert tone="success">{notice}</Alert>}

      {/* Riepilogo: previsto, versato, residuo su una riga */}
      <div className="flex min-w-0 flex-col gap-2">
        <dl className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
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
          className="h-1 w-full overflow-hidden rounded-full bg-cream"
        >
          <div
            className="h-full rounded-full bg-petrol transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {summary.expected_total === 0 && (
          <p className="text-[12px] text-slate-dark">Il previsto si calcola dal menù scelto: al momento è zero.</p>
        )}
        {summary.balance < 0 && (
          <p className="text-[12px] text-slate-dark">Versato {formatEUR(-summary.balance)} in più del previsto.</p>
        )}
        {showSettledHint && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-btn bg-success/10 px-3 py-2">
            <p className="text-[13px] text-ink">Il saldo è completo: segna come Saldato.</p>
            <ButtonLink href={`/admin/prenotazioni/${booking.id}/modifica`} variant="outline" size="sm" className="min-h-11">
              Modifica stato
            </ButtonLink>
          </div>
        )}
      </div>

      {/* Elenco acconti: una riga per acconto */}
      {visible.length === 0 ? (
        <p className="text-[13px] text-slate">Nessun acconto registrato.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-sand border-y border-sand">
          {visible.map((payment) => {
            const pdf = isPdfReceipt({ type: payment.receipt_type ?? "", name: payment.receipt_name ?? "" });
            const dateLabel = formatIt(toDate(payment.paid_at), "d MMM yyyy");
            return (
              <li key={payment.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-serif text-lg tabular-nums text-ink">{formatEUR(payment.amount)}</span>
                  <span className="break-words text-[12px] text-slate-dark">
                    {dateLabel} · {payment.method ? PAYMENT_METHOD_LABELS[payment.method] : "Metodo non specificato"}
                    {payment.notes ? ` · ${payment.notes}` : ""}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {payment.receipt_path && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => openReceipt(payment)}
                      disabled={!online || openingId === payment.id}
                      aria-busy={openingId === payment.id || undefined}
                      aria-label={`Apri ricevuta ${payment.receipt_name ?? ""}`.trim()}
                    >
                      {pdf ? (
                        <FileText aria-hidden="true" className="size-4" />
                      ) : (
                        <ImageIcon aria-hidden="true" className="size-4" />
                      )}
                      {openingId === payment.id ? "Apertura…" : online ? "Apri ricevuta" : "Disponibile solo online"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
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

      {/* Aggiunta rapida: campi su due colonne da sm */}
      <form onSubmit={onSubmit} noValidate aria-label="Aggiungi acconto" className="flex min-w-0 flex-col gap-3 border-t border-sand pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-dark">Aggiungi acconto</p>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <PaymentDraftFields
          idPrefix="payment-new"
          draft={draft}
          errors={draftErrors}
          onChange={patchDraft}
          disabled={isPending}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isPending}
            aria-busy={isPending || undefined}
            className="min-h-11 w-full sm:w-auto"
          >
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
        "flex min-w-0 flex-col gap-0.5 rounded-[2px] border p-2 sm:p-3",
        emphasis ? "border-petrol/40 bg-petrol/5" : "border-sand bg-cream/40",
      )}
    >
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-bronze sm:text-[11px]">{label}</dt>
      <dd className="font-serif text-base tabular-nums text-ink break-words sm:text-xl">{value}</dd>
    </div>
  );
}
