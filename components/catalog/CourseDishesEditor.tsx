"use client";

import { BookOpen, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, Textarea, cn } from "@/components/ui";
import { COURSE_LABELS, COURSE_ORDER, type Course, type Dish } from "@/lib/types";
import { DishPicker } from "./DishPicker";

/** Riga di un piatto, controllata dal genitore (menù o piatti dell'evento). */
export interface CourseDishRow {
  key: number;
  course: Course;
  /** Testo del campo: per un piatto collegato al catalogo è il nome del catalogo. */
  name: string;
  /** Descrizione libera (usata solo per i piatti non collegati). */
  description: string;
  /** Campo descrizione aperto. */
  showDescription: boolean;
  /** Piatto del catalogo collegato (null = testo libero). */
  dishId: string | null;
  /** Descrizione del piatto del catalogo, mostrata sotto il nome (solo righe collegate). */
  catalogDescription?: string | null;
  /** Piatti già presenti in altre righe: visibili nella scelta ma non selezionabili. */
  unavailableIds: ReadonlySet<string>;
  nameError?: string;
  descriptionError?: string;
}

export interface CourseDishesEditorProps {
  /** Prefisso degli id (unico nella pagina). */
  idPrefix: string;
  /** Righe in qualunque ordine: dentro ogni portata resta l'ordine dell'array. */
  rows: CourseDishRow[];
  /** Catalogo piatti: nella scelta compaiono solo quelli attivi della portata della riga. */
  catalog: Dish[];
  disabled?: boolean;
  /** Avviso "Nuovo piatto" sotto il campo (utile solo per i menù). */
  showNewHint?: boolean;
  /** Testo mostrato quando non c'è nessun piatto. */
  emptyText: string;
  onAddRow: (course: Course) => void;
  onMoveRow: (key: number, delta: -1 | 1) => void;
  onRemoveRow: (key: number) => void;
  /** Testo digitato nel campo piatto (il genitore scollega il catalogo se serve). */
  onNameChange: (key: number, text: string) => void;
  onSelectDish: (key: number, dish: Dish) => void;
  onToggleDescription: (key: number, open: boolean) => void;
  onDescriptionChange: (key: number, text: string) => void;
}

const DESCRIPTION_MAX = 500;
const COUNT_CLASS = "rounded-full bg-cream px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-slate-dark";
/** Pulsante a icona da 44x44: il colore si aggiunge per ogni pulsante (cn non unisce le classi). */
const ICON_BUTTON_BASE =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-btn transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Piatti per portata: una card per portata (apribile/chiudibile), una riga per piatto separata
 * da un divisore, e azioni a icona. Presentazionale: stato e logica restano nel genitore.
 */
