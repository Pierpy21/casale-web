// Contratto dei menù festivi (fascia "Buone Feste" della home + sezione admin in Menù & Sale).

/** Foto di un menù festivo: `file` è il nome in PocketBase (per rimuoverla), `url` l'indirizzo pubblico. */
export interface FestivePhoto {
  file: string;
  url: string;
}

/** Menù festivo come lo vede l'admin (anche quelli disattivati o passati). */
export interface FestiveMenu {
  id: string;
  title: string;
  /** Giorno della festa, formato "YYYY-MM-DD". */
  date: string;
  /** Prezzo a persona in euro; null = non mostrato. */
  price: number | null;
  /** Portate, una per voce (dal campo testo diviso per righe, righe vuote scartate). */
  courses: string[];
  notes: string;
  photos: FestivePhoto[];
  active: boolean;
  /** ISO, per il controllo conflitti delle mutation. */
  updated: string;
}

/** Dati pubblici per la home: sezione visibile + menù attivi da oggi in poi, ordinati per data crescente. */
export interface FestiveSection {
  /** Interruttore admin "Mostra sezione sul sito". */
  enabled: boolean;
  menus: FestiveMenu[];
  /** URL di tutte le foto dei menù mostrati, nell'ordine dei menù (lavagna "Foto delle feste"). */
  photos: string[];
}

/** Chiave in site_settings per l'interruttore della sezione. */
export const FESTIVE_SECTION_KEY = "festive_section";
