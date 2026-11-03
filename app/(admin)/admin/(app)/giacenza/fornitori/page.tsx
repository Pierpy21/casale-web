import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InventorySupplierList } from "@/components/inventory/InventorySupplierList";
import { ButtonLink, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { getInventorySuppliers } from "@/lib/data/inventory";
import { canManageInventory } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Fornitori giacenza · Casale del Notaio",
};

export default async function InventorySuppliersPage() {
  const profile = await requireProfile();
  if (!canManageInventory(profile)) redirect("/admin/giacenza");

  const suppliers = await getInventorySuppliers({ includeInactive: true });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        compact
        eyebrow="Giacenza"
        title="Fornitori"
        description="L'ordine qui è quello delle giacenze e dei PDF. Un fornitore disattivato non compare più tra le scelte per i nuovi prodotti; i prodotti e lo storico restano invariati."
        actions={
          <>
            <ButtonLink href="/admin/giacenza/prodotti" variant="outline" size="sm">
              Prodotti
            </ButtonLink>
            <ButtonLink href="/admin/giacenza" variant="ghost" size="sm">
              ← Giacenza
            </ButtonLink>
          </>
        }
      />
      <InventorySupplierList suppliers={suppliers} />
    </div>
  );
}