export function CourseDishesEditor({
  idPrefix,
  rows,
  catalog,
  disabled = false,
  showNewHint = false,
  emptyText,
  onAddRow,
  onMoveRow,
  onRemoveRow,
  onNameChange,
  onSelectDish,
  onToggleDescription,
  onDescriptionChange,
}: CourseDishesEditorProps) {
  const pickableByCourse = useMemo(
    () =>
      new Map<Course, Dish[]>(
        COURSE_ORDER.map((course): [Course, Dish[]] => [course, catalog.filter((dish) => dish.active && dish.course === course)]),
      ),
    [catalog],
  );
  const emptyCourses = COURSE_ORDER.filter((course) => !rows.some((row) => row.course === course));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-sand px-4 py-6 text-center text-[14px] text-slate-dark">{emptyText}</p>
      )}

      {COURSE_ORDER.map((course) => {
        const courseRows = rows.filter((row) => row.course === course);
        if (courseRows.length === 0) return null;
        return (
          <CourseBlock
            key={course}
            id={`${idPrefix}-${course}`}
            title={COURSE_LABELS[course]}
            count={courseRows.length}
            disabled={disabled}
            onAdd={() => onAddRow(course)}
          >
            <ol className="flex min-w-0 flex-col">
              {courseRows.map((row, index) => (
                <DishLine
                  key={row.key}
                  row={row}
                  options={pickableByCourse.get(course) ?? []}
                  isFirst={index === 0}
                  isLast={index === courseRows.length - 1}
                  disabled={disabled}
                  showNewHint={showNewHint}
                  onMove={onMoveRow}
                  onRemove={onRemoveRow}
                  onNameChange={onNameChange}
                  onSelect={onSelectDish}
                  onToggleDescription={onToggleDescription}
                  onDescriptionChange={onDescriptionChange}
                />
              ))}
            </ol>
          </CourseBlock>
        );
      })}

      {emptyCourses.length > 0 && (
        <div className={cn("flex flex-col gap-2", rows.length > 0 && "border-t border-sand pt-4")}>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">Aggiungi una portata</p>
          <ul aria-label="Aggiungi una portata" className="flex flex-wrap gap-2">
            {emptyCourses.map((course) => (
              <li key={course}>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => onAddRow(course)}
                  disabled={disabled}
                  aria-label={`Aggiungi portata: ${COURSE_LABELS[course]}`}
                  className="min-h-11"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  {COURSE_LABELS[course]}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface CourseBlockProps {
  id: string;
  title: string;
  count: number;
  disabled: boolean;
  onAdd: () => void;
  children: ReactNode;
}

/**
 * Card di una portata con intestazione apribile. Il contenuto resta montato (con `hidden`) così
 * campi e focus non si perdono. Nessun overflow-hidden: i suggerimenti del DishPicker devono uscire.
 */
function CourseBlock({ id, title, count, disabled, onAdd, children }: CourseBlockProps) {
  const [open, setOpen] = useState(true);
  const panelId = `${id}-panel`;
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-sand bg-paper">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left transition-colors duration-200 hover:bg-cream/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-petrol"
        >
          <span className="min-w-0 break-words font-serif text-lg leading-tight text-ink">{title}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className={COUNT_CLASS}>{count}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn("size-5 text-petrol transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
            />
          </span>
        </button>
      </h3>
      <div id={panelId} className={cn("flex min-w-0 flex-col border-t border-sand px-4", !open && "hidden")}>
        {children}
        <div className="border-t border-sand/60 py-3">
          <Button variant="outline" size="sm" onClick={onAdd} disabled={disabled} aria-label={`Aggiungi piatto: ${title}`} className="min-h-11">
            <Plus aria-hidden="true" className="size-4" />
            Aggiungi piatto
          </Button>
        </div>
      </div>
    </section>
  );
}

interface DishLineProps {
  row: CourseDishRow;
  options: Dish[];
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  showNewHint: boolean;
  onMove: (key: number, delta: -1 | 1) => void;
  onRemove: (key: number) => void;
  onNameChange: (key: number, text: string) => void;
  onSelect: (key: number, dish: Dish) => void;
  onToggleDescription: (key: number, open: boolean) => void;
  onDescriptionChange: (key: number, text: string) => void;
}

/** Riga di un piatto: campo nome a tutta larghezza, descrizione compatta e azioni a icona. */
function DishLine({
  row,
  options,
  isFirst,
  isLast,
  disabled,
  showNewHint,
  onMove,
  onRemove,
  onNameChange,
  onSelect,
  onToggleDescription,
  onDescriptionChange,
}: DishLineProps) {
  // Id `item-<key>-name`: il focus della riga appena aggiunta lo cerca con questo nome.
  const rowId = `item-${row.key}`;
  const nameId = `${rowId}-name`;
  const nameErrorId = `${rowId}-name-error`;
  const descriptionId = `${rowId}-description`;
  const descriptionErrorId = `${rowId}-description-error`;
  const linked = row.dishId !== null;
  const label = row.name.trim() || "piatto senza nome";

  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-t border-sand/60 py-3 first:border-t-0">
      <div className="col-span-2 row-start-1 flex min-w-0 flex-col gap-1.5 sm:col-span-1 sm:col-start-1">

        <label htmlFor={nameId} className="sr-only">
          Nome del piatto
        </label>
        <DishPicker
          id={nameId}
          value={row.name}
          options={options}
          selectedId={row.dishId}
          unavailableIds={row.unavailableIds}
          invalid={!!row.nameError}
          describedBy={row.nameError ? nameErrorId : undefined}
          showNewHint={showNewHint}
          onChangeText={(text) => onNameChange(row.key, text)}
          onSelect={(dish) => onSelect(row.key, dish)}
        />
        {row.nameError && (
          <p id={nameErrorId} className="text-[13px] text-danger">
            {row.nameError}
          </p>
        )}

        {!linked && row.showDescription && (
          <>
            <label htmlFor={descriptionId} className="sr-only">
              Descrizione del piatto
            </label>
            <Textarea
              id={descriptionId}
              rows={2}
              maxLength={DESCRIPTION_MAX}
              placeholder="Descrizione facoltativa"
              value={row.description}
              onChange={(event) => onDescriptionChange(row.key, event.target.value)}
              invalid={!!row.descriptionError}
              aria-describedby={row.descriptionError ? descriptionErrorId : undefined}
              disabled={disabled}
            />
            {row.descriptionError && (
              <p id={descriptionErrorId} className="text-[13px] text-danger">
                {row.descriptionError}
              </p>
            )}
          </>
        )}
      </div>

      {/* Mobile: sotto il campo, a sinistra descrizione/catalogo e a destra le icone sulla stessa riga. */}
      <div className="col-start-1 row-start-2 flex min-w-0 items-center self-center sm:col-start-1 sm:row-start-2">
        {linked ? (
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-dark">
            <span
              title="Nome e descrizione si modificano nella sezione Piatti"
              className="inline-flex items-center gap-1 rounded-full border border-petrol/30 bg-petrol/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-petrol"
            >
              <BookOpen aria-hidden="true" className="size-3" />
              Catalogo
            </span>
            {row.catalogDescription && <span className="min-w-0 wrap-anywhere">{row.catalogDescription}</span>}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => onToggleDescription(row.key, !row.showDescription)}
            disabled={disabled}
            aria-expanded={row.showDescription}
            aria-controls={row.showDescription ? descriptionId : undefined}
            className="inline-flex min-h-11 items-center text-[13px] font-medium text-petrol underline-offset-2 transition-colors hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {row.showDescription ? "Rimuovi descrizione" : "+ Descrizione"}
          </button>
        )}
      </div>

      <div className="col-start-2 row-start-2 flex shrink-0 items-center gap-1 self-center sm:col-start-2 sm:row-start-1 sm:self-start">
        <button
          type="button"
          onClick={() => onMove(row.key, -1)}
          disabled={disabled || isFirst}
          aria-label="Sposta su"
          title={`Sposta su: ${label}`}
          className={cn(ICON_BUTTON_BASE, "text-petrol hover:bg-cream")}
        >
          <ChevronUp aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(row.key, 1)}
          disabled={disabled || isLast}
          aria-label="Sposta giù"
          title={`Sposta giù: ${label}`}
          className={cn(ICON_BUTTON_BASE, "text-petrol hover:bg-cream")}
        >
          <ChevronDown aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(row.key)}
          disabled={disabled}
          aria-label={`Rimuovi ${label}`}
          title={`Rimuovi ${label}`}
          className={cn(ICON_BUTTON_BASE, "text-danger hover:bg-danger/5")}
        >
          <Trash2 aria-hidden="true" className="size-5" />
        </button>
      </div>
    </li>
  );
}
