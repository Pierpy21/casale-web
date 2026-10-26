/** URL inline del PDF di un report di giacenza (route /api/inventory/[id]/pdf). Funzione pura: usabile da server e client. */
export function inventoryPdfHref(reportId: string): string {
  return `/api/inventory/${reportId}/pdf`;
}
