import type { MetadataRoute } from "next";

/*
 * Web app manifest dell'agenda, servito solo sotto /admin.
 * Non è in app/ root: il metadata convention "manifest" verrebbe collegato anche al sito pubblico.
 * Scope e start_url restano dentro /admin/ così la PWA non copre il sito.
 */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    name: "Agenda · Casale del Notaio",
    short_name: "Agenda Casale",
    description: "Agenda digitale dei banchetti del Casale del Notaio.",
    id: "/admin/",
    start_url: "/admin/agenda",
    scope: "/admin/",
    display: "standalone",
    background_color: "#1C2B2D",
    theme_color: "#1C2B2D",
    lang: "it",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
