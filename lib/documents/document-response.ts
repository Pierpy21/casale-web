// Risposte di errore delle route dei documenti (PDF/DOCX). Sono pagine HTML leggibili: un testo semplice
// verrebbe salvato dal telefono come file (es. "pdf.txt" su Chrome per iPhone) invece di essere mostrato.

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function documentError(status: number, message: string): Response {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Documento non disponibile</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#1c2b2d;background:#f7f7f4"><h1 style="font-size:1.4rem">Documento non disponibile</h1><p style="font-size:1.05rem;line-height:1.5">${escapeHtml(message)}</p><p><a href="javascript:history.back()" style="color:#355a63">← Torna indietro</a></p></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Un errore imprevisto nella generazione diventa una pagina leggibile, con il dettaglio nei log del server. */
export function withDocumentErrors<C>(label: string, handler: RouteHandler<C>): RouteHandler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error(`[documenti] ${label}: generazione non riuscita`, err);
      return documentError(500, "Non è stato possibile generare il documento. Riprova tra poco; se il problema continua, avvisa chi gestisce il sito.");
    }
  };
}
