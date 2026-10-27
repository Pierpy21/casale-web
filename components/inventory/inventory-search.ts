/** Testo normalizzato per la ricerca: minuscolo, senza accenti (NFD + segni diacritici U+0300–U+036F), spazi compressi. Funzione pura. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("it")
    .replace(/\s+/g, " ")
    .trim();
}
