import { documentError, withDocumentErrors } from "@/lib/documents/document-response";
import { getCurrentProfile } from "@/lib/auth";
import { canViewEventSheet } from "@/lib/permissions";
import { DOCX_MIME } from "@/lib/quote-utils";
import { getEventSheet } from "@/lib/data/bookings";
import { renderEventsDocx } from "@/lib/documents/events-docx";
import { isIsoDate } from "@/lib/documents/reservation-date";

// Foglio eventi del giorno in Word (DOCX, per la cucina). Accesso: admin e cucina (attivi).
// Query: `?date=YYYY-MM-DD`, `inline=1` facoltativo (apre nel visualizzatore del browser invece di scaricare).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return documentError(401, "Sessione scaduta: accedi di nuovo al pannello e riprova.");
  if (!canViewEventSheet(profile)) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  if (!isIsoDate(date)) return documentError(400, "Data non valida: usa il formato AAAA-MM-GG.");

  const sheet = await getEventSheet(date);
  if (!sheet) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const buffer = await renderEventsDocx(sheet);

  // ?inline=1: si apre nel visualizzatore del browser (telefoni che non scaricano/condividono file).
  const disposition = url.searchParams.get("inline") === "1" ? "inline;" : "attachment;";
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `${disposition} filename="eventi-${date}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withDocumentErrors("foglio eventi DOCX", handle);
