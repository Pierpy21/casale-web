import { COURSE_LABELS, COURSE_ORDER, type Course } from "@/lib/types";
import { cn } from "@/components/ui/cn";

/** Forma minima di una voce di menù o di un piatto della prenotazione. */
export interface CourseItem {
  id: string;
  course: Course;
  name: string;
  sort: number;
  description?: string | null;
}

export interface CourseGroup {
  course: Course;
  label: string;
  items: CourseItem[];
}

/** Raggruppa per portata nell'ordine COURSE_ORDER, ordinando per sort. */
export function groupByCourse(items: CourseItem[]): CourseGroup[] {
  return COURSE_ORDER.map((course) => ({
    course,
    label: COURSE_LABELS[course],
    items: items.filter((item) => item.course === course).sort((a, b) => a.sort - b.sort),
  })).filter((group) => group.items.length > 0);
}

/**
 * Elenco piatti per portata (sola lettura): nome completo e descrizione, senza troncamenti.
 * `comfortable` per la scheda prenotazione: testo più grande e più spazio tra i piatti.
 */
export function CourseList({ items, className, comfortable = false }: { items: CourseItem[]; className?: string; comfortable?: boolean }) {
  const groups = groupByCourse(items);
  if (groups.length === 0) {
    return <p className="text-[14px] text-slate">Nessun piatto indicato.</p>;
  }
  return (
    <dl className={cn(comfortable ? "flex flex-col gap-7" : "flex flex-col gap-3", className)}>
      {groups.map((group) => (
        <div key={group.course} className="flex min-w-0 flex-col gap-2">
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{group.label}</dt>
          <dd className="min-w-0">
            <ul className={cn("flex min-w-0 flex-col", comfortable ? "gap-4" : "gap-2")}>
              {group.items.map((item) => (
                <li key={item.id} className="min-w-0 wrap-anywhere">
                  <span className={cn("block text-ink", comfortable ? "text-[17px] leading-snug" : "text-[14px] leading-snug")}>
                    {item.name}
                  </span>
                  {item.description && (
                    <span className={cn("mt-0.5 block whitespace-pre-line text-slate-dark", comfortable ? "text-[15px] leading-relaxed" : "text-[13px] leading-snug")}>
                      {item.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}
