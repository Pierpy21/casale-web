"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { BookingDish, Dish } from "@/lib/types";
import { CourseList } from "./MenuPreview";
import { DishesEditor } from "./DishesEditor";

export interface BookingDishesProps {
  bookingId: string;
  dishes: BookingDish[];
  hasMenu: boolean;
  /** Chi può modificare i piatti (admin, chef in cucina): altrimenti solo lettura, senza pulsante. */
  canEdit: boolean;
  /** Catalogo piatti attivi, usato solo dall'editor. */
  catalog: Dish[];
  /** `updated_at` della prenotazione letto con la pagina (controllo di conflitto offline). */
  expectedUpdated?: string;
}

/**
 * Elenco dei piatti dell'evento in sola lettura. Per chi può modificarli, "Modifica piatti" apre
 * l'editor; "Annulla" o "Salva piatti" lo chiudono. L'editor è montato solo mentre è aperto,
 * quindi ogni apertura parte dai dati salvati sul server.
 */
export function BookingDishes({ bookingId, dishes, hasMenu, canEdit, catalog, expectedUpdated }: BookingDishesProps) {
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [queuedNotice, setQueuedNotice] = useState(false);
  // Piatti salvati offline: mostrati finché la lista del server non cambia (nuovo refresh).
  const [local, setLocal] = useState<{ source: BookingDish[]; items: BookingDish[] } | null>(null);
  const shown = local && local.source === dishes ? local.items : dishes;

  if (!canEdit) {
    return <CourseList items={dishes} comfortable />;
  }

  if (editing) {
    return (
      <DishesEditor
        key={shown.map((d) => `${d.id}:${d.course}:${d.name}:${d.sort}:${d.description ?? ""}`).join("|")}
        bookingId={bookingId}
        dishes={shown}
        hasMenu={hasMenu}
        catalog={catalog}
        expectedUpdated={expectedUpdated}
        onClose={(saved) => {
          setEditing(false);
          setSavedNotice(saved);
        }}
        onQueued={(payload) => {
          setQueuedNotice(true);
          setLocal({
            source: dishes,
            items: payload.map((d, index) => ({
              id: `local-${index}`,
              booking_id: bookingId,
              course: d.course,
              name: d.name,
              sort: d.sort,
              description: d.description ?? null,
            })),
          });
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {savedNotice && (
          <span role="status" className="min-w-0 text-[13px] text-success">
            {queuedNotice ? "Salvati sul dispositivo: verranno inviati appena torna la rete." : "Piatti salvati."}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="md"
          className="ml-auto"
          onClick={() => {
            setSavedNotice(false);
            setQueuedNotice(false);
            setEditing(true);
          }}
        >
          Modifica piatti
        </Button>
      </div>
      <CourseList items={shown} comfortable />
    </div>
  );
}
