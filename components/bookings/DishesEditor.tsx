"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { resetDishesFromMenu, updateBookingDishes } from "@/app/actions/bookings";
import { CourseDishesEditor, type CourseDishRow } from "@/components/catalog/CourseDishesEditor";
import { inCourseOrder, moveWithinCourse, useFocusNewRow } from "@/components/catalog/CourseSections";
import { normalizeSearch } from "@/components/catalog/search";
import { Alert, Button } from "@/components/ui";
import { isBrowserOnline } from "@/lib/offline/network";
import { isQueued, submitMutation } from "@/lib/offline/submit";
import { type BookingDish, type Course, type Dish } from "@/lib/types";
import { ConfirmAction } from "./ConfirmAction";

/** Riga dei piatti dell'evento: copia libera (nessun collegamento al catalogo). */
interface DishDraft {
  key: number;
  course: Course;
  name: string;
  description: string;
  showDescription: boolean;
}

/** Piatto come lo salva il server (ordine già nelle portate). */
export interface DishPayload {
  course: Course;
  name: string;
  sort: number;
  description?: string;
}

export interface DishesEditorProps {
  /** Prenotazione da aggiornare sul server. Senza (crea evento): i piatti vanno a `onApply`. */
  bookingId?: string;
  /** Modalità locale: riceve i piatti al posto del salvataggio sul server. */
  onApply?: (dishes: DishPayload[]) => void;
  /** Testo del pulsante di conferma (default "Salva piatti"). */
  submitLabel?: string;
  dishes: Pick<BookingDish, "course" | "name" | "description">[];
  hasMenu: boolean;
  /** Catalogo piatti attivi (admin): serve solo per la scelta, il testo resta libero. */
  catalog: Dish[];
  /** Chiude l'editor: `saved` è true dopo un salvataggio riuscito, false con "Annulla". */
  onClose: (saved: boolean) => void;
  /** Salvataggio accodato offline: riceve i piatti scelti, da mostrare al posto di quelli del server. */
  onQueued?: (dishes: DishPayload[]) => void;
  /** `updated_at` della prenotazione letto con la pagina (controllo di conflitto offline). */
  expectedUpdated?: string;
}

/**
 * Piatti dell'evento (solo admin), stesso editor del menù: una card per portata, scelta dal catalogo
 * o nome libero. Scegliere un piatto copia nome, portata e descrizione: nessun legame al catalogo.
 * Il componente va montato con `key` legata alla versione dei piatti salvati: dopo un salvataggio
 * o un ripristino si riparte dai dati del server.
 *
 * Layout: il contenuto scorre nell'area centrale, la barra con Annulla / Applica resta in fondo.
 * Nella finestra "bare" della creazione evento l'altezza è data dalla finestra stessa.
 */
