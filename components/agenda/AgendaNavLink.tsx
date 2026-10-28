import Link from "next/link";
import type { ReactNode } from "react";
import { agendaHref, type AgendaKindFilter, type AgendaView } from "./agenda-utils";

export interface AgendaNavLinkProps {
  /** Data di destinazione (ISO). */
  iso: string;
  view: AgendaView;
  /** Filtro per tipo da mantenere nell'href (il click usa lo stato corrente). */
  kind?: AgendaKindFilter;
  label: string;
  className?: string;
  children: ReactNode;
  onNavigate: (iso: string, view: AgendaView) => void;
}

/**
 * Link di navigazione dell'agenda. Il prefetch scalda il periodo adiacente; il click resta
 * nel client (cambio periodo istantaneo se i dati sono già caricati, altrimenti transizione).
 */
export function AgendaNavLink({ iso, view, kind, label, className, children, onNavigate }: AgendaNavLinkProps) {
  return (
    <Link
      href={agendaHref({ date: iso, view, kind })}
      prefetch
      scroll={false}
      aria-label={label}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(iso, view);
      }}
    >
      {children}
    </Link>
  );
}
