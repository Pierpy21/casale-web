import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendEventReminders } from "@/lib/notify";
import { addDaysISO, romeToday } from "@/lib/dates";

// Promemoria del giorno dopo, chiamato ogni giorno dal crontab del VPS (curl con Authorization: Bearer CRON_SECRET).
// Vedi docs/admin/POCKETBASE.md, sezione cron.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confronto a tempo costante: si confrontano i digest SHA-256 (stessa lunghezza sempre). */
function isAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, received);
}

export async function GET(req: Request) {
  if (!isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // "Domani" nel fuso di Roma, non in UTC.
    const tomorrow = addDaysISO(romeToday(), 1);
    const sent = await sendEventReminders(tomorrow);
    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[cron] promemoria non inviati:", err);
    return NextResponse.json({ error: "Errore durante l'invio dei promemoria" }, { status: 500 });
  }
}
