import { documentError, withDocumentErrors } from "@/lib/documents/document-response";
import { getCurrentProfile } from "@/lib/auth";
import { canAssignRoom } from "@/lib/permissions";
import { getReservationSheet } from "@/lib/data/bookings";
import { renderReservationsPdf } from "@/lib/documents/reservations-pdf";
import { isIsoDate } from "@/lib/documents/reservation-date";

// Foglio prenotazioni del giorno in PDF. Accesso: admin e sala (attivi). Inline, così si può condividere dal telefono.
// Query: `?date=YYYY-MM-DD`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return documentError(401, "Sessione scaduta: accedi di nuovo al pannello e riprova.");
  if (!canAssignRoom(profile, "normale")) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isIsoDate(date)) return documentError(400, "Data non valida: usa il formato AAAA-MM-GG.");

  const sheet = await getReservationSheet(date);
  if (!sheet) return documentError(403, "Il tuo profilo non può aprire questo documento.");

  const buffer = await renderReservationsPdf(sheet);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="prenotazioni-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withDocumentErrors("foglio prenotazioni PDF", handle);
