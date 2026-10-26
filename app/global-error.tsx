"use client";

import { useStaleDeployReload } from "@/components/useStaleDeployReload";

export default function GlobalError({
  error,
}: {
  error: unknown;
  reset: () => void;
}) {
  const { updating } = useStaleDeployReload(error);

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          fontFamily: "system-ui, sans-serif",
          background: "#F5F1E8",
          color: "#1C2B2D",
          textAlign: "center",
        }}
      >
        <div role={updating ? "status" : "alert"} style={{ maxWidth: 360 }}>
          {updating ? (
            <p style={{ fontSize: 15 }}>Aggiornamento dell&apos;app in corso…</p>
          ) : (
            <>
              <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>Qualcosa non ha funzionato</h1>
              <p style={{ fontSize: 15, margin: "0 0 20px" }}>
                Ricarica la pagina per continuare. Se il problema persiste, contatta l&apos;amministratore.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 18px",
                  border: "1px solid #1C2B2D",
                  background: "transparent",
                  color: "#1C2B2D",
                  borderRadius: 2,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                Ricarica
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
