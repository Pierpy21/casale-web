"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBookingAllergies } from "@/app/actions/bookings";
import { isQueued, submitMutation } from "@/lib/offline/submit";
import { Alert, Button } from "@/components/ui";
import type { BookingAllergy } from "@/lib/types";
import {
  isBlankAllergy,
  mapServerErrors,
  validateAllergies,
  type AllergyRow,
  type Errors,
} from "./booking-form-model";
import { AllergyEditor, newAllergyRow } from "./form-primitives";

export interface AllergiesEditorProps {
  bookingId: string;
  allergies: BookingAllergy[];
  /** Modificabile (admin, sala su eventi e prenotazioni). Altrimenti sola lettura, ben evidente. */
  editable: boolean;
  /** `updated_at` della prenotazione letto con la pagina (controllo di conflitto offline). */
  expectedUpdated?: string;
}

/** Riga modificabile: `id` è presente per le allergie già salvate. */
type Row = AllergyRow & { id?: string };

function toRows(list: BookingAllergy[]): Row[] {
  return list.map((a) => ({
    key: `saved-${a.id}`,
    id: a.id,
    subject_name: a.subject_name ?? "",
    condition: a.condition,
    notes: a.notes ?? "",
  }));
}

/** Righe vuote scartate; testi ripuliti. L'elenco inviato sostituisce quello salvato. */
function toPayload(rows: Row[]) {
  return rows
    .filter((r) => !isBlankAllergy(r))
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      subject_name: r.subject_name.trim() || null,
      condition: r.condition.trim(),
      notes: r.notes.trim() || null,
    }));
}

/** Confronto modifiche: solo contenuto (gli id non contano). */
function contentKey(rows: Row[]): string {
  return JSON.stringify(toPayload(rows).map(({ subject_name, condition, notes }) => [subject_name, condition, notes]));
}

const SECTION_CLASS =
  "flex min-w-0 flex-col gap-5 rounded-[2px] border-l-[3px] border-danger bg-danger/5 p-5 sm:p-6";

/**
 * Allergie e patologie della prenotazione. Di default mostra l'elenco in lettura.
 * Con `editable` un pulsante apre il modulo di modifica (aggiunta, modifica, rimozione) che si salva
 * in blocco (saveBookingAllergies): "Salva" torna alla lettura, "Annulla" scarta la bozza.
 * Il salvataggio è ottimistico: con errore l'elenco torna a quello salvato e il modulo si riapre con la bozza.
 */
