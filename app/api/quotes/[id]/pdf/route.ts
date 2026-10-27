import { documentError, withDocumentErrors } from "@/lib/documents/document-response";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { quoteFileName } from "@/lib/quote-utils";
import { getQuote } from "@/lib/data/quotes";
import { buildQuoteDocumentModel } from "@/lib/documents/quote-model";
import { renderQuotePdf } from "@/lib/documents/quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return documentError(401, "Sessione scaduta: accedi di nuovo al pannello e riprova.");
  if (!isAdmin(profile)) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const { id } = await params;
  if (!isRecordId(id)) {
    return documentError(400, "Identificativo preventivo non valido");
  }

  const quote = await getQuote(id);
  if (!quote) return documentError(404, "Preventivo non trovato");

  const buffer = await renderQuotePdf(buildQuoteDocumentModel(quote));

  // ?inline=1: si apre nel visualizzatore del browser (telefoni che non scaricano/condividono file).
  const disposition = new URL(req.url).searchParams.get("inline") === "1" ? "inline;" : "attachment;";
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition} filename="${quoteFileName(quote.number, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withDocumentErrors("preventivo PDF", handle);
