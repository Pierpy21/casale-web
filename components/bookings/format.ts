import {
  COURSE_LABELS,
  COURSE_ORDER,
  type BookingDish,
  type BookingListItem,
  type Course,
} from "@/lib/types";

/** "19:30:00" -> "19:30". */
export function formatTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/** Notazione del Casale: A = adulti, B = bambini. */
export function formatCovers(b: Pick<BookingListItem, "adults" | "children">): string {
  return b.children > 0 ? `A ${b.adults} + B ${b.children}` : `A ${b.adults}`;
}

export function totalCovers(b: Pick<BookingListItem, "adults" | "children">): number {
  return b.adults + b.children;
}

export function bookingTitle(b: Pick<BookingListItem, "event_name" | "client">): string {
  const eventName = b.event_name?.trim();
  return eventName ? eventName : `${b.client.first_name} ${b.client.last_name}`;
}

export function clientFullName(b: Pick<BookingListItem, "client">): string {
  return `${b.client.first_name} ${b.client.last_name}`;
}

export interface DishGroup {
  course: Course;
  label: string;
  items: BookingDish[];
}

/** Piatti raggruppati per portata, nell'ordine COURSE_ORDER. */
export function groupDishes(dishes: BookingDish[]): DishGroup[] {
  return COURSE_ORDER.map((course) => ({
    course,
    label: COURSE_LABELS[course],
    items: dishes
      .filter((dish) => dish.course === course)
      .sort((a, b) => a.sort - b.sort),
  })).filter((group) => group.items.length > 0);
}
