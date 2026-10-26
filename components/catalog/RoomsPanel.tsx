"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { setRoomActive, upsertRoom } from "@/app/actions/catalog";
import { Alert, Button, cn, EmptyState, Field, Input, Modal, Switch } from "@/components/ui";
import type { Room } from "@/lib/types";
import { useOptimisticActive } from "./useOptimisticActive";

export interface RoomsPanelProps {
  rooms: Room[];
}

type Notice = { tone: "success" | "danger"; text: string };

/** Elenco sale con capienza e stato (interruttore); crea e modifica tramite finestra. */
export function RoomsPanel({ rooms }: RoomsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setOpen(true);
  }

  function handleSaved(message: string) {
    setOpen(false);
    setNotice({ tone: "success", text: message });
    router.refresh();
  }

  return (
    <section aria-labelledby="sale-titolo" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Spazi</p>
          <h2 id="sale-titolo" className="text-2xl">
            Sale ({rooms.length})
          </h2>
        </div>
        <Button variant="primary" size="md" onClick={openNew}>
          Nuova sala
        </Button>
      </div>

      <p className="max-w-2xl text-[14px] text-slate-dark">
        Ogni sala è riservata a un singolo evento. Le sale disattivate non compaiono nelle nuove prenotazioni.
      </p>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {rooms.length === 0 ? (
        <EmptyState
          title="Nessuna sala configurata"
          description="Aggiungi le sale del Casale con la loro capienza massima."
          action={
            <Button variant="outline" size="md" onClick={openNew}>
              Aggiungi sala
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-sand border border-sand bg-paper">
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              onEdit={() => openEdit(room)}
              onError={(text) => setNotice({ tone: "danger", text })}
            />
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifica sala" : "Nuova sala"}>
        {open && <RoomForm room={editing} onSaved={handleSaved} onCancel={() => setOpen(false)} />}
      </Modal>
    </section>
  );
}

function RoomRow({
  room,
  onEdit,
  onError,
}: {
  room: Room;
  onEdit: () => void;
  onError: (text: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(room.active);

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await setRoomActive(room.id, next);
      if (!result.ok) {
        resetActive();
        onError(`Impossibile ${next ? "attivare" : "disattivare"} la sala "${room.name}": ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1 transition-[opacity,filter] duration-300",
            !active && "opacity-60 grayscale",
          )}
        >
          <p className="font-serif text-xl leading-tight text-ink">{room.name}</p>
          <p className="text-[14px] tabular-nums text-slate-dark">
            Capienza massima {room.capacity} {room.capacity === 1 ? "persona" : "persone"}
          </p>
        </div>
        <Switch
          checked={active}
          onCheckedChange={toggle}
          disabled={pending}
          label={`Sala ${room.name} attiva`}
          onLabel="Attiva"
          offLabel="Disattivata"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Modifica
        </Button>
      </div>
    </li>
  );
}

function RoomForm({
  room,
  onSaved,
  onCancel,
}: {
  room: Room | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const idPrefix = room ? `room-${room.id}` : "room-new";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      id: room?.id,
      name: String(form.get("name") ?? ""),
      capacity: String(form.get("capacity") ?? ""),
      sort: String(form.get("sort") ?? "0"),
      // Lo stato si cambia dall'interruttore in elenco: qui si conserva (nuova sala: attiva).
      active: room?.active ?? true,
    };

    setFormError(null);
    setErrors({});
    startTransition(async () => {
      const result = await upsertRoom(input);
      if (!result.ok) {
        setFormError(result.error);
        const mapped: Record<string, string> = {};
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (messages[0]) mapped[key] = messages[0];
        }
        setErrors(mapped);
        return;
      }
      onSaved(`Sala "${input.name.trim()}" salvata.`);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label={room ? "Modifica sala" : "Nuova sala"}>
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Field label="Nome della sala" htmlFor={`${idPrefix}-name`} required error={errors.name}>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={room?.name ?? ""}
          required
          invalid={!!errors.name}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Capienza massima" htmlFor={`${idPrefix}-capacity`} required error={errors.capacity}>
          <Input
            id={`${idPrefix}-capacity`}
            name="capacity"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={room ? String(room.capacity) : ""}
            required
            invalid={!!errors.capacity}
          />
        </Field>
        <Field label="Ordine" htmlFor={`${idPrefix}-sort`} error={errors.sort}>
          <Input
            id={`${idPrefix}-sort`}
            name="sort"
            type="number"
            min={0}
            step={1}
            defaultValue={String(room?.sort ?? 0)}
            invalid={!!errors.sort}
          />
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-sand pt-5">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          Annulla
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio…" : "Salva sala"}
        </Button>
      </div>
    </form>
  );
}
