"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { assignBookingRoom, assignBookingTable } from "@/app/actions/bookings";
import { clientFullName, formatCovers, formatTime, totalCovers } from "@/components/bookings/format";
import { Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { DocumentDownload } from "@/components/ui/DocumentDownload";
import { FIELD_BASE, FIELD_TEXT, borderClass } from "@/components/ui/Input";
import { submitMutation, updatedAtOf } from "@/lib/offline/submit";
import { DOCX_MIME } from "@/lib/quote-utils";
import type { BookingListItem, Room } from "@/lib/types";

/** Sopra questo numero di sale il selettore diventa una tendina: i chip andrebbero su troppe righe. */
const CHIP_LIMIT = 4;

export interface ReservationListProps {
  /** Solo prenotazioni normali del giorno. */
  bookings: BookingListItem[];
  rooms: Room[];
  /** Giorno delle prenotazioni (YYYY-MM-DD): serve al foglio prenotazioni (PDF/Word). */
  date: string;
  /** Permesso `canAssignRoom(profile, "normale")`: senza, sala e tavolo sono in sola lettura e il foglio è nascosto. */
  canAssign: boolean;
}

/** Assegnazione mostrata subito dopo il tap; vale solo finché la sala salvata è quella di partenza. */
interface RoomOverride {
  base: string | null;
  roomId: string | null;
}

/** Tavolo mostrato subito dopo il salvataggio; vale solo finché il tavolo salvato è quello di partenza. */
interface TableOverride {
  base: number | null;
  value: number | null;
}

/** Il tavolo è un intero da 1 a 9999 (vuoto = nessun tavolo). */
const TABLE_MAX_DIGITS = 4;

function byTimeThenName(a: BookingListItem, b: BookingListItem): number {
  const ta = a.event_time ?? "99:99";
  const tb = b.event_time ?? "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return clientFullName(a).localeCompare(clientFullName(b), "it");
}

/**
 * Prenotazioni normali del giorno come lista compatta: ora · cliente · coperti · note, e a destra la sala e il tavolo.
 * Tap sulla sala = assegnazione istantanea; tavolo salvato su blur o Invio. Entrambi ottimistici, con rollback e messaggio.
 */
export function ReservationList({ bookings, rooms, date, canAssign }: ReservationListProps) {
  const [overrides, setOverrides] = useState<Record<string, RoomOverride>>({});
  const [tableOverrides, setTableOverrides] = useState<Record<string, TableOverride>>({});
  /** Testo del campo Tavolo mentre si modifica (prima del salvataggio). */
  const [tableDrafts, setTableDrafts] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inFlight = useRef(new Set<string>());
  const tableInFlight = useRef(new Set<string>());
  /** Bozza digitata mentre il salvataggio del tavolo della stessa riga è in volo: applicata a fine invio. */
  const pendingDraft = useRef(new Map<string, string>());
  const menuId = useId();
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const activeRooms = rooms.filter((room) => room.active).sort((a, b) => a.sort - b.sort);
  const sorted = [...bookings].sort(byTimeThenName);

  const roomIdOf = (booking: BookingListItem): string | null => {
    const override = overrides[booking.id];
    return override && override.base === booking.room_id ? override.roomId : booking.room_id;
  };

  const tableOf = (booking: BookingListItem): number | null => {
    const override = tableOverrides[booking.id];
    return override && override.base === booking.table_number ? override.value : booking.table_number;
  };

  const assign = (booking: BookingListItem, roomId: string | null) => {
    if (roomIdOf(booking) === roomId || inFlight.current.has(booking.id)) return;
    const id = booking.id;
    const label = clientFullName(booking);
    inFlight.current.add(id);
    setMessage(null);
    setOverrides((prev) => ({ ...prev, [id]: { base: booking.room_id, roomId } }));

    startTransition(async () => {
      // Offline l'assegnazione resta visibile (ottimistica) finché non parte l'invio.
      const result = await submitMutation("bookings.assignBookingRoom", assignBookingRoom, [id, roomId], {
        label: `Sala · ${label}`,
        entity: { type: "booking", id },
        expectedUpdated: updatedAtOf(booking),
      });
      inFlight.current.delete(id);
      if (!result.ok) {
        // Rollback: torna la sala salvata prima del tap.
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setMessage(`Sala non salvata per ${label}. ${result.error}`);
      }
    });
  };

  // Chiusura del foglio: clic/tocco fuori o Escape (il focus torna al pulsante). Listener solo mentre è aperto.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: Event) => {
      if (!menuWrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const removeDraft = (id: string) => {
    setTableDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  /** Tolta la bozza solo se è ancora il valore appena inviato: un testo digitato nel frattempo resta. */
  const settleDraft = (id: string, attempted: number | null) => {
    setTableDrafts((prev) => {
      if (prev[id] === undefined || prev[id] !== (attempted === null ? "" : String(attempted))) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  /** Testo del campo Tavolo -> valore (vuoto = null, 1..9999). Null se non valido. */
  const parseTableInput = (raw: string): { value: number | null } | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return { value: null };
    if (/^\d+$/.test(trimmed) && Number(trimmed) >= 1 && Number(trimmed) <= 9999) return { value: Number(trimmed) };
    return null;
  };

  /** Salva il tavolo (null = nessun tavolo), ottimistico. A fine invio applica l'ultima bozza digitata nel frattempo. */
  const saveTable = (booking: BookingListItem, next: number | null, expectedUpdated: string | undefined) => {
    const id = booking.id;
    const label = clientFullName(booking);
    tableInFlight.current.add(id);
    setMessage(null);
    setTableOverrides((prev) => ({ ...prev, [id]: { base: booking.table_number, value: next } }));

    startTransition(async () => {
      const result = await submitMutation("bookings.assignBookingTable", assignBookingTable, [id, next], {
        label: `Tavolo · ${label}`,
        entity: { type: "booking", id },
        expectedUpdated,
      });
      tableInFlight.current.delete(id);
      if (!result.ok) {
        // Rollback: torna il tavolo salvato prima della modifica.
        setTableOverrides((prev) => {
          const nextOverrides = { ...prev };
          delete nextOverrides[id];
          return nextOverrides;
        });
        setMessage(`Tavolo non salvato per ${label}. ${result.error}`);
      }

      const pending = pendingDraft.current.get(id);
      pendingDraft.current.delete(id);
      if (pending === undefined) {
        settleDraft(id, next);
        return;
      }
      // Bozza arrivata (blur o Invio) durante l'invio: la salva ora, se diversa dal valore salvato.
      // Senza expectedUpdated: il record è cambiato per effetto di questo stesso salvataggio.
      removeDraft(id);
      const parsed = parseTableInput(pending);
      if (!parsed) {
        setMessage(`Tavolo non valido per ${label}: usa un numero da 1 a 9999.`);
        return;
      }
      const saved = result.ok ? next : booking.table_number;
      if (parsed.value !== saved) saveTable(booking, parsed.value, undefined);
    });
  };

  /** Blur o Invio sul campo Tavolo: salva la bozza se è cambiata. Durante un invio in corso la bozza si accoda. */
  const commitTable = (booking: BookingListItem) => {
    const id = booking.id;
    const draft = tableDrafts[id];
    if (tableInFlight.current.has(id)) {
      if (draft !== undefined) pendingDraft.current.set(id, draft);
      return;
    }
    const label = clientFullName(booking);
    const current = tableOf(booking);
    const parsed = parseTableInput(draft ?? (current === null ? "" : String(current)));
    removeDraft(id);
    if (!parsed) {
      setMessage(`Tavolo non valido per ${label}: usa un numero da 1 a 9999.`);
      return;
    }
    if (parsed.value === current) return;
    saveTable(booking, parsed.value, updatedAtOf(booking));
  };

  const documentDate = encodeURIComponent(date);

  return (
    <section aria-labelledby="prenotazioni-titolo" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-sand pb-2">
        <h3 id="prenotazioni-titolo" className="text-xl">
          Prenotazioni
        </h3>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[13px] text-slate-dark tabular-nums">
            {sorted.length} {sorted.length === 1 ? "prenotazione" : "prenotazioni"}
          </span>
          {canAssign && (
            <div ref={menuWrapRef} className="relative">
              <button
                ref={menuButtonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-field-edge bg-field px-2.5 py-1.5 text-[13px] leading-snug text-ink transition-colors duration-150 hover:border-field-edge-hover hover:bg-cream/60"
              >
                <Printer aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                Foglio prenotazioni
              </button>
              {menuOpen && (
                <div id={menuId} className="absolute right-0 z-10 mt-1.5 flex min-w-36 flex-col gap-0.5 rounded-lg border border-field-edge bg-paper p-1.5 shadow-md">
                  <DocumentDownload
                    href={`/api/reservations/pdf?date=${documentDate}`}
                    fileName={`prenotazioni-${date}.pdf`}
                    mimeType="application/pdf"
                    onActivate={() => setMenuOpen(false)}
                    className="rounded-md px-3 py-2 text-[14px] text-ink transition-colors duration-150 hover:bg-cream/60"
                  >
                    PDF
                  </DocumentDownload>
                  <DocumentDownload
                    href={`/api/reservations/docx?date=${documentDate}`}
                    fileName={`prenotazioni-${date}.docx`}
                    mimeType={DOCX_MIME}
                    onActivate={() => setMenuOpen(false)}
                    className="rounded-md px-3 py-2 text-[14px] text-ink transition-colors duration-150 hover:bg-cream/60"
                  >
                    Word
                  </DocumentDownload>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {message && (
        <p role="alert" className="text-[13px] text-danger">
          {message}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-sand rounded-[2px] border border-sand bg-paper">
        {sorted.map((booking) => {
          const currentId = roomIdOf(booking);
          const currentInfo = rooms.find((room) => room.id === currentId) ?? null;
          const currentName = currentInfo?.name ?? (booking.room?.id === currentId ? booking.room.name : null);
          // Sala attuale disattivata: resta visibile in sola lettura, ma non è tra le scelte proposte.
          const inactiveCurrent = currentInfo && !currentInfo.active ? currentInfo : null;
          const options = activeRooms;
          const title = clientFullName(booking);
          const notes = booking.notes?.trim();
          const table = tableOf(booking);
          const tableText = booking.id in tableDrafts ? tableDrafts[booking.id] : table === null ? "" : String(table);

          return (
            <li
              key={booking.id}
              className="flex min-w-0 flex-col gap-2.5 px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 text-[15px] font-medium tabular-nums text-ink">{formatTime(booking.event_time) ?? "—"}</span>
                  <Link
                    href={`/admin/prenotazioni/${booking.id}`}
                    className="min-w-0 break-words font-serif text-[16px] leading-snug text-petrol hover:underline"
                  >
                    {title}
                  </Link>
                </div>
                <p className="flex min-w-0 flex-wrap gap-x-2 text-[13px] text-slate-dark">
                  <span className="tabular-nums">
                    {totalCovers(booking)} coperti <span className="opacity-75">({formatCovers(booking)})</span>
                  </span>
                  {notes && (
                    <span className="min-w-0 truncate" title={notes}>
                      · {notes}
                    </span>
                  )}
                </p>
              </div>

              {canAssign ? (
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {inactiveCurrent && (
                      <p className="text-[13px] text-slate-dark">
                        Sala attuale: <span className="text-ink">{inactiveCurrent.name} (non attiva)</span>
                      </p>
                    )}
                    {options.length > CHIP_LIMIT ? (
                      <div className="flex min-w-0 items-center gap-2 text-[13px] text-slate-dark">
                        <span className="shrink-0">Sala</span>
                        <Select
                          aria-label={`Sala per ${title}`}
                          value={currentId ?? ""}
                          onChange={(e) => assign(booking, e.target.value === "" ? null : e.target.value)}
                          wrapperClassName="w-56 min-w-0 max-w-full"
                        >
                          <option value="">Nessuna</option>
                          {inactiveCurrent && (
                            <option value={inactiveCurrent.id} disabled>
                              {inactiveCurrent.name} (non attiva)
                            </option>
                          )}
                          {options.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <div role="group" aria-label={`Sala per ${title}`} className="flex min-w-0 flex-col gap-1.5">
                        <span aria-hidden="true" className="text-[10px] font-medium uppercase tracking-[0.12em] text-bronze">
                          Sala
                        </span>
                        <div className="flex min-w-0 flex-wrap gap-1.5">
                          <RoomChip selected={currentId === null} onSelect={() => assign(booking, null)}>
                            Nessuna
                          </RoomChip>
                          {options.map((room) => (
                            <RoomChip key={room.id} selected={currentId === room.id} onSelect={() => assign(booking, room.id)}>
                              {room.name}
                            </RoomChip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex w-20 shrink-0 flex-col gap-1.5">
                    <span aria-hidden="true" className="text-[10px] font-medium uppercase tracking-[0.12em] text-bronze">
                      Tavolo
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={TABLE_MAX_DIGITS}
                      placeholder="N°"
                      aria-label={`Tavolo per ${title}`}
                      value={tableText}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, TABLE_MAX_DIGITS);
                        setTableDrafts((prev) => ({ ...prev, [booking.id]: digits }));
                      }}
                      onBlur={() => commitTable(booking)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className={cn(FIELD_BASE, FIELD_TEXT, borderClass(false), "text-center tabular-nums")}
                    />
                  </div>
                </div>
              ) : (
                <p className="flex flex-wrap gap-x-4 text-[13px] text-slate-dark">
                  <span>
                    Sala: <span className="text-ink">{currentName ?? "Da assegnare"}</span>
                  </span>
                  <span>
                    Tavolo: <span className="text-ink tabular-nums">{table ?? "Da assegnare"}</span>
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RoomChip({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "min-h-11 rounded-lg lg:min-h-9 border px-3 py-1.5 text-[13px] leading-snug transition-colors duration-150",
        selected ? "border-petrol bg-petrol text-paper" : "border-field-edge bg-field text-ink hover:border-field-edge-hover hover:bg-cream/60",
      )}
    >
      {children}
    </button>
  );
}
