"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deactivateInventoryProduct } from "@/app/actions/inventory";
import { Alert, Badge, Button } from "@/components/ui";
import type { InventoryProduct } from "@/lib/types";

/** Catalogo prodotti giacenza (admin): disattivazione. I prodotti disattivati restano nei report storici. */
export function InventoryProductList({ products }: { products: InventoryProduct[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (products.length === 0) {
    return (
      <p className="border border-dashed border-slate/40 bg-paper px-6 py-10 text-center text-[15px] text-slate">
        Nessun prodotto in catalogo. I prodotti si aggiungono dal modulo di nuova giacenza.
      </p>
    );
  }

  const deactivate = (product: InventoryProduct) => {
    if (!window.confirm(`Disattivare «${product.name}»? Non comparirà più tra i prodotti da scegliere.`)) return;
    setError(null);
    setPendingId(product.id);
    startTransition(async () => {
      const result = await deactivateInventoryProduct(product.id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <ul className="flex flex-col divide-y divide-sand border border-sand bg-paper">
        {products.map((product) => (
          <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="wrap-anywhere font-serif text-xl leading-tight text-ink">{product.name}</p>
              {product.unit && <p className="text-[14px] text-slate-dark">{product.unit}</p>}
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={product.active ? "success" : "neutral"}>{product.active ? "Attivo" : "Disattivato"}</Badge>
              {product.active && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-busy={pendingId === product.id || undefined}
                  onClick={() => deactivate(product)}
                >
                  {pendingId === product.id ? "Disattivazione…" : "Disattiva"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
