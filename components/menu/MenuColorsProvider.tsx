"use client";

import { createContext, useContext, type ReactNode } from "react";
import { FALLBACK_MENU_COLOR, type MenuColor } from "@/lib/menu-colors";

/** Colori dei menù per id (adulti e bambini). Vuoto = fallback neutro. */
type MenuColorsMap = Record<string, MenuColor>;

const MenuColorsContext = createContext<MenuColorsMap>({});

export interface MenuColorsProviderProps {
  /** Valori da `getMenuColors()` caricati nel layout admin: solo colori, mai prezzi. */
  colors: MenuColorsMap;
  children: ReactNode;
}

/** Rende disponibili i colori dei menù a tutta l'area admin (agenda, dashboard, schede, statistiche). */
export function MenuColorsProvider({ colors, children }: MenuColorsProviderProps) {
  return <MenuColorsContext.Provider value={colors}>{children}</MenuColorsContext.Provider>;
}

/** Colore del menù; senza id o per un menù sconosciuto, il colore di fallback. */
export function useMenuColor(menuId: string | null | undefined): MenuColor {
  const colors = useContext(MenuColorsContext);
  return (menuId ? colors[menuId] : undefined) ?? FALLBACK_MENU_COLOR;
}
