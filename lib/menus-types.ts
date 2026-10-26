// Tipi del menu pubblico del sito (letti da lib/menus.ts). Nessun import server: usabile ovunque.

export interface PiattoDettaglio {
  /** Posizione del piatto nel menu (1-based), compatibile con il vecchio Id numerico. */
  Id: number;
  Nome: string;
  Categoria: string;
  Descrizione: string;
}

export interface MenuCategoria {
  /** Posizione nell'elenco pubblico (1-based). */
  Id: number;
  /** Id del record PocketBase (stabile). */
  id: string;
  Nome: string;
  Prezzo: number;
  Piatti: PiattoDettaglio[];
  /** URL assoluti delle foto (PocketBase, pubblici). */
  Foto: string[];
  Stagione: string;
}
