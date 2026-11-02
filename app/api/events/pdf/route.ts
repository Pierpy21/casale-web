import { documentError, withDocumentErrors } from "@/lib/documents/document-response";
import { getCurrentProfile } from "@/lib/auth";
import { canViewEventSheet } from "@/lib/permissions";
import { getEventSheet } from "@/lib/data/bookings";
import { renderEventsPdf } from "@/lib/documents/events-pdf";
import { isIsoDate } from "@/lib/documents/reservation-date";

// Foglio eventi del giorno in PDF (per la cucina). Accesso: admin e cucina (attivi). Inline, così si può condividere dal telefono.
// Query: `?date=YYYY-MM-DD`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return documentError(401, "Sessione scaduta: accedi di nuovo al pannello e riprova.");
  if (!canViewEventSheet(profile)) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isIsoDate(date)) return documentError(400, "Data non valida: usa il formato AAAA-MM-GG.");

  const sheet = await getEventSheet(date);
  if (!sheet) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const buffer = await renderEventsPdf(sheet);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="eventi-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withDocumentErrors("foglio eventi PDF", handle);
