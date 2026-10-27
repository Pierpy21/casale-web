"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { createInventoryProduct, submitInventoryReport } from "@/app/actions/inventory";
import { Alert, Button, Field, Input, cn } from "@/components/ui";
import { compareInventoryProducts } from "@/lib/inventory-utils";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_SUPPLIERS,
  INVENTORY_SUPPLIER_LABELS,
  type InventoryCategory,
  type InventoryProduct,
  type InventorySupplier,
} from "@/lib/types";
import { InventoryCategorySection, type InventoryCountField, type NewInventoryProductInput } from "./InventoryCategorySection";
import { InventoryNewProductForm } from "./InventoryNewProductForm";
import {
  clearInventoryDraft,
  readInventoryDraft,
  writeInventoryDraft,
  type InventoryDraftCount,
} from "./inventory-draft";
import { normalizeSearchText } from "./inventory-search";

export interface InventoryReportFormProps {
  /** Prodotti attivi dal catalogo. */
  products: InventoryProduct[];
  /** Data di oggi (YYYY-MM-DD), calcolata sul server per evitare differenze di fuso. */
  today: string;
  /** Raggruppamento: per categoria (cucina) o per fornitore (admin). */
  groupBy?: "category" | "supplier";
}

type Group = {
  key: string;
  label: string;
  category?: InventoryCategory;
  supplier?: InventorySupplier;
  all: InventoryProduct[];
};

function buildGroups(products: InventoryProduct[], groupBy: "category" | "supplier"): Group[] {
  if (groupBy === "supplier") {
    return INVENTORY_SUPPLIERS.map((supplier) => ({
      key: supplier,
      label: INVENTORY_SUPPLIER_LABELS[supplier],
      supplier,
      all: products.filter((p) => p.supplier === supplier),
    }));
  }
  return INVENTORY_CATEGORIES.map((category) => ({
    key: category,
    label: INVENTORY_CATEGORY_LABELS[category],
    category,
    all: products.filter((p) => p.category === category),
  }));
}

type Counts = Record<string, InventoryDraftCount>;

const NO_COUNT: InventoryDraftCount = { stock: 0, to_order: 0 };
/** Ordine dei prodotti aggiunti al volo: in fondo alla propria categoria. */
const APPENDED_SORT = 1_000_000;

/**
 * Nuova giacenza (cucina e admin): date e note in alto, prodotti a fisarmonica per categoria (cucina)
 * o per fornitore (admin), ricerca che filtra tutte le sezioni, barra di riepilogo e invio fisso in basso.
 * Le quantità restano in una bozza locale: un ricaricamento non fa perdere il lavoro.
 */
