import { getCurrentProfile } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { fetchOne } from "@/lib/pocketbase/queries";
import { RECEIPT_MIME_TYPES } from "@/lib/validation";

// Ricevuta di un acconto (file PROTETTO su PocketBase). Solo admin attivo.
// Il file si recupera con un token di file dell'account di servizio: il browser non vede mai l'URL interno.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Non autenticato", { status: 401 });
  if (!isAdmin(profile)) return new Response("Non autorizzato", { status: 403 });

  const { id } = await params;
  if (!isRecordId(id)) return new Response("Identificativo acconto non valido", { status: 400 });

  const db = await getAdminPb();
  const payment = await fetchOne(db, "payments", id);
  if (!payment || !payment.receipt) return new Response("Ricevuta non trovata", { status: 404 });

  const filename = String(payment.receipt);
  const token = await db.files.getToken();
  const upstream = await fetch(db.files.getURL(payment, filename, { token }), { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    console.error("[receipts] download ricevuta fallito:", upstream.status);
    return new Response("Impossibile aprire la ricevuta", { status: 502 });
  }

  const declared = String(payment.receipt_type ?? "");
  const contentType = (RECEIPT_MIME_TYPES as readonly string[]).includes(declared)
    ? declared
    : "application/octet-stream";
  const safeName = String(payment.receipt_name ?? "ricevuta").replace(/[^A-Za-z0-9._-]+/g, "-") || "ricevuta";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
