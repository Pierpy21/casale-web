"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { createOperator } from "@/app/actions/operators";
import { Alert, Button, Field, Input, Select, fieldIds } from "@/components/ui";
import type { ActionResult, Role } from "@/lib/types";

type CreatableRole = Exclude<Role, "admin">;
type FieldName = "full_name" | "email" | "password" | "role";
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_NAMES: FieldName[] = ["full_name", "email", "password", "role"];

function toFieldErrors(raw: Record<string, string[]> | undefined): FieldErrors {
  const out: FieldErrors = {};
  if (!raw) return out;
  for (const name of FIELD_NAMES) {
    const message = raw[name]?.[0];
    if (message) out[name] = message;
  }
  return out;
}

/** Crea un operatore di sala o cucina con password temporanea. */
export function CreateOperatorForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<CreatableRole>("sala");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("full_name") ?? "");
    const input = {
      full_name: fullName,
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      role,
    };

    setFormError(null);
    setFieldErrors({});
    setCreated(null);

    startTransition(async () => {
      const result: ActionResult<{ id: string }> = await createOperator(input);
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(toFieldErrors(result.fieldErrors));
        return;
      }
      formRef.current?.reset();
      setRole("sala");
      setCreated(fullName.trim());
      router.refresh();
    });
  }

  const describedBy = (name: FieldName) =>
    fieldErrors[name] ? fieldIds(`new_${name}`).errorId : undefined;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Nuovo operatore"
      className="flex flex-col gap-5"
    >
      {formError && <Alert tone="danger">{formError}</Alert>}
      {created && (
        <Alert tone="success">
          Operatore {created} creato. Comunica email e password temporanea in modo riservato.
        </Alert>
      )}

      <Field label="Nome completo" htmlFor="new_full_name" required error={fieldErrors.full_name}>
        <Input
          id="new_full_name"
          name="full_name"
          autoComplete="off"
          required
          invalid={!!fieldErrors.full_name}
          aria-describedby={describedBy("full_name")}
        />
      </Field>

      <Field label="Email" htmlFor="new_email" required error={fieldErrors.email}>
        <Input
          id="new_email"
          name="email"
          type="email"
          autoComplete="off"
          required
          invalid={!!fieldErrors.email}
          aria-describedby={describedBy("email")}
        />
      </Field>

      <Field
        label="Password temporanea"
        htmlFor="new_password"
        required
        error={fieldErrors.password}
        hint="Almeno 8 caratteri. L'operatore potrà cambiarla in seguito."
      >
        <Input
          id="new_password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          invalid={!!fieldErrors.password}
          aria-describedby={describedBy("password")}
        />
      </Field>

      <Field label="Ruolo" htmlFor="new_role" required error={fieldErrors.role}>
        <Select
          id="new_role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as CreatableRole)}
          invalid={!!fieldErrors.role}
        >
          <option value="sala">Sala</option>
          <option value="cucina">Cucina</option>
        </Select>
      </Field>

      <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Creazione in corso…" : "Crea operatore"}
      </Button>
    </form>
  );
}
