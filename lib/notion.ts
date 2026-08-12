import { Client, NumberedListItemBlockObjectResponse } from "@notionhq/client";
export const dynamic = 'force-dynamic'
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  fetch: (url, init) => {
    return fetch(url, {
      ...init,
      cache: "no-store", // Disabilita la cache di Next.js per le chiamate a Notion
    });
  },
});
const MENU_DATABASE_ID = process.env.NOTION_DATABASE_ID as string;
const PIATTI_DATABASE_ID = process.env.NOTION_PIATTI_DATABASE_ID as string;

export interface PiattoDettaglio {
  Id: number;
  Nome: string;
  Categoria: string;
  Descrizione: string;
}

export interface MenuCategoria {
  Id: number;
  Nome: string;
  Prezzo: number;
  Piatti: PiattoDettaglio[];
  Foto: string[];
  Stagione: string; 
}

const ORDINE_PORTATE: Record<string, number> = {
  "Antipasto": 1,
  "Primo": 2,
  "Secondo": 3,
  "Contorno": 4,
  "Dolce": 5,
  "Bevande": 6
};

// 1. Mappa dei piatti singoli usando dataSources.query
async function getPiattiMap(): Promise<Record<string, PiattoDettaglio>> {
  const response = (await notion.dataSources.query({
    data_source_id: PIATTI_DATABASE_ID,
  })) as any;

  const results = response.results || [];
  const piattiMap: Record<string, PiattoDettaglio> = {};

  results.forEach((page: any) => {
    // Estrazione delle proprietà da Notion
    const IdProp = page.properties.Id;
    const nomeProp = page.properties.Nome;
    const categoriaProp = page.properties.Categoria;
    const descProp = page.properties.Descrizione;

    // Parsing e valori di fallback
    const Id = IdProp?.type === 'unique_id' ? IdProp.unique_id?.number || 0 : 0;
    const Nome = nomeProp?.type === 'title' ? nomeProp.title[0]?.plain_text || 'Senza nome' : 'Senza nome';
    const Descrizione = descProp?.type === 'rich_text' ? descProp.rich_text[0]?.plain_text || '' : '';
    const Categoria = categoriaProp?.type === 'select' ? categoriaProp.select?.name || 'Varie' : 'Varie';

    // Popolamento della mappa
    piattiMap[page.id] = { Id, Nome, Descrizione, Categoria };
  });

  return piattiMap;
}

// 2. Tutti i piatti disponibili organizzati per categoria
export async function getTuttiPiatti(): Promise<Record<string, PiattoDettaglio[]>> {
  const piattiMap = await getPiattiMap();
  const piatti = Object.values(piattiMap);

  const categorizzati: Record<string, PiattoDettaglio[]> = {
    "Antipasto": [],
    "Primo": [],
    "Secondo": [],
    "Contorno": [],
    "Dolce": [],
    "Bevande": [],
  };

  piatti.forEach((piatto) => {
    const cat = piatto.Categoria || "Varie";
    if (!categorizzati[cat]) {
      categorizzati[cat] = [];
    }
    categorizzati[cat].push(piatto);
  });

  return categorizzati;
}

// 3. Menu completo relazionato usando dataSources.query

export async function getMenuCompleto(): Promise<MenuCategoria[]> {
  if (!MENU_DATABASE_ID || !PIATTI_DATABASE_ID) {
    throw new Error("Mancano gli ID dei database nel file .env");
  }

  const piattiMap = await getPiattiMap();

  const response = (await notion.dataSources.query({
    data_source_id: MENU_DATABASE_ID,
    filter: {
      property: 'Disponibile',
      checkbox: {
        equals: true,
      },
    },
  })) as any;

  const results = response.results || [];

  const menuList = results.map((page: any) => {
    const idProp = page.properties.Id;
    const nomeProp = page.properties.Nome;
    const prezzoProp = page.properties.Prezzo;
    const relazioniPiattiProp = page.properties.Piatti;
    const fotoProp = page.properties.Foto;
    const stagioneProp = page.properties.Stagione;

    let piattiInMenu: PiattoDettaglio[] = [];
    
    if (relazioniPiattiProp?.type === 'relation') {
      piattiInMenu = relazioniPiattiProp.relation
        .map((rel: any) => piattiMap[rel.id])
        .filter(Boolean);

      piattiInMenu.sort((a, b) => {
        const prioritaA = ORDINE_PORTATE[a.Categoria] || 99;
        const prioritaB = ORDINE_PORTATE[b.Categoria] || 99;
        return prioritaA - prioritaB;
      });
    }

    let Foto: string[] = [];
    
    if (fotoProp?.type === 'files' && Array.isArray(fotoProp.files)) {
      Foto = fotoProp.files.map((fileObj: any) => {
        if (fileObj.type === 'file') {
          return fileObj.file?.url || '';
        } else if (fileObj.type === 'external') {
          return fileObj.external?.url || '';
        }
        return '';
      }).filter(Boolean); 
    }

    return {
      Id: idProp?.type === 'unique_id' ? idProp.unique_id?.number || 0 : 0,
      Nome: nomeProp?.type === 'title' ? nomeProp.title[0]?.plain_text || 'Senza nome' : 'Senza nome',
      Prezzo: prezzoProp?.type === 'number' ? prezzoProp.number : 0,
      Piatti: piattiInMenu,
      Foto: Foto,
      Stagione: stagioneProp?.type === 'select' 
    ? stagioneProp.select?.name || 'Menu Degustazione'
    : stagioneProp?.type === 'rich_text'
      ? stagioneProp.rich_text[0]?.plain_text || 'Menu Degustazione'
      : 'Menu Degustazione', 
    };
  });

  // Ordinamento dei menu 

//return menuList.sort((a: MenuCategoria, b: MenuCategoria) => a.Id - b.Id); // Per ID (dal più vecchio al più recente)
// return menuList.sort((a: MenuCategoria, b: MenuCategoria) => a.Prezzo - b.Prezzo); // Per Prezzo (dal più economico)
 return menuList.sort((a: MenuCategoria, b: MenuCategoria) => a.Nome.localeCompare(b.Nome)); // Alfabetico
}