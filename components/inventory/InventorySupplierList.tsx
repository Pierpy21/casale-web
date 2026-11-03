"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import {
  createInventorySupplier,
  deleteInventorySupplier,
  reorderInventorySuppliers,
  setInventorySupplierActive,
  updateInventorySupplier,
} from "@/app/actions/inventory";
import { Alert, Button, Field, Input, Modal, Switch, cn } from "@/components/ui";
import { sortSuppliers } from "@/lib/inventory-utils";
import { isBrowserOnline } from "@/lib/offline/network";
import { isQueued, submitMutation } from "@/lib/offline/submit";
import type { InventorySupplier } from "@/lib/types";

export interface InventorySupplierListProps {
  /** Tutti i fornitori (anche disattivati), in ordine di visualizzazione. */
  suppliers: InventorySupplier[];
}

type Notice = { tone: "success" | "warning" | "danger"; text: string };

/**
 * Modifiche già mostrate ma non ancora ricaricate dal server (ordine, nome, attivo, eliminazioni).
 * `base` è l'elenco dal server su cui sono state calcolate: quando la pagina si ricarica (nuovo `suppliers`)
 * la modifica locale non vale più e si torna al dato del server.
 */
interface LocalSuppliers {
  base: InventorySupplier[];
  items: InventorySupplier[];
}

