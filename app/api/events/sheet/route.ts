import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { getEventSheet } from "@/lib/data/bookings";
import { isIsoDate } from "@/lib/documents/reservation-date";
import { buildEventSheetView } from "@/lib/documents/events-view";
import { canViewEventSheet } from "@/lib/permissions";

// Anteprima del foglio eventi: la stessa vista formattata che usano PDF e DOCX, in JSON.
// Accesso: admin e cucina (attivi), come i documenti. Query: `?date=YYYY-MM-DD`.
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
    if (!canViewEventSheet(profile)) return jsonError(403, "Il tuo profilo non può aprire questo documento.");

    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!isIsoDate(date)) return jsonError(400, "Data non valida: usa il formato AAAA-MM-GG.");

    const sheet = await getEventSheet(date);
    if (!sheet) return jsonError(403, "Il tuo profilo non può aprire questo documento.");

    return NextResponse.json(buildEventSheetView(sheet), { headers: NO_STORE });
  } catch (err) {
    console.error("[anteprima] foglio eventi: caricamento non riuscito", err);
    return jsonError(500, "Non è stato possibile caricare il foglio. Riprova tra poco.");
  }
}
