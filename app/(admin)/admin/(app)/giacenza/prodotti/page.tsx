import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InventoryProductList } from "@/components/inventory/InventoryProductList";
import { ButtonLink, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { getInventoryProducts } from "@/lib/data/inventory";
import { canManageInventory } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Prodotti giacenza · Casale del Notaio",
};

export default async function InventoryProductsPage() {
  const profile = await requireProfile();
  if (!canManageInventory(profile)) redirect("/admin/giacenza");

  const products = await getInventoryProducts({ includeInactive: true });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        compact
        eyebrow="Giacenza"
        title="Prodotti"
        description="Catalogo dei prodotti scelti nelle giacenze. Un prodotto disattivato non compare più tra le scelte; lo storico resta invariato."
        actions={
          <ButtonLink href="/admin/giacenza" variant="ghost" size="sm">
            ← Giacenza
          </ButtonLink>
        }
      />
      <InventoryProductList products={products} />
    </div>
  );
}
