import type { SheetIssuer } from "@/components/documents/SheetPreview";
import { SHEET_ISSUER } from "@/lib/documents/reservations-view";

/** Intestazione dei fogli nell'anteprima: stessi testi dei PDF (SHEET_ISSUER), con il logo della pagina. */
export const SHEET_PREVIEW_ISSUER: SheetIssuer = {
  name: SHEET_ISSUER.name,
  tagline: SHEET_ISSUER.tagline,
  lines: SHEET_ISSUER.lines,
  logoSrc: "/logo-dark.svg",
};

/** Piè di pagina dei fogli (stesso testo dei PDF). */
export const SHEET_PREVIEW_FOOTER: string = SHEET_ISSUER.footer;
