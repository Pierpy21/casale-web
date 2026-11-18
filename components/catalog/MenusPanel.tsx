"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMenuActive } from "@/app/actions/catalog";
import { isBrowserOnline } from "@/lib/offline/network";
import { isQueued, submitMutation, updatedAtOf } from "@/lib/offline/submit";
import { Alert, Badge, Button, cn, Disclosure, EmptyState, Modal, Switch } from "@/components/ui";
import { formatEUR } from "@/lib/quote-utils";
import { COURSE_LABELS, COURSE_ORDER, type Dish, type Menu } from "@/lib/types";
import { MenuEditor, type MenuVariant } from "./MenuEditor";
import { useOptimisticActive } from "./useOptimisticActive";

export interface MenusPanelProps {
  menus: Menu[];
  /** Catalogo piatti (anche inattivi): l'editor mostra solo quelli attivi. */
  dishes: Dish[];
  /** "festive" = scheda "Menù festivi": stessa resa, con data della festa. */
  variant?: MenuVariant;
}

type Notice = { tone: "success" | "danger"; text: string };

const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

/** "YYYY-MM-DD" -> "25 dicembre 2026", senza passare per new Date(string). */
function formatFestiveDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS_IT[month - 1]} ${year}`;
}

/** Oggi nel fuso del locale (Europa/Roma) come "YYYY-MM-DD". */
function romeTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

/** Elenco menù con editor (crea/modifica) e interruttore di visibilità. */
export function MenusPanel({ menus, dishes, variant = "standard" }: MenusPanelProps) {
  const festive = variant === "festive";
  const today = festive ? romeTodayISO() : "";
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
    // Offline la pagina resta quella di prima: le modifiche partono appena torna la rete.
    setEditorOpen(false);
    setNotice({ tone: "success", text: message });
    if (isBrowserOnline()) router.refresh();
  }

  return (
    <section aria-labelledby="menu-titolo" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
            {festive ? "Feste" : "Banchetti"}
          </p>
          <h2 id="menu-titolo" className="text-2xl">
            {festive ? "Menù festivi" : "Menù"} ({menus.length})
          </h2>
        </div>
        <Button variant="primary" size="md" onClick={openNew}>
          {festive ? "Nuovo menù festivo" : "Nuovo menù"}
        </Button>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {menus.length === 0 ? (
        <EmptyState
          title={festive ? "Nessun menù festivo" : "Nessun menù in catalogo"}
          description={
            festive
              ? "Crea un menù per una festa, ad esempio il pranzo di Natale del 25 dicembre: piatti per portata, prezzo e foto."
              : "Crea il primo menù: indica il prezzo per persona e i piatti per portata."
          }
          action={
            <Button variant="outline" size="md" onClick={openNew}>
              {festive ? "Crea menù festivo" : "Crea menù"}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {menus.map((menu) => (
            <MenuCard
              key={menu.id}
              menu={menu}
              festive={festive}
              today={today}
              onEdit={() => openEdit(menu)}
              onError={(text) => setNotice({ tone: "danger", text })}
            />
          ))}
        </ul>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={
          festive
            ? editing
              ? "Modifica menù festivo"
              : "Nuovo menù festivo"
            : editing
              ? "Modifica menù"
              : "Nuovo menù"
        }
        size="xl"
        bare
      >
        {editorOpen && (
          <MenuEditor
            menu={editing}
            dishes={dishes}
            variant={variant}
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
  festive,
  today,
  onEdit,
  onError,
}: {
  menu: Menu;
  festive: boolean;
  /** "YYYY-MM-DD" di oggi (fuso Europa/Roma), usato solo nei menù festivi. */
  today: string;
  onEdit: () => void;
  onError: (text: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(menu.active);
  const festiveDay = festive && menu.festive_date ? menu.festive_date : null;
  const past = festiveDay !== null && festiveDay < today;

  const groups = COURSE_ORDER.map((course) => ({
    course,
    items: menu.items.filter((item) => item.course === course),
  })).filter((group) => group.items.length > 0);

  const dishCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const dishList = (
    <dl className="flex flex-col gap-3">
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
  );

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await submitMutation("catalog.setMenuActive", setMenuActive, [menu.id, next], {
        label: `${next ? "Mostra" : "Nascondi"} menù · ${menu.name}`,
        entity: { type: "menu", id: menu.id },
        expectedUpdated: updatedAtOf(menu),
      });
      if (!result.ok) {
        resetActive();
        onError(`Impossibile ${next ? "rendere visibile" : "nascondere"} il menù "${menu.name}": ${result.error}`);
        return;
      }
      if (isBrowserOnline() && !isQueued(result)) router.refresh();
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
              {festiveDay && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
                    {formatFestiveDay(festiveDay)}
                    {menu.season && ` · ${menu.season}`}
                  </p>
                  {past && <Badge tone="neutral">Passata</Badge>}
                </div>
              )}
              {!festiveDay && menu.season && (
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

        {menu.is_kids && (
          <div className={cn("flex flex-wrap gap-2 transition-[opacity,filter] duration-300", !active && "opacity-60 grayscale")}>
            <Badge tone="bronze">Bambini</Badge>
          </div>
        )}
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
          <>
            {/* Mobile e tablet: piatti compressi, si aprono con la freccia. Da xl (desktop) sempre visibili. */}
            <Disclosure
              className="-mb-3 border-t border-sand pt-2 xl:hidden"
              summary={`Visualizza piatti (${dishCount})`}
            >
              {/* Padding dentro il contenuto: sul pannello resterebbe visibile anche da chiuso. */}
              <div className="pb-1 pt-2">{dishList}</div>
            </Disclosure>
            <div className="hidden border-t border-sand pt-4 xl:block">{dishList}</div>
          </>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-sand pt-4">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={pending}>
          Modifica
        </Button>
        <p className={cn("text-right transition-[opacity,filter] duration-300", !active && "opacity-60 grayscale")}>
          <span className="font-serif text-2xl tabular-nums leading-none text-ink">{formatEUR(menu.price_per_person)}</span>
          <span className="block text-[12px] text-slate-dark">a persona</span>
        </p>
      </div>
    </li>
  );
}