/** Fornitori della giacenza (solo admin): aggiunta, rinomina, ordine, attivazione ed eliminazione. */
export function InventorySupplierList({ suppliers }: InventorySupplierListProps) {
  const router = useRouter();
  const [local, setLocal] = useState<LocalSuppliers | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [moving, startMove] = useTransition();
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  // Dopo lo spostamento il focus torna sullo stesso pulsante (la riga cambia posizione nel DOM).
  const focusAfterMove = useRef<{ id: string; direction: -1 | 1 } | null>(null);

  const items = local && local.base === suppliers ? local.items : sortSuppliers(suppliers);

  useEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-supplier-id="${target.id}"]`);
    const same = row?.querySelector<HTMLButtonElement>(`[data-move="${target.direction}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`[data-move="${target.direction * -1}"]`);
    (same && !same.disabled ? same : other)?.focus();
  }, [local]);

  /** Modifica locale dell'elenco (dal dato del server se non ce n'è una ancora valida). */
  const edit = (change: (list: InventorySupplier[]) => InventorySupplier[]) =>
    setLocal((prev) => ({ base: suppliers, items: change(prev && prev.base === suppliers ? prev.items : sortSuppliers(suppliers)) }));

  const patch = (id: string, change: Partial<InventorySupplier>) =>
    edit((list) => list.map((s) => (s.id === id ? { ...s, ...change } : s)));

  const remove = (id: string) => edit((list) => list.filter((s) => s.id !== id));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    focusAfterMove.current = { id: items[index].id, direction };
    setNotice(null);
    setLocal({ base: suppliers, items: next });
    startMove(async () => {
      const result = await submitMutation("inventory.reorderInventorySuppliers", reorderInventorySuppliers, [next.map((s) => s.id)], {
        label: "Ordine dei fornitori",
      });
      if (!result.ok) {
        setLocal(null);
        setNotice({ tone: "danger", text: `Ordine non salvato: ${result.error}` });
        return;
      }
      if (isQueued(result)) {
        setNotice({ tone: "success", text: "Nuovo ordine salvato sul dispositivo: verrà inviato appena torna la rete." });
        return;
      }
      if (isBrowserOnline()) router.refresh();
    });
  };

  const addSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.trim().replace(/\s+/g, " ");
    setNotice(null);
    setDraftError(null);
    if (!name) {
      setDraftError("Scrivi il nome del fornitore.");
      return;
    }
    startAdd(async () => {
      const result = await submitMutation("inventory.createInventorySupplier", createInventorySupplier, [{ name }], {
        label: `Nuovo fornitore · ${name}`,
        createsTempId: true,
      });
      if (!result.ok) {
        if (result.fieldErrors?.name?.[0]) setDraftError(result.fieldErrors.name[0]);
        else setNotice({ tone: "danger", text: result.error });
        return;
      }
      setDraft("");
      if (isQueued(result)) {
        // Offline l'id è provvisorio: il fornitore compare nell'elenco dopo la sincronizzazione.
        setNotice({ tone: "success", text: `«${name}» salvato sul dispositivo: comparirà nell’elenco appena torna la rete.` });
        return;
      }
      const id = result.data.id;
      edit((list) => [...list, { id, name, sort: Math.max(-1, ...list.map((s) => s.sort)) + 1, active: true }]);
      setNotice({ tone: "success", text: `«${name}» aggiunto. Compare in fondo all’elenco.` });
      if (isBrowserOnline()) router.refresh();
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form
        onSubmit={addSupplier}
        noValidate
        aria-label="Nuovo fornitore"
        className="flex min-w-0 flex-col gap-3 border border-sand bg-paper p-4 sm:flex-row sm:items-end sm:p-5"
      >
        <Field label="Nuovo fornitore" htmlFor="supplier-new-name" error={draftError ?? undefined} className="min-w-0 flex-1">
          <Input
            id="supplier-new-name"
            name="name"
            value={draft}
            maxLength={80}
            autoComplete="off"
            placeholder="Es. Metro, Amadori…"
            invalid={!!draftError}
            disabled={adding}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="primary" size="md" disabled={adding} aria-busy={adding || undefined} className="min-h-12 w-full sm:w-auto">
          <Plus aria-hidden="true" className="size-4" />
          {adding ? "Aggiunta…" : "Aggiungi fornitore"}
        </Button>
      </form>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {items.length === 0 ? (
        <p className="border border-dashed border-slate/40 bg-paper px-5 py-6 text-center text-[15px] text-slate">
          Nessun fornitore. Aggiungine uno dal modulo qui sopra.
        </p>
      ) : (
        <ul ref={listRef} aria-label="Fornitori in ordine di visualizzazione" className="flex flex-col divide-y divide-sand border border-sand bg-paper">
          {items.map((supplier, index) => (
            <SupplierRow
              key={supplier.id}
              supplier={supplier}
              index={index}
              count={items.length}
              moveBusy={moving}
              onMove={(direction) => move(index, direction)}
              onPatch={(change) => patch(supplier.id, change)}
              onRemove={() => remove(supplier.id)}
              onRevert={() => setLocal(null)}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface SupplierRowProps {
  supplier: InventorySupplier;
  index: number;
  count: number;
  /** Spostamento in corso: blocca le frecce per non inviare due ordini insieme. */
  moveBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onPatch: (change: Partial<InventorySupplier>) => void;
  onRemove: () => void;
  onRevert: () => void;
  onNotice: (notice: Notice | null) => void;
}

function SupplierRow({ supplier, index, count, moveBusy, onMove, onPatch, onRemove, onRevert, onNotice }: SupplierRowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(supplier.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const inputId = `supplier-name-${supplier.id}`;

  const startEditing = () => {
    setDraftName(supplier.name);
    setNameError(null);
    setEditing(true);
  };

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draftName.trim().replace(/\s+/g, " ");
    setNameError(null);
    if (name === supplier.name) {
      setEditing(false);
      return;
    }
    if (!name) {
      setNameError("Scrivi il nome del fornitore.");
      return;
    }
    startSave(async () => {
      const result = await submitMutation("inventory.updateInventorySupplier", updateInventorySupplier, [supplier.id, { name }], {
        label: `Rinomina fornitore · ${supplier.name} → ${name}`,
        entity: { type: "inventory_supplier", id: supplier.id },
      });
      if (!result.ok) {
        if (result.fieldErrors?.name?.[0]) setNameError(result.fieldErrors.name[0]);
        else onNotice({ tone: "danger", text: result.error });
        return;
      }
      onPatch({ name });
      setEditing(false);
      onNotice({
        tone: "success",
        text: isQueued(result)
          ? `Rinomina di «${name}» salvata sul dispositivo: verrà inviata appena torna la rete.`
          : `Fornitore rinominato in «${name}».`,
      });
      if (isBrowserOnline() && !isQueued(result)) router.refresh();
    });
  };

  const toggle = (next: boolean) => {
    onNotice(null);
    onPatch({ active: next });
    startToggle(async () => {
      const result = await submitMutation("inventory.setInventorySupplierActive", setInventorySupplierActive, [supplier.id, next], {
        label: `${next ? "Attiva" : "Disattiva"} fornitore · ${supplier.name}`,
        entity: { type: "inventory_supplier", id: supplier.id },
      });
      if (!result.ok) {
        onRevert();
        onNotice({ tone: "danger", text: `Impossibile ${next ? "attivare" : "disattivare"} «${supplier.name}»: ${result.error}` });
        return;
      }
      if (isBrowserOnline() && !isQueued(result)) router.refresh();
    });
  };

  const confirmDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      const result = await submitMutation("inventory.deleteInventorySupplier", deleteInventorySupplier, [supplier.id], {
        label: `Elimina fornitore · ${supplier.name}`,
        entity: { type: "inventory_supplier", id: supplier.id },
      });
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      if (isQueued(result)) {
        onNotice({
          tone: "success",
          text: `Eliminazione di «${supplier.name}» salvata sul dispositivo: verrà inviata appena torna la rete. Se il fornitore è in uso, verrà solo disattivato.`,
        });
        return;
      }
      if (result.data.deleted) {
        onRemove();
        onNotice({ tone: "success", text: `«${supplier.name}» eliminato.` });
      } else {
        // In uso da prodotti o report: il server lo disattiva invece di eliminarlo.
        onPatch({ active: false });
        onNotice({
          tone: "warning",
          text: `«${supplier.name}» non è stato eliminato perché è già usato da prodotti o da report: è stato disattivato.`,
        });
      }
      if (isBrowserOnline()) router.refresh();
    });
  };

  const busy = saving || toggling || deleting;

  return (
    <li data-supplier-id={supplier.id} className="flex min-w-0 flex-col gap-4 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
      {/* Ordine: frecce su e giù, senza trascinamento (pulsanti da 44px). */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          data-move="-1"
          aria-label={`Sposta ${supplier.name} su`}
          onClick={() => onMove(-1)}
          disabled={moveBusy || busy || index === 0}
          className="min-h-11 min-w-11"
        >
          <ArrowUp aria-hidden="true" className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-move="1"
          aria-label={`Sposta ${supplier.name} giù`}
          onClick={() => onMove(1)}
          disabled={moveBusy || busy || index === count - 1}
          className="min-h-11 min-w-11"
        >
          <ArrowDown aria-hidden="true" className="size-5" />
        </Button>
      </div>

      {editing ? (
        <form onSubmit={saveName} noValidate aria-label={`Rinomina ${supplier.name}`} className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Nome" htmlFor={inputId} error={nameError ?? undefined} className="min-w-0 flex-1">
            <Input
              id={inputId}
              value={draftName}
              maxLength={80}
              autoComplete="off"
              autoFocus
              invalid={!!nameError}
              disabled={saving}
              onChange={(e) => {
                setDraftName(e.target.value);
                setNameError(null);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={saving} aria-busy={saving || undefined} className="min-h-11">
              {saving ? "Salvataggio…" : "Salva"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving} className="min-h-11">
              Annulla
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5 transition-[opacity,filter] duration-300", !supplier.active && "opacity-60 grayscale")}>
            <p className="wrap-anywhere font-serif text-xl leading-tight text-ink">{supplier.name}</p>
            {!supplier.active && <p className="text-[13px] text-slate-dark">Non compare più tra le scelte per i nuovi prodotti.</p>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:shrink-0">
            <Switch
              checked={supplier.active}
              onCheckedChange={toggle}
              disabled={toggling || moveBusy}
              label={`Fornitore ${supplier.name} attivo`}
              onLabel="Attivo"
              offLabel="Disattivato"
            />
            <Button variant="outline" size="sm" onClick={startEditing} disabled={busy} aria-label={`Rinomina ${supplier.name}`} className="min-h-11 sm:min-h-0">
              <Pencil aria-hidden="true" className="size-4" />
              Rinomina
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              disabled={busy}
              aria-label={`Elimina ${supplier.name}`}
              className="min-h-11 sm:min-h-0"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Elimina
            </Button>
          </div>
        </>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        title={`Eliminare ${supplier.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Annulla
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting} aria-busy={deleting || undefined}>
              {deleting ? "Eliminazione…" : "Elimina"}
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-slate-dark">
          Il fornitore viene eliminato solo se nessun prodotto e nessun report lo usa. Altrimenti viene disattivato: i prodotti e
          i report storici restano invariati.
        </p>
        {deleteError && (
          <Alert tone="danger" className="mt-4">
            {deleteError}
          </Alert>
        )}
      </Modal>
    </li>
  );
}
