import { inventoryPdfFileName as fileNameFor } from "@/lib/inventory-utils";

/**
 * URL inline del PDF di un report di giacenza (route /api/inventory/[id]/pdf). Funzione pura: usabile da server e client.
 * Con `supplierId`: solo la lista d'ordine di quel fornitore.
 */
export function inventoryPdfHref(reportId: string, supplierId?: string): string {
  const base = `/api/inventory/${reportId}/pdf`;
  return supplierId ? `${base}?supplier=${encodeURIComponent(supplierId)}` : base;
}

/**
 * Nome del file scaricato/condiviso, coerente con la route del PDF. Con `supplierName` (nome del fornitore nel report)
 * è la lista d'ordine di quel fornitore, con il nome in slug.
 */
export function inventoryPdfFileName(reportDate: string, supplierName?: string | null): string {
  return fileNameFor(reportDate, supplierName);
}
