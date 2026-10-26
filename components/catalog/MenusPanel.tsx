"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMenuActive } from "@/app/actions/catalog";
import { Alert, Badge, Button, cn, EmptyState, Modal, Switch } from "@/components/ui";
import { formatEUR } from "@/lib/quote-utils";
import { COURSE_LABELS, COURSE_ORDER, type Dish, type Menu } from "@/lib/types";
import { MenuEditor } from "./MenuEditor";
import { useOptimisticActive } from "./useOptimisticActive";

export interface MenusPanelProps {
  menus: Menu[];
  /** Catalogo piatti (anche inattivi): l'editor mostra solo quelli attivi. */
  dishes: Dish[];
}

type Notice = { tone: "success" | "danger"; text: string };

/** Elenco menù con editor (crea/modifica) e interruttore di visibilità. */
export function MenusPanel({ menus, dishes }: MenusPanelProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Menu | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(menu: Menu) {
    setEditing(menu);
    setEditorOpen(true);
  }

  function handleSaved(message: string) {
    setEditorOpen(false);
    setNotice({ tone: "success", text: message });
    router.refresh();
  }

  return (
    <section aria-labelledby="menu-titolo" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Banchetti</p>
          <h2 id="menu-titolo" className="text-2xl">
            Menù ({menus.length})
          </h2>
        </div>
        <Button variant="primary" size="md" onClick={openNew}>
          Nuovo menù
        </Button>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {menus.length === 0 ? (
        <EmptyState
          title="Nessun menù in catalogo"
          description="Crea il primo menù: indica il prezzo per persona e i piatti per portata."
          action={
            <Button variant="outline" size="md" onClick={openNew}>
              Crea menù
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {menus.map((menu) => (
            <MenuCard
              key={menu.id}
              menu={menu}
              onEdit={() => openEdit(menu)}
              onError={(text) => setNotice({ tone: "danger", text })}
            />
          ))}
        </ul>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Modifica menù" : "Nuovo menù"}
        size="xl"
      >
        {editorOpen && (
          <MenuEditor
            menu={editing}
            dishes={dishes}
            onSaved={handleSaved}
            onCancel={() => setEditorOpen(false)}
          />
        )}
      </Modal>
    </section>
  );
}

function MenuCard({
  menu,
  onEdit,
  onError,
}: {
  menu: Menu;
  onEdit: () => void;
  onError: (text: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(menu.active);

  const groups = COURSE_ORDER.map((course) => ({
    course,
    items: menu.items.filter((item) => item.course === course),
  })).filter((group) => group.items.length > 0);

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await setMenuActive(menu.id, next);
      if (!result.ok) {
        resetActive();
        onError(`Impossibile ${next ? "rendere visibile" : "nascondere"} il menù "${menu.name}": ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-5 border border-sand border-t-[3px] bg-paper p-5 shadow-sm shadow-ink/5",
        active ? "border-t-petrol" : "border-t-disabled",
      )}
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div
            className={cn(
              "flex min-w-0 items-start gap-4 transition-[opacity,filter] duration-300",
              !active && "opacity-60 grayscale",
            )}
          >
            {menu.photos?.[0] && (
              <img
                src={menu.photos[0].url}
                alt=""
                loading="lazy"
                className="h-16 w-20 shrink-0 border border-sand object-cover"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              {menu.season && (
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{menu.season}</p>
              )}
              <h3 className="font-serif text-2xl leading-tight">{menu.name}</h3>
            </div>
          </div>
          <Switch
            checked={active}
            onCheckedChange={toggle}
            disabled={pending}
            label={`Visibilità del menù ${menu.name}`}
            onLabel="Visibile"
            offLabel="Nascosto"
          />
        </div>

        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 transition-[opacity,filter] duration-300",
            !active && "opacity-60 grayscale",
          )}
        >
          <div className="flex flex-wrap gap-2">{menu.is_kids && <Badge tone="bronze">Bambini</Badge>}</div>
          <p className="text-right">
            <span className="font-serif text-2xl tabular-nums text-ink">{formatEUR(menu.price_per_person)}</span>
            <span className="block text-[12px] text-slate-dark">a persona</span>
          </p>
        </div>
      </header>

      <div
        className={cn(
          "transition-[opacity,filter] duration-300",
          !active && "opacity-60 grayscale",
        )}
      >
        {groups.length === 0 ? (
          <p className="text-[14px] text-slate-dark">Nessun piatto inserito.</p>
        ) : (
          <dl className="flex flex-col gap-3 border-t border-sand pt-4">
            {groups.map((group) => (
              <div key={group.course}>
                <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
                  {COURSE_LABELS[group.course]}
                </dt>
                <dd>
                  <ul className="text-[14px] leading-snug text-ink">
                    {group.items.map((item) => (
                      <li key={item.id}>{item.name}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-sand pt-4">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={pending}>
          Modifica
        </Button>
      </div>
    </li>
  );
}
