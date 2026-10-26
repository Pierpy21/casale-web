import { getCurrentProfile } from "@/lib/auth";
import { canUseInventory } from "@/lib/permissions";
import { getInventoryReport } from "@/lib/data/inventory";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { buildInventoryPdfModel, renderInventoryPdf } from "@/lib/documents/inventory-pdf";

// PDF di un report di giacenza. Accesso: admin e cucina (attivi). Inline, così si può condividere dal telefono.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Non autenticato", { status: 401 });
  if (!canUseInventory(profile)) return new Response("Non autorizzato", { status: 403 });

  const { id } = await params;
  if (!isRecordId(id)) return new Response("Identificativo report non valido", { status: 400 });

  const report = await getInventoryReport(id);
  if (!report) return new Response("Report non trovato", { status: 404 });

  const buffer = await renderInventoryPdf(buildInventoryPdfModel(report));
  const fileName = `giacenza-${report.report_date}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
