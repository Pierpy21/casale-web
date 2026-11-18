// Contratto della fascia "Buone Feste" della home. I menù festivi sono menù del catalogo con `festive_date`
// (vedi Menu in lib/types.ts): si gestiscono dalla scheda "Menù festivi" di Menù & Sale con lo stesso editor dei menù.

/** Portata di un menù festivo per il sito, con le voci nell'ordine del menù. */
export interface FestiveCourse {
  /** Etichetta della portata, es. "Antipasto". */
  label: string;
  items: { name: string; description: string }[];
}

/** Menù festivo come lo mostra il sito. */
export interface FestiveMenu {
  id: string;
  /** Nome del menù, es. "Pranzo di Natale". */
  name: string;
  /** Etichetta breve sopra la data (campo "Stagione / occasione" del menù, es. "Natale"); vuota se non indicata. */
  label: string;
  /** Giorno della festa, "YYYY-MM-DD". */
  date: string;
  /** Prezzo a persona in euro; null se 0. */
  price: number | null;
  courses: FestiveCourse[];
  /** URL pubblici delle foto del menù. */
  photos: string[];
}

/** Dati pubblici per la home: sezione visibile + menù festivi attivi da oggi in poi, ordinati per data crescente. */
export interface FestiveSection {
  /** Interruttore admin "Mostra la fascia Buone Feste sul sito". */
  enabled: boolean;
  menus: FestiveMenu[];
  /** URL di tutte le foto dei menù mostrati, nell'ordine dei menù (galleria "Momenti di festa"). */
  photos: string[];
}

/** Chiave in site_settings per l'interruttore della sezione. */
export const FESTIVE_SECTION_KEY = "festive_section";
