import { documentError, withDocumentErrors } from "@/lib/documents/document-response";
import { getCurrentProfile } from "@/lib/auth";
import { canUseInventory } from "@/lib/permissions";
import { getInventoryReport, getInventorySuppliers } from "@/lib/data/inventory";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { buildInventoryPdfModel, renderInventoryPdf } from "@/lib/documents/inventory-pdf";

// PDF di un report di giacenza. Accesso: admin e cucina (attivi). Inline, così si può condividere dal telefono.
// Query facoltativa `?supplier=<id fornitore>`: lista d'ordine di un solo fornitore. L'id deve esistere tra i fornitori
// visibili (per la cucina sono quelli attivi). Il nome del file segue il nome del fornitore (slug).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return documentError(401, "Sessione scaduta: accedi di nuovo al pannello e riprova.");
  if (!canUseInventory(profile)) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const { id } = await params;
  if (!isRecordId(id)) return documentError(400, "Identificativo report non valido");

  const supplierParam = new URL(req.url).searchParams.get("supplier");
  const suppliers = await getInventorySuppliers({ includeInactive: true });
  const supplier = supplierParam === null ? undefined : suppliers.find((s) => s.id === supplierParam);
  if (supplierParam !== null && !supplier) return documentError(400, "Fornitore non valido");

  const report = await getInventoryReport(id);
  if (!report) return documentError(404, "Report non trovato");

  const model = buildInventoryPdfModel(report, { supplier, suppliers });
  const buffer = await renderInventoryPdf(model);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${model.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withDocumentErrors("giacenza PDF", handle);
