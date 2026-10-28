"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { resetDishesFromMenu, updateBookingDishes } from "@/app/actions/bookings";
import { CourseSections, ReorderButtons, inCourseOrder, moveWithinCourse, useFocusNewRow } from "@/components/catalog/CourseSections";
import { DishPicker } from "@/components/catalog/DishPicker";
import { normalizeSearch } from "@/components/catalog/search";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { isBrowserOnline } from "@/lib/offline/network";
import { isQueued, submitMutation } from "@/lib/offline/submit";
import { COURSE_ORDER, type BookingDish, type Course, type Dish } from "@/lib/types";
import { ConfirmAction } from "./ConfirmAction";

const DESCRIPTION_MAX = 500;

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
 * Piatti dell'evento (solo admin), stesso editor del menù: sezioni per portata, scelta dal catalogo
 * o nome libero. Scegliere un piatto copia nome, portata e descrizione: nessun legame al catalogo.
 * Il componente va montato con `key` legata alla versione dei piatti salvati: dopo un salvataggio
 * o un ripristino si riparte dai dati del server.
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

  const pickableByCourse = useMemo(
    () =>
      new Map<Course, Dish[]>(
        COURSE_ORDER.map((course): [Course, Dish[]] => [course, catalog.filter((dish) => dish.active && dish.course === course)]),
      ),
    [catalog],
  );

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
    const blocked = (pickableByCourse.get(item.course) ?? []).filter((dish) => taken.has(normalizeSearch(dish.name)));
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

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Piatti dell’evento" className="flex min-w-0 flex-col gap-6">
      <fieldset className="flex min-w-0 flex-col gap-6">
        <legend className="mb-1 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">Piatti per portata</legend>
        <CourseSections
          idPrefix="booking-dishes"
          items={items}
          disabled={pending}
          emptyText="Nessun piatto. Aggiungi una portata o ripristina dal menù."
          onAdd={addItem}
          renderItem={(item, position) => (
            <DishRow
              key={item.key}
              item={item}
              options={pickableByCourse.get(item.course) ?? []}
              unavailableIds={unavailableFor(item)}
              isFirst={position.isFirst}
              isLast={position.isLast}
              nameError={duplicateKeys.has(item.key) ? "Questo piatto è già nell’elenco." : undefined}
              disabled={pending}
              onNameChange={(key, text) => updateItem(key, { name: text })}
              onSelect={selectDish}
              onMove={moveItem}
              onRemove={removeItem}
              onToggleDescription={toggleDescription}
              onDescriptionChange={(key, text) => updateItem(key, { description: text })}
            />
          )}
        />
      </fieldset>

      {formError && <Alert tone="danger">{formError}</Alert>}

      <div className="flex flex-wrap items-center gap-3 border-t border-sand pt-5">
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => onClose(false)}>
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
    </form>
  );
}

interface DishRowProps {
  item: DishDraft;
  /** Piatti attivi della portata della riga. */
  options: Dish[];
  /** Piatti già presenti in altre righe della portata. */
  unavailableIds: ReadonlySet<string>;
  isFirst: boolean;
  isLast: boolean;
  nameError?: string;
  disabled: boolean;
  onNameChange: (key: number, text: string) => void;
  onSelect: (key: number, dish: Dish) => void;
  onMove: (key: number, delta: -1 | 1) => void;
  onRemove: (key: number) => void;
  onToggleDescription: (key: number, open: boolean) => void;
  onDescriptionChange: (key: number, text: string) => void;
}

/** Riga di un piatto dell'evento: campo piatto (catalogo o testo libero), descrizione facoltativa, ordine e rimozione. */
function DishRow({
  item,
  options,
  unavailableIds,
  isFirst,
  isLast,
  nameError,
  disabled,
  onNameChange,
  onSelect,
  onMove,
  onRemove,
  onToggleDescription,
  onDescriptionChange,
}: DishRowProps) {
  // Id `item-<key>-name`: il focus della riga appena aggiunta lo cerca con questo nome.
  const nameId = `item-${item.key}-name`;
  const nameErrorId = `item-${item.key}-name-error`;
  const descriptionId = `item-${item.key}-description`;
  const label = item.name.trim() || "piatto senza nome";

  return (
    <li className="flex min-w-0 flex-col gap-2 border-l-[3px] border-sand bg-paper py-1 pl-3 sm:pl-4">
      {/* Il campo nome occupa sempre tutta la riga: il testo del piatto non viene troncato dai pulsanti. */}
      <div className="w-full min-w-0">
        <label htmlFor={nameId} className="sr-only">
          Piatto
        </label>
        <DishPicker
          id={nameId}
          value={item.name}
          options={options}
          unavailableIds={unavailableIds}
          invalid={!!nameError}
          describedBy={nameError ? nameErrorId : undefined}
          showNewHint={false}
          onChangeText={(text) => onNameChange(item.key, text)}
          onSelect={(dish) => onSelect(item.key, dish)}
        />
        {nameError && (
          <p id={nameErrorId} className="mt-1.5 text-[13px] text-danger">
            {nameError}
          </p>
        )}
      </div>

      {item.showDescription ? (
        <Field label="Descrizione" htmlFor={descriptionId} hint={`Facoltativa, massimo ${DESCRIPTION_MAX} caratteri.`}>
          <Textarea
            id={descriptionId}
            rows={2}
            maxLength={DESCRIPTION_MAX}
            value={item.description}
            onChange={(e) => onDescriptionChange(item.key, e.target.value)}
          />
        </Field>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleDescription(item.key, !item.showDescription)}
          disabled={disabled}
          aria-expanded={item.showDescription}
        >
          {item.showDescription ? "Rimuovi descrizione" : "Aggiungi descrizione"}
        </Button>
        <ReorderButtons
          label={label}
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
          onMove={(delta) => onMove(item.key, delta)}
          onRemove={() => onRemove(item.key)}
        />
      </div>
    </li>
  );
}
