/** Normalizza un testo per la ricerca: minuscole, senza accenti, spazi ai bordi rimossi. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase("it");
}
