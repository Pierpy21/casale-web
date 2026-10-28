"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteDish, upsertDish } from "@/app/actions/catalog";
import { isBrowserOnline } from "@/lib/offline/network";
import { isQueued, submitMutation, updatedAtOf } from "@/lib/offline/submit";
import { Alert, Button, EmptyState, Field, Input, Modal, Switch, cn } from "@/components/ui";
import { COURSE_LABELS, COURSE_ORDER, type Dish } from "@/lib/types";
import { DishForm } from "./DishForm";
import { normalizeSearch } from "./search";
import { useOptimisticActive } from "./useOptimisticActive";

export interface DishesPanelProps {
  /** Catalogo completo (anche piatti inattivi). */
  dishes: Dish[];
}

type Notice = { tone: "success" | "danger"; text: string };

interface RemovalRequest {
  dish: Dish;
  usedIn: { id: string; name: string }[];
}

/** Catalogo piatti raggruppato per portata: ricerca, attivazione, modifica ed eliminazione. */
export function DishesPanel({ dishes }: DishesPanelProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Dish | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [removal, setRemoval] = useState<RemovalRequest | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => {
    const q = normalizeSearch(query);
    const visible = q
      ? dishes.filter(
          (dish) =>
            normalizeSearch(dish.name).includes(q) || normalizeSearch(dish.description ?? "").includes(q),
        )
      : dishes;
    return COURSE_ORDER.map((course) => ({
      course,
      items: visible.filter((dish) => dish.course === course),
    })).filter((group) => group.items.length > 0);
  }, [dishes, query]);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(dish: Dish) {
    setEditing(dish);
    setEditorOpen(true);
  }

  function handleSaved(message: string) {
    setEditorOpen(false);
    setNotice({ tone: "success", text: message });
    if (isBrowserOnline()) router.refresh();
  }

  /** Prima chiamata senza force: se il piatto è nei menù, chiede conferma. */
  function requestRemove(dish: Dish) {
    setNotice(null);
    startTransition(async () => {
      const result = await submitMutation("catalog.deleteDish", deleteDish, [dish.id, undefined], {
        label: `Elimina piatto · ${dish.name}`,
        entity: { type: "dish", id: dish.id },
        expectedUpdated: updatedAtOf(dish),
      });
      if (!result.ok) {
        if (result.code === "dish_in_use") {
          setRemoval({ dish, usedIn: result.usedIn ?? [] });
          return;
        }
        setNotice({ tone: "danger", text: result.error });
        return;
      }
      if (isQueued(result)) {
        setNotice({ tone: "success", text: `Eliminazione di "${dish.name}" salvata sul dispositivo: verrà inviata appena torna la rete.` });
        return;
      }
      setNotice({ tone: "success", text: `Piatto "${dish.name}" eliminato.` });
      router.refresh();
    });
  }

  function confirmRemove() {
    const target = removal;
    if (!target) return;
    startTransition(async () => {
      const result = await submitMutation("catalog.deleteDish", deleteDish, [target.dish.id, { force: true }], {
        label: `Elimina piatto · ${target.dish.name}`,
        entity: { type: "dish", id: target.dish.id },
        expectedUpdated: updatedAtOf(target.dish),
        force: true,
      });
      setRemoval(null);
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error });
        return;
      }
      if (isQueued(result)) {
        setNotice({ tone: "success", text: `Eliminazione di "${target.dish.name}" salvata sul dispositivo: verrà inviata appena torna la rete.` });
        return;
      }
      const count = result.data.removed_menu_items;
      setNotice({
        tone: "success",
        text:
          count > 0
            ? `Piatto "${target.dish.name}" eliminato e tolto da ${count} ${count === 1 ? "voce di menù" : "voci di menù"}.`
            : `Piatto "${target.dish.name}" eliminato.`,
      });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="piatti-titolo" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Catalogo condiviso</p>
          <h2 id="piatti-titolo" className="text-2xl">
            Piatti ({dishes.length})
          </h2>
        </div>
        <Button variant="primary" size="md" onClick={openNew}>
          Aggiungi piatto
        </Button>
      </div>

      <p className="max-w-2xl text-[14px] text-slate-dark">
        I piatti si scelgono nei menù. Modificarne nome o descrizione aggiorna anche i menù che li contengono.
        I piatti disattivati non compaiono nell&apos;elenco di scelta dei menù.
      </p>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {dishes.length === 0 ? (
        <EmptyState
          title="Nessun piatto nel catalogo"
          description="Aggiungi i piatti una volta sola: poi li scegli in ogni menù."
          action={
            <Button variant="outline" size="md" onClick={openNew}>
              Aggiungi piatto
            </Button>
          }
        />
      ) : (
        <>
          <div className="max-w-md">
            <Field label="Cerca piatto" htmlFor="piatti-cerca">
              <Input
                id="piatti-cerca"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome o descrizione"
                autoComplete="off"
              />
            </Field>
          </div>

          {groups.length === 0 ? (
            <p className="text-[14px] text-slate-dark" role="status">
              Nessun piatto corrisponde a &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <section key={group.course} aria-labelledby={`piatti-${group.course}`} className="flex flex-col gap-3">
                  <h3
                    id={`piatti-${group.course}`}
                    className="flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-bronze"
                  >
                    {COURSE_LABELS[group.course]}
                    <span className="tabular-nums text-slate-dark">({group.items.length})</span>
                  </h3>
                  <ul className="flex flex-col divide-y divide-sand border border-sand bg-paper px-4 sm:px-5">
                    {group.items.map((dish) => (
                      <DishRow
                        key={dish.id}
                        dish={dish}
                        busy={pending}
                        onEdit={() => openEdit(dish)}
                        onRemove={() => requestRemove(dish)}
                        onError={(text) => setNotice({ tone: "danger", text })}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Modifica piatto" : "Nuovo piatto"}
      >
        {editorOpen && (
          <DishForm dish={editing} onSaved={handleSaved} onCancel={() => setEditorOpen(false)} />
        )}
      </Modal>

      <Modal
        open={removal !== null}
        onClose={() => setRemoval(null)}
        title="Eliminare il piatto?"
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setRemoval(null)} disabled={pending}>
              Annulla
            </Button>
            <Button variant="danger" size="md" onClick={confirmRemove} disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Eliminazione…" : "Elimina"}
            </Button>
          </>
        }
      >
        {removal && (
          <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
            <p>
              Il piatto <strong className="font-medium">{removal.dish.name}</strong> è presente in uno o più menù.
            </p>
            <p>
              Verrà tolto anche da: <strong className="font-medium">{removal.usedIn.map((m) => m.name).join(", ") || "menù non trovati"}</strong>.
            </p>
            <p className="text-slate-dark">Le prenotazioni già salvate non cambiano.</p>
          </div>
        )}
      </Modal>
    </section>
  );
}

function DishRow({
  dish,
  busy,
  onEdit,
  onRemove,
  onError,
}: {
  dish: Dish;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onError: (text: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(dish.active);

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      // Nessuna azione dedicata: si richiama upsertDish con i dati attuali e il nuovo stato.
      const result = await submitMutation(
        "catalog.upsertDish",
        upsertDish,
        [
          {
            id: dish.id,
            name: dish.name,
            course: dish.course,
            description: dish.description ?? "",
            active: next,
            sort: dish.sort,
          },
        ],
        {
          label: `${next ? "Attiva" : "Disattiva"} piatto · ${dish.name}`,
          entity: { type: "dish", id: dish.id },
          expectedUpdated: updatedAtOf(dish),
        },
      );
      if (!result.ok) {
        resetActive();
        onError(`Impossibile ${next ? "attivare" : "disattivare"} il piatto "${dish.name}": ${result.error}`);
        return;
      }
      // Offline lo stato resta quello scelto (ottimistico) finché la modifica non parte.
      if (isBrowserOnline() && !isQueued(result)) router.refresh();
    });
  }

  const menuCount = dish.used_in.length;
  const menuNames = dish.used_in.map((m) => m.name).filter(Boolean).join(", ");

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1 transition-[opacity,filter] duration-300",
          !active && "opacity-60 grayscale",
        )}
      >
        <p className="font-serif text-lg leading-tight text-ink">{dish.name}</p>
        {dish.description && <p className="text-[14px] leading-snug text-slate-dark">{dish.description}</p>}
        <p className="text-[13px] text-slate" title={menuNames || undefined}>
          {menuCount === 0 ? (
            "Non è in nessun menù"
          ) : (
            <>
              In {menuCount} menù: <span className="text-ink">{menuNames}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:shrink-0">
        <Switch
          checked={active}
          onCheckedChange={toggle}
          disabled={pending}
          label={`Piatto ${dish.name} attivo`}
          onLabel="Attivo"
          offLabel="Disattivato"
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={busy || pending}>
            Modifica
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={busy || pending}
            aria-label={`Rimuovi piatto ${dish.name}`}
          >
            Rimuovi
          </Button>
        </div>
      </div>
    </li>
  );
}
