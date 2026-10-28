import { canUseInventory, canViewActivityLog, isAdmin } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

export type NavIcon = "event" | "agenda" | "dashboard" | "clients" | "operators" | "catalog" | "inventory" | "activity" | "stats";

export interface NavLink {
  href: string;
  label: string;
  icon: NavIcon;
  /** Pulsante in evidenza in cima alla navigazione (solo desktop: su telefono c'è il pulsante +). */
  prominent?: boolean;
  /** false: la voce non compare nella barra inferiore mobile. */
  mobileBar?: boolean;
}

interface NavDefinition extends NavLink {
  visible: (p: Profile) => boolean;
}

/** Crea evento: link alla stessa pagina di creazione prenotazioni, con il tipo evento preselezionato. */
export const CREATE_EVENT_HREF = "/admin/prenotazioni/nuova?tipo=evento";

const LINKS: NavDefinition[] = [
  { href: CREATE_EVENT_HREF, label: "Crea evento", icon: "event", prominent: true, mobileBar: false, visible: isAdmin },
  { href: "/admin/agenda", label: "Agenda", icon: "agenda", visible: (p) => p.active },
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard", visible: isAdmin },
  { href: "/admin/statistiche", label: "Statistiche", icon: "stats", mobileBar: false, visible: isAdmin },
  { href: "/admin/clienti", label: "Clienti", icon: "clients", visible: isAdmin },
  { href: "/admin/operatori", label: "Operatori", icon: "operators", visible: isAdmin },
  { href: "/admin/catalogo", label: "Menù & Sale", icon: "catalog", visible: isAdmin },
  { href: "/admin/giacenza", label: "Giacenza", icon: "inventory", visible: canUseInventory },
  { href: "/admin/registro", label: "Registro", icon: "activity", visible: canViewActivityLog },
];

/** Voci di navigazione filtrate per ruolo. */
export function getNavLinks(profile: Profile): NavLink[] {
  return LINKS.filter((link) => link.visible(profile)).map(({ href, label, icon, prominent, mobileBar }) => ({
    href,
    label,
    icon,
    prominent,
    mobileBar,
  }));
}
