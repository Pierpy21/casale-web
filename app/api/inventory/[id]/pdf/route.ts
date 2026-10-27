import { getCurrentProfile } from "@/lib/auth";
import { canUseInventory } from "@/lib/permissions";
import { getInventoryReport } from "@/lib/data/inventory";
import { isInventorySupplier } from "@/lib/inventory-utils";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { buildInventoryPdfModel, renderInventoryPdf } from "@/lib/documents/inventory-pdf";

// PDF di un report di giacenza. Accesso: admin e cucina (attivi). Inline, così si può condividere dal telefono.
// Query facoltativa `?supplier=viagrande|amadori|vegagel|altro`: lista d'ordine di un solo fornitore.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Non autenticato", { status: 401 });
  if (!canUseInventory(profile)) return new Response("Non autorizzato", { status: 403 });

  const { id } = await params;
  if (!isRecordId(id)) return new Response("Identificativo report non valido", { status: 400 });

  const supplierParam = new URL(req.url).searchParams.get("supplier");
  if (supplierParam !== null && !isInventorySupplier(supplierParam)) {
    return new Response("Fornitore non valido", { status: 400 });
  }
  const supplier = isInventorySupplier(supplierParam) ? supplierParam : undefined;

  const report = await getInventoryReport(id);
  if (!report) return new Response("Report non trovato", { status: 404 });

  const buffer = await renderInventoryPdf(buildInventoryPdfModel(report, { supplier }));
  const fileName = supplier ? `giacenza-${report.report_date}-${supplier}.pdf` : `giacenza-${report.report_date}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
