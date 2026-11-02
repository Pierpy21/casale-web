import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { getReservationSheet } from "@/lib/data/bookings";
import { isIsoDate } from "@/lib/documents/reservation-date";
import { buildReservationSheetView } from "@/lib/documents/reservations-view";
import { canAssignRoom } from "@/lib/permissions";

// Anteprima del foglio prenotazioni: la stessa vista formattata che usano PDF e DOCX, in JSON.
// Così l'anteprima mostra esattamente il contenuto dei file. Accesso: admin e sala (attivi), come i documenti.
// Query: `?date=YYYY-MM-DD`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function GET(req: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return jsonError(401, "Sessione scaduta: accedi di nuovo al pannello e riprova.");
    if (!canAssignRoom(profile, "normale")) return jsonError(403, "Il tuo profilo non può aprire questo documento.");

    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!isIsoDate(date)) return jsonError(400, "Data non valida: usa il formato AAAA-MM-GG.");

    const sheet = await getReservationSheet(date);
    if (!sheet) return jsonError(403, "Il tuo profilo non può aprire questo documento.");

    return NextResponse.json(buildReservationSheetView(sheet), { headers: NO_STORE });
  } catch (err) {
    console.error("[anteprima] foglio prenotazioni: caricamento non riuscito", err);
    return jsonError(500, "Non è stato possibile caricare il foglio. Riprova tra poco.");
  }
}
