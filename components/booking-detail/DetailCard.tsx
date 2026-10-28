import type { ReactNode } from "react";
import { Card, cn } from "@/components/ui";

/** Card di una sezione della scheda prenotazione: eyebrow, titolo e contenuto. */
export function DetailCard({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-5 p-5 sm:p-6", className)}>
      <header className="flex flex-col gap-2 border-b border-sand pb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">{eyebrow}</p>
        <h2 className="text-2xl wrap-anywhere">{title}</h2>
      </header>
      {children}
    </Card>
  );
}

/** Riga etichetta + valore: etichette su una colonna fissa, allineate. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 wrap-anywhere text-[15px] text-ink">{children}</dd>
    </div>
  );
}

/** Coppia etichetta/valore compatta per il riepilogo nella testata di un blocco espandibile. */
export function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-dark">{label}</span>
      <span className="min-w-0 break-words text-[15px] font-medium text-ink">{children}</span>
    </span>
  );
}
