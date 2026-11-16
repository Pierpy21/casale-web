"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteFestiveMenu, setFestiveMenuActive, setFestiveSectionEnabled } from "@/app/actions/festive";
import { ConfirmAction } from "@/components/bookings/ConfirmAction";
import { Alert, Badge, Button, Card, cn, EmptyState, Modal, Switch } from "@/components/ui";
import {
  festiveTodayISO,
  formatFestiveDateLong,
  formatFestivePrice,
  isPastFestiveDate,
} from "@/lib/festive-format";
import type { FestiveMenu } from "@/lib/festive-types";
import { FestiveMenuEditor } from "./FestiveMenuEditor";
import { useOptimisticActive } from "./useOptimisticActive";

export interface FestiveMenusPanelProps {
  /** Interruttore "Mostra la sezione sul sito". */
  enabled: boolean;
  /** Tutti i menù festivi (anche disattivati o passati), ordinati per data dal server. */
  menus: FestiveMenu[];
}

type Notice = { tone: "success" | "danger"; text: string };

/** Sezione "Menù festivi": interruttore della fascia sul sito, elenco menù ed editor. */
export function FestiveMenusPanel({ enabled, menus }: FestiveMenusPanelProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FestiveMenu | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const today = festiveTodayISO();

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(menu: FestiveMenu) {
    setEditing(menu);
    setEditorOpen(true);
  }

  function handleSaved(message: string) {
    setEditorOpen(false);
    setNotice({ tone: "success", text: message });
    router.refresh();
  }

  function handleDeleted(message: string) {
    setNotice({ tone: "success", text: message });
    router.refresh();
  }

  return (
    <section aria-labelledby="festivi-titolo" className="flex flex-col gap-6">
      <SectionToggle enabled={enabled} onError={(text) => setNotice({ tone: "danger", text })} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Buone Feste</p>
          <h2 id="festivi-titolo" className="text-2xl">
            Menù festivi ({menus.length})
          </h2>
        </div>
        <Button variant="primary" size="md" onClick={openNew}>
          Nuovo menù festivo
        </Button>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {menus.length === 0 ? (
        <EmptyState
          title="Nessun menù festivo"
          description="Creane uno, ad esempio Natale – 25 dicembre."
          action={
            <Button variant="outline" size="md" onClick={openNew}>
              Crea menù festivo
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-sand border border-sand bg-paper">
          {menus.map((menu) => (
            <FestiveMenuRow
              key={menu.id}
              menu={menu}
              past={isPastFestiveDate(menu.date, today)}
              onEdit={() => openEdit(menu)}
              onError={(text) => setNotice({ tone: "danger", text })}
              onDeleted={handleDeleted}
            />
          ))}
        </ul>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Modifica menù festivo" : "Nuovo menù festivo"}
        size="lg"
      >
        {editorOpen && (
          <FestiveMenuEditor menu={editing} onSaved={handleSaved} onCancel={() => setEditorOpen(false)} />
        )}
      </Modal>
    </section>
  );
}

/** Interruttore che mostra o nasconde l'intera fascia sul sito. */
function SectionToggle({ enabled, onError }: { enabled: boolean; onError: (text: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(enabled);

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await setFestiveSectionEnabled(next);
      if (!result.ok) {
        resetActive();
        onError(`Impossibile ${next ? "mostrare" : "nascondere"} la sezione sul sito: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[15px] font-medium text-ink">Mostra la sezione Buone Feste sul sito</p>
        <p className="max-w-2xl text-[13px] leading-snug text-slate-dark">
          Sul sito compaiono solo i menù attivi con data da oggi in poi, ordinati per data.
        </p>
      </div>
      <Switch
        checked={active}
        onCheckedChange={toggle}
        disabled={pending}
        label="Mostra la sezione Buone Feste sul sito"
        onLabel="Visibile"
        offLabel="Nascosta"
      />
    </Card>
  );
}

function FestiveMenuRow({
  menu,
  past,
  onEdit,
  onError,
  onDeleted,
}: {
  menu: FestiveMenu;
  past: boolean;
  onEdit: () => void;
  onError: (text: string) => void;
  onDeleted: (text: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(menu.active);

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await setFestiveMenuActive(menu.id, next);
      if (!result.ok) {
        resetActive();
        onError(`Impossibile ${next ? "attivare" : "disattivare"} il menù "${menu.title}": ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  const photoCount = menu.photos.length;

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className={cn("flex min-w-0 flex-col gap-1 transition-[opacity,filter] duration-300", !active && "opacity-60 grayscale")}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-serif text-xl leading-tight text-ink">{menu.title}</p>
          {past && <Badge tone="neutral">Passato</Badge>}
        </div>
        <p className="text-[14px] tabular-nums text-ink">{formatFestiveDateLong(menu.date)}</p>
        <p className="text-[13px] tabular-nums text-slate-dark">
          {menu.price !== null ? `${formatFestivePrice(menu.price)} a persona` : "Prezzo non mostrato"},{" "}
          {menu.courses.length} {menu.courses.length === 1 ? "portata" : "portate"}, {photoCount} foto
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <Switch
          checked={active}
          onCheckedChange={toggle}
          disabled={pending}
          label={`Menù ${menu.title} attivo`}
          onLabel="Attivo"
          offLabel="Disattivato"
        />
        <Button variant="outline" size="sm" onClick={onEdit} disabled={pending}>
          Modifica
        </Button>
        <ConfirmAction
          label="Elimina"
          variant="danger"
          size="sm"
          title={`Eliminare ${menu.title}?`}
          description="Il menù festivo e le sue foto verranno eliminati definitivamente. Per nasconderlo senza perderlo, usa l'interruttore Attivo."
          confirmLabel="Elimina definitivamente"
          pendingLabel="Eliminazione…"
          run={() => deleteFestiveMenu(menu.id)}
          onSuccess={() => onDeleted(`Menù "${menu.title}" eliminato.`)}
        />
      </div>
    </li>
  );
}
