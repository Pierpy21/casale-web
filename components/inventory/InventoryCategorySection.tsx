"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button, cn } from "@/components/ui";
import type { InventoryProduct, InventoryCategory, InventorySupplier } from "@/lib/types";
import { InventoryNewProductForm } from "./InventoryNewProductForm";
import { InventoryQuantityStepper } from "./InventoryQuantityStepper";
import type { InventoryDraftCount } from "./inventory-draft";

export type InventoryCountField = "stock" | "to_order";

export type NewInventoryProductInput = {
  name: string;
  unit: string | null;
  category: InventoryCategory;
  supplier?: InventorySupplier;
};

export interface InventoryCategorySectionProps {
  /** Sezione per categoria: i prodotti aggiunti qui prendono questa categoria. */
  category?: InventoryCategory;
  /** Sezione per fornitore (admin): i prodotti aggiunti qui prendono questo fornitore; la categoria si sceglie. */
  supplier?: InventorySupplier;
  label: string;
  /** Prodotti della categoria da mostrare (già filtrati dalla ricerca). */
  products: InventoryProduct[];
  /** Prodotti totali della categoria (senza filtro). */
  totalCount: number;
  /** Prodotti compilati della categoria (giacenza o da ordinare > 0), senza filtro. */
  filledCount: number;
  counts: Record<string, InventoryDraftCount>;
  /** Solo modalità a fisarmonica (default true). */
  open?: boolean;
  /** Solo modalità a fisarmonica. */
  onToggle?: () => void;
  /**
   * Modalità incorporata (tablet, gruppo aperto): niente intestazione a fisarmonica, il titolo è nella pagina
   * chiamante; restano righe prodotto e aggiunta di un prodotto nuovo.
   */
  embedded?: boolean;
  onChangeCount: (productId: string, field: InventoryCountField, value: number) => void;
  onCreate: (input: NewInventoryProductInput) => Promise<string | null>;
  disabled: boolean;
}

/** Sezione a fisarmonica (categoria per la cucina, fornitore per l'admin): intestazione con conteggio, righe prodotto e aggiunta di un prodotto nuovo. */
export function InventoryCategorySection({
  category,
  supplier,
  label,
  products,
  totalCount,
  filledCount,
  counts,
  open = true,
  onToggle,
  embedded = false,
  onChangeCount,
  onCreate,
  disabled,
}: InventoryCategorySectionProps) {
  const uid = useId();
  const headerId = `${uid}-header`;
  const panelId = `${uid}-panel`;
  const [adding, setAdding] = useState(false);

  const countText =
    filledCount > 0
      ? `${filledCount} compilati su ${totalCount}`
      : `${totalCount} ${totalCount === 1 ? "prodotto" : "prodotti"}`;

  const body = (
    <>
      {products.length === 0 ? (
        <p className="px-4 py-4 text-[15px] text-slate-dark sm:px-5">Nessun prodotto in questa sezione.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-sand">
          {products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              count={counts[product.id]}
              disabled={disabled}
              onChange={onChangeCount}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-sand px-4 py-3 sm:px-5">
        {adding ? (
          <InventoryNewProductForm
            idPrefix={`${uid}-new`}
            category={category}
            onCreate={(input) => onCreate({ ...input, supplier })}
            onClose={() => setAdding(false)}
            disabled={disabled}
          />
        ) : (
          <Button variant="outline" size="md" onClick={() => setAdding(true)} disabled={disabled} className="min-h-11 w-full sm:w-auto">
            <Plus aria-hidden="true" className="size-4" />
            Aggiungi prodotto
          </Button>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="min-w-0 border border-sand bg-paper">{body}</div>;
  }

  return (
    <section aria-label={label} className="min-w-0 border border-sand bg-paper">
      <h3>
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-petrol sm:px-5"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-serif text-xl leading-tight text-ink">{label}</span>
            <span className={cn("text-[13px] tabular-nums", filledCount > 0 ? "font-medium text-petrol" : "text-slate-dark")}>
              {countText}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0 text-petrol transition-transform duration-200", open && "rotate-180")} />
        </button>
      </h3>

      <div id={panelId} role="region" aria-labelledby={headerId} hidden={!open} className="border-t border-sand">
        {body}
      </div>
    </section>
  );
}

function ProductRow({
  product,
  count,
  disabled,
  onChange,
}: {
  product: InventoryProduct;
  count: InventoryDraftCount | undefined;
  disabled: boolean;
  onChange: (productId: string, field: InventoryCountField, value: number) => void;
}) {
  const stock = count?.stock ?? 0;
  const toOrder = count?.to_order ?? 0;
  const filled = stock > 0 || toOrder > 0;

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-3 border-l-[3px] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5",
        toOrder > 0 ? "border-l-warning" : filled ? "border-l-petrol" : "border-l-transparent",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-1">
        <p className="wrap-anywhere font-serif text-[20px] leading-snug text-ink">{product.name}</p>
        {product.unit && <p className="text-[14px] text-slate-dark">{product.unit}</p>}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:w-[24rem] sm:shrink-0">
        <InventoryQuantityStepper
          id={`stock-${product.id}`}
          label="Giacenza"
          itemName={product.name}
          value={stock}
          disabled={disabled}
          onChange={(value) => onChange(product.id, "stock", value)}
        />
        <InventoryQuantityStepper
          id={`order-${product.id}`}
          label="Da ordinare"
          itemName={product.name}
          value={toOrder}
          disabled={disabled}
          onChange={(value) => onChange(product.id, "to_order", value)}
        />
      </div>
    </li>
  );
}
