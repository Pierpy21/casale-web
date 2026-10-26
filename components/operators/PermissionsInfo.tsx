import { Info } from "lucide-react";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/types";

const RULES: Array<{ role: Role; text: string }> = [
  {
    role: "admin",
    text: "Gestisce tutto: agenda, prenotazioni, clienti, operatori, menù e sale. È l'unico account amministratore.",
  },
  {
    role: "sala",
    text: "Consulta tutte le prenotazioni e può modificare solo il numero di coperti. Può creare prenotazioni normali (non eventi né appuntamenti).",
  },
  {
    role: "cucina",
    text: "Consulta tutte le prenotazioni senza modificarle. Usa la giacenza: segnala i prodotti presenti o da ordinare.",
  },
];

/** Riepilogo sintetico dei permessi per ruolo (SPEC §3). */
export function PermissionsInfo() {
  return (
    <section
      aria-labelledby="permessi-operatori"
      className="border border-sand bg-cream/50 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 text-bronze">
        <Info aria-hidden="true" className="size-4" />
        <h2 id="permessi-operatori" className="text-[11px] font-medium uppercase tracking-[0.14em]">
          Permessi per ruolo
        </h2>
      </div>
      <dl className="mt-4 grid gap-4 md:grid-cols-3">
        {RULES.map((rule) => (
          <div key={rule.role} className="flex flex-col gap-2">
            <dt>
              <Badge tone={rule.role === "admin" ? "bronze" : "petrol"}>{ROLE_LABELS[rule.role]}</Badge>
            </dt>
            <dd className="text-[14px] leading-relaxed text-ink">{rule.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[13px] text-slate-dark">
        Gli operatori disattivati non possono accedere. La password temporanea va comunicata all&rsquo;operatore
        in modo riservato.
      </p>
    </section>
  );
}
