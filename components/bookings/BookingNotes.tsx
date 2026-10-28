"use client";

import { useId, useState, type FormEvent } from "react";
import { isToday } from "date-fns";
import { addBookingNote, deleteBookingNote } from "@/app/actions/bookings";
import { formatIt } from "@/components/agenda/agenda-utils";
import { Alert, Button, Textarea } from "@/components/ui";
import type { BookingNote } from "@/lib/types";

export const BOOKING_NOTE_MAX_LENGTH = 2000;
/** Prefisso degli id provvisori delle note in attesa di conferma dal server. */
const PENDING_PREFIX = "pending-";

export interface BookingNotesProps {
  bookingId: string;
  notes: BookingNote[];
  /** Permesso di aggiungere note (`canAddBookingNote`). */
  canAdd: boolean;
  currentUserId: string;
  isAdmin: boolean;
}

/** Converte "2026-10-28 10:00:00.000Z" (formato PocketBase) o ISO in millisecondi. */
function toTime(iso: string): number {
  const time = new Date(iso.replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Più recenti per primo, come il server. */
function sortNewestFirst(list: BookingNote[]): BookingNote[] {
  return [...list].sort((a, b) => toTime(b.created_at) - toTime(a.created_at));
}

/** "oggi 14:32" oppure "3 nov 2026, 09:10". */
function formatStamp(iso: string): string {
  const date = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  return isToday(date) ? `oggi ${formatIt(date, "HH:mm")}` : formatIt(date, "d MMM yyyy, HH:mm");
}

/**
 * Note cucina di una prenotazione: elenco, aggiunta e eliminazione con aggiornamento ottimistico.
 * In caso di errore la modifica viene annullata e il testo resta nel campo per riprovare.
 */
export function BookingNotes({ bookingId, notes, canAdd, currentUserId, isAdmin }: BookingNotesProps) {
  const id = useId();
  const [source, setSource] = useState(notes);
  const [items, setItems] = useState(notes);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Il server ha ricaricato le note (dopo una modifica): allinea l'elenco ai dati aggiornati.
  if (source !== notes) {
    setSource(notes);
    setItems(notes);
  }

  const canDelete = (note: BookingNote) =>
    !note.id.startsWith(PENDING_PREFIX) && (isAdmin || note.author_id === currentUserId);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) return;
    if (body.length > BOOKING_NOTE_MAX_LENGTH) {
      setError(`La nota può contenere al massimo ${BOOKING_NOTE_MAX_LENGTH} caratteri.`);
      return;
    }

    const pendingId = `${PENDING_PREFIX}${Date.now()}`;
    const optimistic: BookingNote = {
      id: pendingId,
      booking_id: bookingId,
      author_id: currentUserId,
      author_name: "Tu",
      body,
      created_at: new Date().toISOString(),
    };
    setItems((current) => sortNewestFirst([optimistic, ...current]));
    setDraft("");
    setError(null);

    const result = await addBookingNote(bookingId, body);
    if (result.ok) {
      const realId = result.data.id;
      setItems((current) => current.map((note) => (note.id === pendingId ? { ...note, id: realId } : note)));
    } else {
      setItems((current) => current.filter((note) => note.id !== pendingId));
      setDraft((current) => (current === "" ? body : current));
      setError(result.error);
    }
  }

  async function handleDelete(note: BookingNote) {
    setConfirmingId(null);
    setError(null);
    setItems((current) => current.filter((item) => item.id !== note.id));

    const result = await deleteBookingNote(note.id);
    if (!result.ok) {
      setItems((current) => sortNewestFirst([...current.filter((item) => item.id !== note.id), note]));
      setError(result.error);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4">
      <h3 id={`${id}-title`} className="text-[13px] font-bold uppercase tracking-[0.14em] text-petrol">
        Note cucina <span className="tabular-nums">({items.length})</span>
      </h3>

      {error && <Alert tone="danger">{error}</Alert>}

      {items.length === 0 ? (
        <p className="text-[16px] text-slate-dark">Nessuna nota per questo evento.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {items.map((note) => (
            <li
              key={note.id}
              className="flex min-w-0 flex-col gap-2 border-l-[3px] border-petrol bg-cream/60 px-4 py-3"
            >
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-slate-dark">
                <span className="font-semibold text-ink wrap-anywhere">{note.author_name}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={note.created_at}>{formatStamp(note.created_at)}</time>
              </p>
              <p className="whitespace-pre-line break-words text-[18px] leading-snug text-ink">{note.body}</p>

              {canDelete(note) &&
                (confirmingId === note.id ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[15px] text-ink">Eliminare questa nota?</span>
                    <Button variant="danger" size="sm" className="min-h-11" onClick={() => void handleDelete(note)}>
                      Sì, elimina
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmingId(null)}>
                      Annulla
                    </Button>
                  </div>
                ) : (
                  <div className="pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      aria-label={`Elimina la nota di ${note.author_name}`}
                      onClick={() => setConfirmingId(note.id)}
                    >
                      Elimina
                    </Button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <form onSubmit={handleAdd} className="flex min-w-0 flex-col gap-3 border-t border-sand pt-4">
          <label htmlFor={`${id}-body`} className="text-[15px] font-medium text-ink">
            Aggiungi una nota
          </label>
          <Textarea
            id={`${id}-body`}
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={BOOKING_NOTE_MAX_LENGTH}
            rows={3}
            placeholder="Es. senza glutine per il tavolo grande"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] tabular-nums text-slate">
              {draft.length}/{BOOKING_NOTE_MAX_LENGTH}
            </span>
            <Button type="submit" variant="primary" size="md" disabled={draft.trim().length === 0}>
              Aggiungi nota
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
