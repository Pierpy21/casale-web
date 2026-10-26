"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button, cn } from "@/components/ui";
import { COURSE_LABELS, COURSE_ORDER, type Course } from "@/lib/types";

/** Voce con portata e chiave stabile: vale per le righe del menù e per i piatti dell'evento. */
export interface CourseItem {
  key: number;
  course: Course;
}

const ICON_BUTTON_CLASS =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-btn border border-transparent text-petrol transition-colors duration-200 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:cursor-not-allowed disabled:opacity-40";

/** Sposta la voce tra le voci della sua portata (scambia con la vicina). Le altre portate non cambiano. */
export function moveWithinCourse<T extends CourseItem>(items: T[], key: number, delta: -1 | 1): T[] {
  const item = items.find((candidate) => candidate.key === key);
  if (!item) return items;
  const sameCourse = items.filter((candidate) => candidate.course === item.course);
  const position = sameCourse.findIndex((candidate) => candidate.key === key);
  const target = sameCourse[position + delta];
  if (!target) return items;
  return items.map((candidate) => (candidate.key === key ? target : candidate.key === target.key ? item : candidate));
}

/** Voci nell'ordine delle portate: a parità di portata resta l'ordine dell'elenco. */
export function inCourseOrder<T extends CourseItem>(items: T[]): T[] {
  return COURSE_ORDER.flatMap((course) => items.filter((item) => item.course === course));
}

/**
 * Dopo l'aggiunta di una riga, il focus va sul suo campo piatto (id `item-<key>-name`).
 * La funzione restituita registra la riga da mettere a fuoco al prossimo render.
 */
export function useFocusNewRow(): (key: number) => void {
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const key = pending.current;
    if (key === null) return;
    pending.current = null;
    document.getElementById(`item-${key}-name`)?.focus();
  });
  return (key) => {
    pending.current = key;
  };
}

export interface ReorderButtonsProps {
  /** Nome della riga, usato nelle etichette accessibili. */
  label: string;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

/** Sposta su/giù e rimuovi per una riga di portata. */
export function ReorderButtons({ label, isFirst, isLast, disabled, onMove, onRemove }: ReorderButtonsProps) {
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        className={ICON_BUTTON_CLASS}
        onClick={() => onMove(-1)}
        disabled={disabled || isFirst}
        aria-label={`Sposta in alto: ${label}`}
      >
        <ChevronUp aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        className={ICON_BUTTON_CLASS}
        onClick={() => onMove(1)}
        disabled={disabled || isLast}
        aria-label={`Sposta in basso: ${label}`}
      >
        <ChevronDown aria-hidden="true" className="size-5" />
      </button>
      <button type="button" className={ICON_BUTTON_CLASS} onClick={onRemove} disabled={disabled} aria-label={`Rimuovi: ${label}`}>
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}

export interface CourseSectionsProps<T extends CourseItem> {
  /** Prefisso degli id dei titoli di portata (unico nella pagina). */
  idPrefix: string;
  items: T[];
  disabled?: boolean;
  /** Testo mostrato quando non c'è nessun piatto. */
  emptyText: string;
  onAdd: (course: Course) => void;
  /** Disegna una riga: deve restituire un <li> con key. */
  renderItem: (item: T, position: { isFirst: boolean; isLast: boolean }) => ReactNode;
}

/**
 * Elenco di voci raggruppate per portata (Antipasto, Primo, …): una sezione per portata con
 * "+ Aggiungi", e le portate vuote come chip "+ Portata". Le righe le disegna il chiamante.
 */
export function CourseSections<T extends CourseItem>({
  idPrefix,
  items,
  disabled = false,
  emptyText,
  onAdd,
  renderItem,
}: CourseSectionsProps<T>) {
  const hasItems = items.length > 0;
  const emptyCourses = COURSE_ORDER.filter((course) => !items.some((item) => item.course === course));

  return (
    <>
      {!hasItems && <p className="text-[14px] text-slate-dark">{emptyText}</p>}

      {COURSE_ORDER.map((course) => {
        const rows = items.filter((item) => item.course === course);
        if (rows.length === 0) return null;
        const titleId = `${idPrefix}-course-${course}`;
        return (
          <section key={course} aria-labelledby={titleId} className="flex flex-col gap-2">
            <h3 id={titleId} className="flex items-baseline gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">
              {COURSE_LABELS[course]}
              <span className="tabular-nums text-slate-dark">{rows.length}</span>
            </h3>
            <ol className="flex flex-col gap-3">
              {rows.map((item, position) =>
                renderItem(item, { isFirst: position === 0, isLast: position === rows.length - 1 }),
              )}
            </ol>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAdd(course)}
                disabled={disabled}
                aria-label={`Aggiungi piatto: ${COURSE_LABELS[course]}`}
              >
                + Aggiungi
              </Button>
            </div>
          </section>
        );
      })}

      {emptyCourses.length > 0 && (
        <ul aria-label="Aggiungi una portata" className={cn("flex flex-wrap gap-2", hasItems && "border-t border-sand pt-4")}>
          {emptyCourses.map((course) => (
            <li key={course}>
              <Button variant="outline" size="sm" onClick={() => onAdd(course)} disabled={disabled}>
                + {COURSE_LABELS[course]}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
