import { TriangleAlert } from "lucide-react";
import type { BookingAllergy } from "@/lib/types";

export interface KitchenAllergyBannerProps {
  allergies: BookingAllergy[];
}

/**
 * Allergie e patologie della prenotazione, sempre visibili in cima alla scheda cucina (anche a scheda chiusa).
 * Nessun contenuto se non ci sono allergie: nessun rumore.
 */
export function KitchenAllergyBanner({ allergies }: KitchenAllergyBannerProps) {
  if (allergies.length === 0) return null;

  const names = allergies
    .map((allergy) => {
      const subject = allergy.subject_name?.trim();
      return subject ? `${allergy.condition} (${subject})` : allergy.condition;
    })
    .join(", ");

  return (
    <section
      aria-label="Allergie e patologie"
      className="flex min-w-0 items-start gap-3 border-l-[8px] border-danger bg-danger/10 px-4 py-3 sm:px-5"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[14px] font-bold uppercase tracking-[0.1em] text-danger">
          Allergie e patologie · <span className="tabular-nums">{allergies.length}</span>
        </p>
        <p className="wrap-anywhere text-[18px] leading-snug font-semibold text-ink">{names}</p>
      </div>
    </section>
  );
}
