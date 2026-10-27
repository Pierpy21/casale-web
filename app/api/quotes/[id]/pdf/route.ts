import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { quoteFileName } from "@/lib/quote-utils";
import { getQuote } from "@/lib/data/quotes";
import { buildQuoteDocumentModel } from "@/lib/documents/quote-model";
import { renderQuotePdf } from "@/lib/documents/quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Non autenticato", { status: 401 });
  if (!isAdmin(profile)) return new Response("Non autorizzato", { status: 403 });

  const { id } = await params;
  if (!isRecordId(id)) {
    return new Response("Identificativo preventivo non valido", { status: 400 });
  }

  const quote = await getQuote(id);
  if (!quote) return new Response("Preventivo non trovato", { status: 404 });

  const buffer = await renderQuotePdf(buildQuoteDocumentModel(quote));

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${quoteFileName(quote.number, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
