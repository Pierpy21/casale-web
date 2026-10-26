"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { Alert, Field, Input, SubmitButton, fieldIds } from "@/components/ui";
import type { ActionResult } from "@/lib/types";

export function LoginForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(signIn, null);
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.fieldErrors;
  const emailIds = fieldIds("email");
  const passwordIds = fieldIds("password");

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {failure && <Alert tone="danger">{failure.error}</Alert>}

      <Field label="Email" htmlFor="email" required error={fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          invalid={Boolean(fieldErrors?.email)}
          aria-describedby={fieldErrors?.email ? emailIds.errorId : undefined}
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={fieldErrors?.password?.[0]}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(fieldErrors?.password)}
          aria-describedby={fieldErrors?.password ? passwordIds.errorId : undefined}
        />
      </Field>

      <SubmitButton size="lg" className="mt-2 w-full" pendingLabel="Accesso in corso…">
        Accedi
      </SubmitButton>
    </form>
  );
}
