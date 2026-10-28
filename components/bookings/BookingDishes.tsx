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
}

/**
 * Elenco dei piatti dell'evento in sola lettura. Per chi può modificarli, "Modifica piatti" apre
 * l'editor; "Annulla" o "Salva piatti" lo chiudono. L'editor è montato solo mentre è aperto,
 * quindi ogni apertura parte dai dati salvati sul server.
 */
export function BookingDishes({ bookingId, dishes, hasMenu, canEdit, catalog }: BookingDishesProps) {
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  if (!canEdit) {
    return <CourseList items={dishes} comfortable />;
  }

  if (editing) {
    return (
      <DishesEditor
        key={dishes.map((d) => `${d.id}:${d.course}:${d.name}:${d.sort}:${d.description ?? ""}`).join("|")}
        bookingId={bookingId}
        dishes={dishes}
        hasMenu={hasMenu}
        catalog={catalog}
        onClose={(saved) => {
          setEditing(false);
          setSavedNotice(saved);
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {savedNotice && (
          <span role="status" className="min-w-0 text-[13px] text-success">
            Piatti salvati.
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="md"
          className="ml-auto"
          onClick={() => {
            setSavedNotice(false);
            setEditing(true);
          }}
        >
          Modifica piatti
        </Button>
      </div>
      <CourseList items={dishes} comfortable />
    </div>
  );
}
