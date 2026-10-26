import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { ClientForm } from "@/components/clients/ClientForm";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Nuovo cliente · Casale del Notaio",
};

export default async function NewClientPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Anagrafica"
        title="Nuovo cliente"
        description="Nome, cognome e telefono sono obbligatori. Il resto è facoltativo."
        actions={
          <ButtonLink href="/admin/clienti" variant="ghost" size="sm">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Torna ai clienti
          </ButtonLink>
        }
      />
      <Card className="max-w-3xl p-6 sm:p-8">
        <ClientForm mode="create" />
      </Card>
    </div>
  );
}