export function DishesEditor({ bookingId, onApply, submitLabel = "Salva piatti", dishes, hasMenu, catalog, onClose, onQueued, expectedUpdated }: DishesEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextKey = useRef(0);
  const newKey = () => {
    nextKey.current += 1;
    return nextKey.current;
  };
  const requestFocus = useFocusNewRow();

  const [items, setItems] = useState<DishDraft[]>(() =>
    dishes.map((dish) => ({
      key: newKey(),
      course: dish.course,
      name: dish.name,
      description: dish.description ?? "",
      showDescription: Boolean(dish.description),
    })),
  );
  const [formError, setFormError] = useState<string | null>(null);

  /** Righe da salvare nell'ordine delle portate. Le righe senza nome non vengono salvate. */
  const saveRows = useMemo(
    () => inCourseOrder(items).filter((item) => item.name.trim() !== ""),
    [items],
  );

  /** Stesso piatto due volte nella stessa portata: si segnala la riga successiva. */
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const out = new Set<number>();
    for (const item of saveRows) {
      const id = `${item.course}:${normalizeSearch(item.name)}`;
      if (seen.has(id)) out.add(item.key);
      seen.add(id);
    }
    return out;
  }, [saveRows]);

  /** Piatti del catalogo già usati in un'altra riga della stessa portata: non selezionabili. */
  function unavailableFor(item: DishDraft): ReadonlySet<string> {
    const taken = new Set(
      items.filter((other) => other.key !== item.key && other.course === item.course).map((other) => normalizeSearch(other.name)),
    );
    const blocked = catalog.filter(
      (dish) => dish.active && dish.course === item.course && taken.has(normalizeSearch(dish.name)),
    );
    return new Set(blocked.map((dish) => dish.id));
  }

  function updateItem(key: number, patch: Partial<DishDraft>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem(course: Course) {
    const key = newKey();
    requestFocus(key);
    setItems((prev) => [...prev, { key, course, name: "", description: "", showDescription: false }]);
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function moveItem(key: number, delta: -1 | 1) {
    setItems((prev) => moveWithinCourse(prev, key, delta));
  }

  /** Sceglie un piatto del catalogo: nome, portata e descrizione vengono copiati nella riga. */
  function selectDish(key: number, dish: Dish) {
    updateItem(key, {
      name: dish.name,
      course: dish.course,
      description: dish.description ?? "",
      showDescription: Boolean(dish.description),
    });
  }

  function toggleDescription(key: number, open: boolean) {
    // Chiudere il campo svuota la descrizione: niente testo nascosto che finisce comunque nel salvataggio.
    updateItem(key, open ? { showDescription: true } : { showDescription: false, description: "" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // In una modale dentro un altro form (crea evento) l'invio non deve risalire al form esterno.
    event.stopPropagation();
    setFormError(null);
    if (duplicateKeys.size > 0) {
      setFormError("Alcuni piatti compaiono più di una volta nell’elenco: rimuovi i duplicati prima di salvare.");
      return;
    }

    const payload: DishPayload[] = saveRows.map((item, index) => {
      const description = item.description.trim();
      return {
        course: item.course,
        name: item.name.trim(),
        sort: index,
        ...(description ? { description } : {}),
      };
    });

    if (onApply || !bookingId) {
      onApply?.(payload);
      onClose(true);
      return;
    }

    startTransition(async () => {
      const result = await submitMutation("bookings.updateBookingDishes", updateBookingDishes, [bookingId, payload], {
        label: "Piatti dell’evento",
        entity: { type: "booking", id: bookingId },
        expectedUpdated,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      if (isQueued(result)) {
        // Offline: si mostrano i piatti scelti; il refresh richiede la rete.
        onQueued?.(payload);
        onClose(true);
        return;
      }
      router.refresh();
      onClose(true);
    });
  }

  // Righe per il componente condiviso: testo libero, nessun collegamento al catalogo.
  const rows: CourseDishRow[] = items.map((item) => ({
    key: item.key,
    course: item.course,
    name: item.name,
    description: item.description,
    showDescription: item.showDescription,
    dishId: null,
    unavailableIds: unavailableFor(item),
    nameError: duplicateKeys.has(item.key) ? "Questo piatto è già nell’elenco." : undefined,
  }));

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Piatti dell’evento" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-cream/40 px-4 py-5 sm:px-6">
        <fieldset className="min-w-0 border-0 p-0">
          <legend className="sr-only">Piatti per portata</legend>
          <CourseDishesEditor
            idPrefix="booking-dishes"
            rows={rows}
            catalog={catalog}
            disabled={pending}
            emptyText="Nessun piatto. Aggiungi una portata o ripristina dal menù."
            onAddRow={addItem}
            onMoveRow={moveItem}
            onRemoveRow={removeItem}
            onNameChange={(key, text) => updateItem(key, { name: text })}
            onSelectDish={selectDish}
            onToggleDescription={toggleDescription}
            onDescriptionChange={(key, text) => updateItem(key, { description: text })}
          />
        </fieldset>
      </div>

      <div className="shrink-0 border-t border-sand bg-paper px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-10px_24px_-18px_rgba(28,43,45,0.45)] sm:px-6 sm:pb-4">
        {formError && (
          <div className="mb-3">
            <Alert tone="danger">{formError}</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined} className="min-h-11 flex-1 sm:flex-none">
            {pending ? "Salvataggio…" : submitLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="md"
            disabled={pending}
            onClick={() => onClose(false)}
            className="min-h-11 flex-1 sm:flex-none"
          >
            Annulla
          </Button>
          {hasMenu && bookingId && (
            <ConfirmAction
              label="Ripristina dal menù"
              variant="outline"
              title="Ripristinare i piatti dal menù?"
              description="I piatti attuali dell’evento verranno sostituiti con quelli del menù selezionato. Le modifiche non salvate andranno perse."
              confirmLabel="Ripristina"
              pendingLabel="Ripristino…"
              run={() =>
                submitMutation("bookings.resetDishesFromMenu", resetDishesFromMenu, [bookingId], {
                  label: "Ripristino piatti dal menù",
                  entity: { type: "booking", id: bookingId },
                  expectedUpdated,
                })
              }
              onSuccess={() => {
                // Offline la pagina resta quella di prima: il ripristino parte appena torna la rete.
                if (isBrowserOnline()) router.refresh();
              }}
            />
          )}
        </div>
      </div>
    </form>
  );
}
