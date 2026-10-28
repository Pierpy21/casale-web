"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createClient as createClientAction, updateClient } from "@/app/actions/clients";
import { Alert, Button, ButtonLink, Field, Input, Textarea, fieldIds } from "@/components/ui";
import { isBrowserOnline } from "@/lib/offline/network";
import { isQueued, submitMutation, updatedAtOf } from "@/lib/offline/submit";
import type { Client } from "@/lib/types";

export interface ClientFormProps {
  mode: "create" | "edit";
  client?: Client;
}

type FieldName =
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "tax_code"
  | "vat_number"
  | "notes";

type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_NAMES: FieldName[] = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "tax_code",
  "vat_number",
  "notes",
];

function text(form: FormData, name: FieldName): string {
  return String(form.get(name) ?? "");
}

/** Mappa i fieldErrors del server (primo messaggio per campo). */
function toFieldErrors(
  raw: Record<string, string[]> | undefined,
): FieldErrors {
  const out: FieldErrors = {};
  if (!raw) return out;
  for (const name of FIELD_NAMES) {
    const message = raw[name]?.[0];
    if (message) out[name] = message;
  }
  return out;
}

/** Form di creazione/modifica cliente. I dati vengono validati dal server (Zod) e i messaggi mostrati per campo. */
export function ClientForm({ mode, client }: ClientFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      first_name: text(form, "first_name"),
      last_name: text(form, "last_name"),
      phone: text(form, "phone"),
      email: text(form, "email"),
      tax_code: text(form, "tax_code"),
      vat_number: text(form, "vat_number"),
      notes: text(form, "notes"),
    };

    setFormError(null);
    setFieldErrors({});
    setSaved(false);

    startTransition(async () => {
      if (mode === "create") {
        const result = await submitMutation("clients.createClient", createClientAction, [input], {
          label: `Nuovo cliente · ${input.first_name} ${input.last_name}`.trim(),
          createsTempId: true,
        });
        if (!result.ok) {
          setFormError(result.error);
          setFieldErrors(toFieldErrors(result.fieldErrors));
          return;
        }
        // Offline il cliente non ha ancora un id reale: si torna all'elenco (in cache).
        if (isQueued(result)) {
          router.push("/admin/clienti");
          return;
        }
        router.push(`/admin/clienti/${result.data.id}`);
        return;
      }

      if (!client) return;
      const result = await submitMutation("clients.updateClient", updateClient, [client.id, input], {
        label: `Modifica cliente · ${client.first_name} ${client.last_name}`,
        entity: { type: "client", id: client.id },
        expectedUpdated: updatedAtOf(client),
      });
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(toFieldErrors(result.fieldErrors));
        return;
      }
      setSaved(true);
      if (isBrowserOnline()) router.refresh();
    });
  }

  const describedBy = (name: FieldName) =>
    fieldErrors[name] ? fieldIds(name).errorId : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6" aria-label={mode === "create" ? "Nuovo cliente" : "Modifica cliente"}>
      {formError && <Alert tone="danger">{formError}</Alert>}
      {saved && <Alert tone="success">Modifiche salvate.</Alert>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome" htmlFor="first_name" required error={fieldErrors.first_name}>
          <Input
            id="first_name"
            name="first_name"
            defaultValue={client?.first_name ?? ""}
            autoComplete="given-name"
            required
            invalid={!!fieldErrors.first_name}
            aria-describedby={describedBy("first_name")}
          />
        </Field>

        <Field label="Cognome" htmlFor="last_name" required error={fieldErrors.last_name}>
          <Input
            id="last_name"
            name="last_name"
            defaultValue={client?.last_name ?? ""}
            autoComplete="family-name"
            required
            invalid={!!fieldErrors.last_name}
            aria-describedby={describedBy("last_name")}
          />
        </Field>

        <Field
          label="Telefono"
          htmlFor="phone"
          required
          error={fieldErrors.phone}
          hint="Numero per contatti e conferme."
          className="sm:col-span-2"
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={client?.phone ?? ""}
            autoComplete="tel"
            placeholder="+39 340 000 0000"
            required
            invalid={!!fieldErrors.phone}
            aria-describedby={describedBy("phone")}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={fieldErrors.email} className="sm:col-span-2">
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={client?.email ?? ""}
            autoComplete="email"
            invalid={!!fieldErrors.email}
            aria-describedby={describedBy("email")}
          />
        </Field>

        <Field label="Codice fiscale" htmlFor="tax_code" error={fieldErrors.tax_code} hint="16 caratteri.">
          <Input
            id="tax_code"
            name="tax_code"
            defaultValue={client?.tax_code ?? ""}
            maxLength={16}
            autoCapitalize="characters"
            spellCheck={false}
            className="uppercase"
            invalid={!!fieldErrors.tax_code}
            aria-describedby={describedBy("tax_code")}
          />
        </Field>

        <Field label="Partita IVA" htmlFor="vat_number" error={fieldErrors.vat_number} hint="11 cifre, prefisso IT facoltativo.">
          <Input
            id="vat_number"
            name="vat_number"
            inputMode="numeric"
            defaultValue={client?.vat_number ?? ""}
            maxLength={13}
            invalid={!!fieldErrors.vat_number}
            aria-describedby={describedBy("vat_number")}
          />
        </Field>

        <Field label="Note" htmlFor="notes" error={fieldErrors.notes} className="sm:col-span-2">
          <Textarea
            id="notes"
            name="notes"
            defaultValue={client?.notes ?? ""}
            invalid={!!fieldErrors.notes}
            aria-describedby={describedBy("notes")}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-sand pt-5">
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio…" : mode === "create" ? "Crea cliente" : "Salva modifiche"}
        </Button>
        {mode === "create" && (
          <ButtonLink href="/admin/clienti" variant="ghost" size="md">
            Annulla
          </ButtonLink>
        )}
      </div>
    </form>
  );
}
