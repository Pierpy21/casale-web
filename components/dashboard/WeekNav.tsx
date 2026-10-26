import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui/cn";

export interface WeekNavProps {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isCurrentWeek: boolean;
}

const ICON_BUTTON =
  "inline-flex size-10 items-center justify-center rounded-btn border border-sand bg-paper text-petrol transition-colors duration-200 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** Navigazione settimana precedente / oggi / successiva, senza link: il cambio avviene lato client. */
export function WeekNav({ onPrev, onNext, onToday, isCurrentWeek }: WeekNavProps) {
  return (
    <nav aria-label="Cambia settimana" className="flex items-center gap-2">
      <button type="button" onClick={onPrev} aria-label="Settimana precedente" className={ICON_BUTTON}>
        <ChevronLeft aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        onClick={onToday}
        aria-current={isCurrentWeek ? "date" : undefined}
        className={cn(
          "inline-flex h-10 items-center rounded-btn border px-4 text-[12px] font-medium uppercase tracking-[0.14em] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          isCurrentWeek
            ? "border-petrol bg-petrol text-paper hover:bg-petrol-hover"
            : "border-petrol text-petrol hover:bg-petrol hover:text-paper",
        )}
      >
        Oggi
      </button>
      <button type="button" onClick={onNext} aria-label="Settimana successiva" className={ICON_BUTTON}>
        <ChevronRight aria-hidden="true" className="size-5" />
      </button>
    </nav>
  );
}
