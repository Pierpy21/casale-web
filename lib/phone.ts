/**
 * Numeri di telefono: pulizia di ciò che arriva da incolla (iOS, Android, WhatsApp, PDF) e link di chiamata.
 * Funzioni pure, senza DOM: usabili nei componenti client e sul server (lib/validation.ts).
 */

/** Caratteri invisibili (marche bidi, zero-width, BOM) che le app mettono nei numeri copiati. */
const INVISIBLE = /[­؜​-‏‪-‮⁠-⁯﻿]/g;

/** Trattini e meno tipografici (en dash, em dash, ‐ ‑ ‒ − ecc.): diventano "-". */
const DASHES = /[‐-―−﹘﹣－]/g;

/** Separatori comuni nei numeri scritti a mano o copiati: diventano spazio. */
const SEPARATORS = /[./\\]/g;

/** Prefisso "tel:" (anche con spazi intorno), come nei link tel: incollati. */
const TEL_PREFIX = /^\s*tel:\s*/i;

export interface NormalizePhoneOptions {
  /**
   * false durante la digitazione: non toglie gli spazi ai bordi, altrimenti non si riesce a scrivere "340 1…".
   * Il valore finale (invio, salvataggio) va normalizzato con il default true.
   */
  trim?: boolean;
}

/**
 * Pulisce il testo di un cellulare: toglie caratteri invisibili e "tel:", converte spazi unicode e
 * cifre a tutta larghezza (fullwidth) in ASCII, sostituisce punti, slash e trattini tipografici,
 * comprime gli spazi. Lo zero iniziale ("00" internazionale) resta com'è.
 */
export function normalizePhoneInput(raw: string, options: NormalizePhoneOptions = {}): string {
  const trim = options.trim ?? true;
  const cleaned = raw
    .replace(INVISIBLE, "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/＋/g, "+")
    .replace(/[（）]/g, (paren) => (paren === "（" ? "(" : ")"))
    .replace(DASHES, "-")
    .replace(SEPARATORS, " ")
    // \s copre anche NBSP, spazi stretti (U+202F, U+2009) e spazio ideografico.
    .replace(/\s+/g, " ")
    .replace(TEL_PREFIX, "");
  return trim ? cleaned.trim() : cleaned;
}

/** Link di chiamata: tel: con sole cifre e "+" iniziale, dopo la normalizzazione. */
export function telHref(phone: string): string {
  return `tel:${normalizePhoneInput(phone).replace(/[^+0-9]/g, "")}`;
}