export function InventoryReportForm({ products: initialProducts, today, groupBy = "category" }: InventoryReportFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts);
  const [reportDate, setReportDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Counts>({});
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(buildGroups(initialProducts, groupBy).filter((g) => g.all.length > 0).slice(0, 1).map((g) => g.key)),
  );
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [addingFromSearch, setAddingFromSearch] = useState(false);

  // Bozza: si legge dopo il primo render (localStorage non esiste sul server) e poi si salva a ogni modifica.
  useEffect(() => {
    const draft = readInventoryDraft();
    if (draft) {
      setReportDate(draft.reportDate);
      setNotes(draft.notes);
      setCounts(draft.counts);
      setRestored(Object.keys(draft.counts).length > 0 || draft.notes.length > 0);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeInventoryDraft({ reportDate, notes, counts });
  }, [hydrated, reportDate, notes, counts]);

  const normalizedQuery = normalizeSearchText(query);
  const searching = normalizedQuery.length > 0;
  const matches = (p: InventoryProduct) => !searching || normalizeSearchText(p.name).includes(normalizedQuery);

  const groups = buildGroups(products, groupBy).map((group) => ({
    ...group,
    shown: group.all.filter(matches),
    filled: group.all.filter((p) => isFilled(counts[p.id])).length,
  }));
  const visibleGroups = searching ? groups.filter((g) => g.shown.length > 0) : groups;
  const filledTotal = products.filter((p) => isFilled(counts[p.id])).length;
  const toOrderTotal = products.filter((p) => (counts[p.id]?.to_order ?? 0) > 0).length;

  const isOpen = (key: string) => searching || openGroups.has(key);

  const toggleGroup = (key: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const changeCount = (productId: string, field: InventoryCountField, value: number) => {
    setFormError(null);
    setCounts((current) => {
      const next: InventoryDraftCount = { ...(current[productId] ?? NO_COUNT), [field]: value };
      const rest = { ...current };
      if (next.stock === 0 && next.to_order === 0) delete rest[productId];
      else rest[productId] = next;
      return rest;
    });
  };

  /** Crea un prodotto nel catalogo e lo inserisce nell'elenco (anche se esisteva già: si usa il dato del server). */
  const createProduct = async (input: NewInventoryProductInput): Promise<string | null> => {
    const result = await createInventoryProduct({
      name: input.name,
      unit: input.unit,
      category: input.category,
      ...(input.supplier ? { supplier: input.supplier } : {}),
    });
    if (!result.ok) return result.error;
    const ref = result.data;
    setProducts((list) => {
      if (list.some((p) => p.id === ref.id)) return list;
      const created: InventoryProduct = {
        id: ref.id,
        name: ref.name,
        unit: ref.unit,
        category: ref.category,
        supplier: ref.supplier,
        sort: APPENDED_SORT,
        active: true,
      };
      return [...list, created].sort(compareInventoryProducts);
    });
    return null;
  };

  const discardDraft = () => {
    clearInventoryDraft();
    setReportDate(today);
    setNotes("");
    setCounts({});
    setRestored(false);
  };

  const filledLines = products.flatMap((p) => {
    const c = counts[p.id];
    return c && isFilled(c) ? [{ product_id: p.id, stock: c.stock, to_order: c.to_order }] : [];
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!reportDate) {
      setFormError("Indica la data della giacenza.");
      return;
    }
    if (filledLines.length === 0) {
      setFormError("Compila almeno un prodotto: giacenza o quantità da ordinare.");
      return;
    }
    startTransition(async () => {
      const result = await submitInventoryReport({
        report_date: reportDate,
        notes: notes.trim() || null,
        lines: filledLines,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      clearInventoryDraft();
      router.push(`/admin/giacenza/${result.data.id}`);
    });
  };

  /** Invio nel campo di ricerca o note: non deve inviare il modulo. */
  const blockEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.preventDefault();
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Nuova giacenza" className="flex min-w-0 flex-col gap-5">
      {formError && <Alert tone="danger">{formError}</Alert>}

      {restored && (
        <Alert tone="info">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>Bozza ripristinata: il modulo riprende da dove l’avevi lasciato.</span>
            <Button variant="ghost" size="sm" onClick={discardDraft} disabled={pending}>
              Scarta bozza
            </Button>
          </span>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-end">
        <Field label="Data" htmlFor="report-date" required>
          <Input
            id="report-date"
            type="date"
            disabled={pending}
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="text-[17px]"
          />
        </Field>
        <Field label="Note" htmlFor="report-notes" hint="Facoltative: visibili nel PDF">
          <Input
            id="report-notes"
            type="text"
            maxLength={2000}
            disabled={pending}
            value={notes}
            onKeyDown={blockEnter}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Es. consegna Amadori rimandata"
            className="text-[17px]"
          />
        </Field>
      </div>

      <div className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-10 -mx-4 flex flex-col gap-2 bg-paper px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:top-0 lg:px-10">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-dark" />
          <Input
            id="inventory-search"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            aria-label="Cerca un prodotto"
            disabled={pending}
            value={query}
            onKeyDown={blockEnter}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un prodotto…"
            className="h-12 pl-12 text-[17px]"
          />
        </div>
      </div>

      {searching && visibleGroups.length === 0 && (
        <div className="flex flex-col gap-3 border border-dashed border-slate/40 bg-paper px-4 py-6 sm:px-6">
          <p className="text-[16px] text-ink">
            Nessun prodotto corrisponde a «<span className="wrap-anywhere">{query.trim()}</span>».
          </p>
          {addingFromSearch ? (
            <InventoryNewProductForm
              idPrefix="inventory-search-new"
              defaultName={query.trim()}
              onCreate={createProduct}
              onClose={() => setAddingFromSearch(false)}
              disabled={pending}
            />
          ) : (
            <div>
              <Button variant="outline" size="md" onClick={() => setAddingFromSearch(true)} disabled={pending} className="min-h-11 max-w-full">
                <span className="truncate">Aggiungi «{query.trim()}» come nuovo prodotto</span>
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3" aria-label={groupBy === "supplier" ? "Prodotti per fornitore" : "Prodotti per categoria"}>
        {visibleGroups.map((group) => (
          <InventoryCategorySection
            key={group.key}
            category={group.category}
            supplier={group.supplier}
            label={group.label}
            products={group.shown}
            totalCount={group.all.length}
            filledCount={group.filled}
            counts={counts}
            open={isOpen(group.key)}
            onToggle={() => toggleGroup(group.key)}
            onChangeCount={changeCount}
            onCreate={createProduct}
            disabled={pending}
          />
        ))}
      </div>

      <div
        className={cn(
          "sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col gap-3 border-t border-sand bg-paper/95 px-4 py-3 shadow-[0_-10px_24px_-18px_rgba(28,43,45,0.45)] backdrop-blur",
          "sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:bottom-0 lg:-mx-10 lg:px-10",
        )}
      >
        <p role="status" aria-live="polite" className="text-[15px] tabular-nums text-slate-dark">
          <span className="font-semibold text-ink">{filledTotal} {filledTotal === 1 ? "prodotto" : "prodotti"}</span>
          {" · "}
          <span className="font-semibold text-ink">{toOrderTotal} da ordinare</span>
        </p>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || filledTotal === 0}
          aria-busy={pending || undefined}
          className="min-h-12 w-full sm:w-auto"
        >
          {pending ? "Invio in corso…" : "Invia giacenza"}
        </Button>
      </div>
    </form>
  );
}

function isFilled(count: InventoryDraftCount | undefined): boolean {
  return !!count && (count.stock > 0 || count.to_order > 0);
}
