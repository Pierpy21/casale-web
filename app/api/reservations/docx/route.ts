import { documentError, withDocumentErrors } from "@/lib/documents/document-response";
import { getCurrentProfile } from "@/lib/auth";
import { canAssignRoom } from "@/lib/permissions";
import { DOCX_MIME } from "@/lib/quote-utils";
import { getReservationSheet } from "@/lib/data/bookings";
import { renderReservationsDocx } from "@/lib/documents/reservations-docx";
import { isIsoDate } from "@/lib/documents/reservation-date";

// Foglio prenotazioni del giorno in Word (DOCX). Accesso: admin e sala (attivi).
// Query: `?date=YYYY-MM-DD`, `inline=1` facoltativo (apre nel visualizzatore del browser invece di scaricare).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return documentError(401, "Sessione scaduta: accedi di nuovo al pannello e riprova.");
  if (!canAssignRoom(profile, "normale")) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  if (!isIsoDate(date)) return documentError(400, "Data non valida: usa il formato AAAA-MM-GG.");

  const sheet = await getReservationSheet(date);
  if (!sheet) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const buffer = await renderReservationsDocx(sheet);

  // ?inline=1: si apre nel visualizzatore del browser (telefoni che non scaricano/condividono file).
  const disposition = url.searchParams.get("inline") === "1" ? "inline;" : "attachment;";
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `${disposition} filename="prenotazioni-${date}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withDocumentErrors("foglio prenotazioni DOCX", handle);