export function AllergiesEditor({ bookingId, allergies, editable, expectedUpdated }: AllergiesEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Contenuto delle allergie sul server: se cambia (dopo un salvataggio) si riallinea elenco e bozza.
  // Il confronto è sul contenuto, così un refresh non cancella una bozza non salvata.
  const serverKey = allergies.map((a) => [a.id, a.subject_name ?? "", a.condition, a.notes ?? ""].join("\u0001")).join("\u0002");
  const [sourceKey, setSourceKey] = useState(serverKey);
  const [saved, setSaved] = useState<Row[]>(() => toRows(allergies));
  const [rows, setRows] = useState<Row[]>(() => toRows(allergies));
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (sourceKey !== serverKey) {
    setSourceKey(serverKey);
    setSaved(toRows(allergies));
    setRows(toRows(allergies));
  }

  const isEditing = editable && editing;
  const dirty = contentKey(rows) !== contentKey(saved);

  const header = (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-danger">
        {editable ? "Attenzione" : "Attenzione · sola lettura"}
      </p>
      <h2 id="allergie-title" className="text-2xl">
        Allergie e patologie
      </h2>
    </div>
  );

  const alerts = (
    <>
      {error && <Alert tone="danger">{error}</Alert>}
      {message && !error && <Alert tone="success">{message}</Alert>}
    </>
  );

  const update = (index: number, changes: Partial<Omit<AllergyRow, "key">>) => {
    setErrors({});
    setMessage(null);
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  };

  const remove = (index: number) => {
    setErrors({});
    setMessage(null);
    setRows((list) => list.filter((_, i) => i !== index));
  };

  const add = () => {
    setMessage(null);
    setRows((list) => [...list, newAllergyRow()]);
  };

  const startEdit = () => {
    // La bozza riparte sempre dall'elenco salvato; con elenco vuoto si parte da una riga vuota.
    setRows(saved.length > 0 ? saved : [newAllergyRow()]);
    setErrors({});
    setError(null);
    setMessage(null);
    setEditing(true);
  };

  const cancel = () => {
    setRows(saved);
    setErrors({});
    setError(null);
    setEditing(false);
  };

  const save = () => {
    setError(null);
    setMessage(null);
    const validation = validateAllergies(rows);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setError("Controlla le voci evidenziate: manca la condizione.");
      return;
    }
    const previous = saved;
    const payload = toPayload(rows);
    const optimistic: Row[] = payload.map((p, i) => ({
      key: `optimistic-${i}`,
      subject_name: p.subject_name ?? "",
      condition: p.condition,
      notes: p.notes ?? "",
    }));
    setEditing(false);
    startTransition(async () => {
      setSaved(optimistic);
      const result = await submitMutation("bookings.saveBookingAllergies", saveBookingAllergies, [bookingId, payload], {
        label: "Allergie e patologie",
        entity: { type: "booking", id: bookingId },
        expectedUpdated,
      });
      if (!result.ok) {
        // Rollback: l'elenco torna a quello salvato e il modulo si riapre con la bozza per riprovare.
        setSaved(previous);
        setEditing(true);
        setErrors(mapServerErrors(result.fieldErrors, rows));
        setError(result.error);
        return;
      }
      if (isQueued(result)) {
        // Offline: resta l'elenco appena scelto, da inviare appena torna la rete.
        setMessage("Allergie salvate sul dispositivo: verranno inviate appena torna la rete.");
        return;
      }
      setMessage("Allergie aggiornate.");
      router.refresh();
    });
  };

  if (!isEditing) {
    return (
      <section aria-labelledby="allergie-title" className={SECTION_CLASS}>
        {header}
        {alerts}
        {saved.length === 0 ? (
          <p className="text-[15px] text-ink">Nessuna allergia o patologia segnalata.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {saved.map((allergy) => (
              <li key={allergy.key} className="flex flex-col gap-1 break-words text-[16px] leading-snug text-ink">
                <span className="font-semibold">{allergy.condition}</span>
                {allergy.subject_name && <span className="text-slate-dark">Per: {allergy.subject_name}</span>}
                {allergy.notes && <span className="text-[14px] text-slate-dark">{allergy.notes}</span>}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <div className="flex flex-wrap items-center gap-3 border-t border-danger/20 pt-5">
            <Button
              type="button"
              variant="outline"
              size="md"
              className="min-h-11 max-w-full"
              disabled={pending}
              onClick={startEdit}
            >
              {saved.length === 0 ? "Aggiungi allergia" : "Modifica allergie"}
            </Button>
            {pending && (
              <p role="status" className="text-[14px] text-slate-dark">
                Salvataggio…
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="allergie-title" className={SECTION_CLASS}>
      {header}
      {alerts}

      <AllergyEditor
        rows={rows}
        errors={errors}
        disabled={pending}
        onUpdate={update}
        onAdd={add}
        onRemove={remove}
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-danger/20 pt-5">
        <Button
          type="button"
          variant="primary"
          size="md"
          className="min-h-11 max-w-full"
          disabled={!dirty || pending}
          aria-busy={pending || undefined}
          onClick={save}
        >
          {pending ? "Salvataggio…" : "Salva allergie"}
        </Button>
        <Button type="button" variant="ghost" size="md" className="min-h-11 max-w-full" disabled={pending} onClick={cancel}>
          Annulla
        </Button>
      </div>
    </section>
  );
}
