import { COURSE_LABELS, COURSE_ORDER, type Course } from "@/lib/types";
import { cn } from "@/components/ui/cn";

/** Forma minima di una voce di menù o di un piatto della prenotazione. */
export interface CourseItem {
  id: string;
  course: Course;
  name: string;
  sort: number;
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

/** Elenco piatti per portata (sola lettura). */
export function CourseList({ items, className }: { items: CourseItem[]; className?: string }) {
  const groups = groupByCourse(items);
  if (groups.length === 0) {
    return <p className="text-[14px] text-slate">Nessun piatto indicato.</p>;
  }
  return (
    <dl className={cn("flex flex-col gap-3", className)}>
      {groups.map((group) => (
        <div key={group.course}>
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{group.label}</dt>
          <dd>
            <ul className="mt-0.5 text-[14px] leading-snug text-ink">
              {group.items.map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}
