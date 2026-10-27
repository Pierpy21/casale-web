"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { createInventoryProduct, updateInventoryProduct } from "@/app/actions/inventory";
import { useOptimisticActive } from "@/components/catalog/useOptimisticActive";
import { Alert, Button, Field, Input, Modal, Select, Switch, cn } from "@/components/ui";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_SUPPLIERS,
  INVENTORY_SUPPLIER_LABELS,
  type InventoryCategory,
  type InventoryProduct,
  type InventorySupplier,
} from "@/lib/types";
import { normalizeSearchText } from "./inventory-search";

export interface InventoryProductListProps {
  /** Tutti i prodotti (anche disattivati), già in ordine di catalogo. */
  products: InventoryProduct[];
}

type Notice = { tone: "success" | "danger"; text: string };

/** Catalogo prodotti della giacenza (solo admin): raggruppato per fornitore, con ricerca, attivazione, modifica e nuovi prodotti. */
export function InventoryProductList({ products }: InventoryProductListProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<InventoryProduct | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const normalizedQuery = normalizeSearchText(query);
  const searching = normalizedQuery.length > 0;

  const filtered = useMemo(() => {
    if (!searching) return products;
    return products.filter((p) =>
      normalizeSearchText([p.name, p.unit ?? "", INVENTORY_CATEGORY_LABELS[p.category]].join(" ")).includes(normalizedQuery),
    );
  }, [products, normalizedQuery, searching]);

  const sections = INVENTORY_SUPPLIERS.map((supplier) => ({
    supplier,
    label: INVENTORY_SUPPLIER_LABELS[supplier],
    items: filtered.filter((p) => p.supplier === supplier),
    total: products.filter((p) => p.supplier === supplier).length,
    active: products.filter((p) => p.supplier === supplier && p.active).length,
  })).filter((section) => !searching || section.items.length > 0);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (product: InventoryProduct) => {
    setEditing(product);
    setFormOpen(true);
  };

  const handleSaved = (message: string) => {
    setFormOpen(false);
    setNotice({ tone: "success", text: message });
    router.refresh();
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 sm:max-w-md sm:flex-1">
          <Input
            id="prodotti-search"
            type="search"
            aria-label="Cerca un prodotto"
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="Cerca per nome, unità o categoria…"
            className="h-12 text-[16px]"
          />
        </div>
        <Button variant="primary" size="md" onClick={openNew} className="min-h-12 w-full sm:w-auto">
          <Plus aria-hidden="true" className="size-4" />
          Aggiungi prodotto
        </Button>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {searching && sections.length === 0 && (
        <p className="border border-dashed border-slate/40 bg-paper px-6 py-10 text-center text-[15px] text-slate">
          Nessun prodotto corrisponde alla ricerca.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.supplier} aria-labelledby={`fornitore-${section.supplier}`} className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-sand pb-2">
            <h2 id={`fornitore-${section.supplier}`} className="text-2xl leading-tight">
              {section.label}
            </h2>
            <p className="text-[13px] tabular-nums text-slate-dark">
              {section.active} attivi su {section.total}
            </p>
          </div>

          {section.items.length === 0 ? (
            <p className="border border-dashed border-slate/40 bg-paper px-5 py-6 text-center text-[15px] text-slate">
              Nessun prodotto di questo fornitore.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-sand border border-sand bg-paper">
              {section.items.map((product) => (
                <ProductRow key={product.id} product={product} onEdit={() => openEdit(product)} onNotice={setNotice} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Modifica prodotto" : "Nuovo prodotto"}>
        {formOpen && <ProductForm key={editing?.id ?? "new"} product={editing} onSaved={handleSaved} onCancel={() => setFormOpen(false)} />}
      </Modal>
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
  onNotice,
}: {
  product: InventoryProduct;
  onEdit: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(product.active);

  const toggle = (next: boolean) => {
    setActive(next);
    startTransition(async () => {
      const result = await updateInventoryProduct(product.id, { active: next });
      if (!result.ok) {
        resetActive();
        onNotice({ tone: "danger", text: `Impossibile ${next ? "attivare" : "disattivare"} «${product.name}»: ${result.error}` });
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="flex min-w-0 flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <div className={cn("flex min-w-0 flex-col gap-0.5 transition-[opacity,filter] duration-300", !active && "opacity-60 grayscale")}>
        <p className="wrap-anywhere font-serif text-xl leading-tight text-ink">{product.name}</p>
        <p className="text-[14px] text-slate-dark wrap-anywhere">
          {product.unit ?? "Senza unità"} · <span className="text-bronze">{INVENTORY_CATEGORY_LABELS[product.category]}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:shrink-0">
        <Switch
          checked={active}
          onCheckedChange={toggle}
          disabled={pending}
          label={`Prodotto ${product.name} attivo`}
          onLabel="Attivo"
          offLabel="Disattivato"
        />
        <Button variant="outline" size="sm" onClick={onEdit} disabled={pending} className="min-h-11 sm:min-h-0">
          Modifica
        </Button>
      </div>
    </li>
  );
}

function ProductForm({
  product,
  onSaved,
  onCancel,
}: {
  product: InventoryProduct | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const idPrefix = product ? `prodotto-${product.id}` : "prodotto-new";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const unit = String(form.get("unit") ?? "").trim();
    const category = String(form.get("category") ?? "altro") as InventoryCategory;
    const supplier = String(form.get("supplier") ?? "altro") as InventorySupplier;

    setFormError(null);
    setErrors({});
    startTransition(async () => {
      const result = product
        ? await updateInventoryProduct(product.id, {
            name,
            unit,
            category,
            supplier,
            sort: Number(form.get("sort") ?? product.sort),
          })
        : await createInventoryProduct({ name, unit, category, supplier });
      if (!result.ok) {
        setFormError(result.error);
        const mapped: Record<string, string> = {};
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (messages[0]) mapped[key] = messages[0];
        }
        setErrors(mapped);
        return;
      }
      onSaved(product ? `«${name}» salvato.` : `«${name}» aggiunto al catalogo.`);
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={product ? "Modifica prodotto" : "Nuovo prodotto"} className="flex flex-col gap-5">
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Field label="Nome" htmlFor={`${idPrefix}-name`} required error={errors.name}>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={product?.name ?? ""}
          maxLength={200}
          required
          invalid={!!errors.name}
          disabled={pending}
          className="text-[16px]"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Unità" htmlFor={`${idPrefix}-unit`} error={errors.unit} hint="Es. kg, g, bottiglie. Facoltativa.">
          <Input
            id={`${idPrefix}-unit`}
            name="unit"
            defaultValue={product?.unit ?? ""}
            maxLength={40}
            invalid={!!errors.unit}
            disabled={pending}
          />
        </Field>
        <Field label="Categoria" htmlFor={`${idPrefix}-category`} error={errors.category}>
          <Select id={`${idPrefix}-category`} name="category" defaultValue={product?.category ?? "altro"} invalid={!!errors.category} disabled={pending}>
            {INVENTORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INVENTORY_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Fornitore" htmlFor={`${idPrefix}-supplier`} error={errors.supplier}>
          <Select id={`${idPrefix}-supplier`} name="supplier" defaultValue={product?.supplier ?? "altro"} invalid={!!errors.supplier} disabled={pending}>
            {INVENTORY_SUPPLIERS.map((s) => (
              <option key={s} value={s}>
                {INVENTORY_SUPPLIER_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        {product && (
          <Field label="Ordine nella categoria" htmlFor={`${idPrefix}-sort`} error={errors.sort} hint="Numero più basso = in alto.">
            <Input
              id={`${idPrefix}-sort`}
              name="sort"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              defaultValue={String(product.sort)}
              invalid={!!errors.sort}
              disabled={pending}
            />
          </Field>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-sand pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending} className="min-h-11">
          Annulla
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined} className="min-h-11">
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}
