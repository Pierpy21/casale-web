"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateBookingCovers } from "@/app/actions/bookings";
import { isQueued, submitMutation } from "@/lib/offline/submit";
import { Alert, Button } from "@/components/ui";
import { CountStepper } from "./CountStepper";

export interface CoversEditorProps {
  bookingId: string;
  adults: number;
  childCount: number;
  kidsMenus: number;
  /** `updated_at` della prenotazione letto con la pagina (controllo di conflitto offline). */
  expectedUpdated?: string;
}

type Errors = Record<string, string[]>;

/** Modifica dei soli coperti (sala e admin). Salva via updateBookingCovers e ricarica la pagina. */
export function CoversEditor({ bookingId, adults, childCount, kidsMenus, expectedUpdated }: CoversEditorProps) {
  const router = useRouter();
  const [values, setValues] = useState({ adults, children: childCount, kids_menus: kidsMenus });
  // Valori considerati salvati: di norma quelli ricevuti; dopo un salvataggio in coda, quelli inviati.
  const [base, setBase] = useState({ adults, children: childCount, kids_menus: kidsMenus });
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    values.adults !== base.adults || values.children !== base.children || values.kids_menus !== base.kids_menus;

  const save = () => {
    setError(null);
    setErrors({});
    setSaved(false);
    setQueued(false);
    startTransition(async () => {
      const result = await submitMutation("bookings.updateBookingCovers", updateBookingCovers, [bookingId, values], {
        label: `Coperti · ${values.adults} adulti, ${values.children} bambini`,
        entity: { type: "booking", id: bookingId },
        expectedUpdated,
      });
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      if (isQueued(result)) {
        // Offline: niente aggiornamento della pagina (richiede la rete); i valori restano quelli scelti.
        setBase(values);
        setQueued(true);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const reset = () => {
    setValues(base);
    setError(null);
    setErrors({});
    setSaved(false);
    setQueued(false);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-3 md:gap-8">
        <CountStepper
          id="covers-adults"
          label="Adulti"
          value={values.adults}
          onChange={(n) => setValues((v) => ({ ...v, adults: n }))}
          error={errors.adults?.[0]}
        />
        <CountStepper
          id="covers-children"
          label="Bambini"
          value={values.children}
          onChange={(n) =>
            setValues((v) => ({ ...v, children: n, kids_menus: Math.min(v.kids_menus, n) }))
          }
        />
        <CountStepper
          id="covers-kids-menus"
          label="Menù bambini"
          value={values.kids_menus}
          max={values.children}
          onChange={(n) => setValues((v) => ({ ...v, kids_menus: n }))}
          hint="Non può superare il numero di bambini"
          error={errors.kids_menus?.[0]}
        />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-sand pt-6">
        <Button
          variant="primary"
          size="md"
          onClick={save}
          disabled={!dirty || pending}
          aria-busy={pending || undefined}
        >
          {pending ? "Salvataggio…" : "Salva coperti"}
        </Button>
        {dirty && (
          <Button variant="ghost" size="md" onClick={reset} disabled={pending}>
            Annulla
          </Button>
        )}
        {saved && !dirty && (
          <span role="status" className="text-[13px] text-success">
            Coperti aggiornati.
          </span>
        )}
        {queued && !dirty && (
          <span role="status" className="text-[13px] text-success">
            Salvato sul dispositivo: verrà inviato appena torna la rete.
          </span>
        )}
      </div>
    </div>
  );
}
