import type { InventorySupplier } from "@/lib/types";

/**
 * URL inline del PDF di un report di giacenza (route /api/inventory/[id]/pdf). Funzione pura: usabile da server e client.
 * Con `supplier`: solo la lista d'ordine di quel fornitore.
 */
export function inventoryPdfHref(reportId: string, supplier?: InventorySupplier): string {
  const base = `/api/inventory/${reportId}/pdf`;
  return supplier ? `${base}?supplier=${supplier}` : base;
}

/** Nome del file scaricato/condiviso, coerente con la route del PDF. */
export function inventoryPdfFileName(reportDate: string, supplier?: InventorySupplier): string {
  return supplier ? `giacenza-${reportDate}-${supplier}.pdf` : `giacenza-${reportDate}.pdf`;
}
