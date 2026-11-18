"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFestiveSectionEnabled } from "@/app/actions/festive";
import { Alert, Card, Switch } from "@/components/ui";
import { useOptimisticActive } from "./useOptimisticActive";

export interface FestiveSectionToggleProps {
  /** Stato salvato: la fascia "Buone Feste" è mostrata sul sito. */
  enabled: boolean;
}

/** Interruttore che mostra o nasconde la fascia "Buone Feste" sul sito. */
export function FestiveSectionToggle({ enabled }: FestiveSectionToggleProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(enabled);
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    setActive(next);
    startTransition(async () => {
      const result = await setFestiveSectionEnabled(next);
      if (!result.ok) {
        resetActive();
        setError(`Impossibile ${next ? "mostrare" : "nascondere"} la fascia sul sito: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[15px] font-medium text-ink">Mostra la fascia Buone Feste sul sito</p>
          <p className="max-w-2xl text-[13px] leading-snug text-slate-dark">
            Sul sito compaiono i menù festivi visibili con data da oggi in poi, ordinati per data.
          </p>
        </div>
        <Switch
          checked={active}
          onCheckedChange={toggle}
          disabled={pending}
          label="Mostra la fascia Buone Feste sul sito"
          onLabel="Visibile"
          offLabel="Nascosta"
        />
      </Card>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
