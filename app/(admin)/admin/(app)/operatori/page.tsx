import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getOperators } from "@/lib/data/operators";
import { PageHeader, Card } from "@/components/ui";
import { CreateOperatorForm } from "@/components/operators/CreateOperatorForm";
import { OperatorList } from "@/components/operators/OperatorList";
import { PermissionsInfo } from "@/components/operators/PermissionsInfo";

export const metadata: Metadata = {
  title: "Operatori · Casale del Notaio",
};

export default async function OperatorsPage() {
  await requireAdmin();
  const operators = await getOperators();

  // L'amministratore è mostrato per primo, ma non è modificabile.
  const sorted = [...operators].sort(
    (a, b) => Number(b.role === "admin") - Number(a.role === "admin"),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Team"
        title="Operatori"
        description="Crea e gestisci gli account di sala e cucina. Ogni operatore accede con la propria email e password."
      />

      <PermissionsInfo />

      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="elenco-operatori" className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4 border-b border-sand pb-3">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Account</p>
              <h2 id="elenco-operatori" className="text-2xl">
                Elenco ({sorted.length})
              </h2>
            </div>
          </div>
          <OperatorList operators={sorted} />
        </section>

        <Card className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1 border-b border-sand pb-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Nuovo account</p>
            <h2 className="text-2xl">Nuovo operatore</h2>
          </div>
          <CreateOperatorForm />
        </Card>
      </div>
    </div>
  );
}
