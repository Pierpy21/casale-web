"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { deleteOperator, resetOperatorPassword, setOperatorActive, updateOperator } from "@/app/actions/operators";
import { useOptimisticActive } from "@/components/catalog/useOptimisticActive";
import { ConfirmAction } from "@/components/bookings/ConfirmAction";
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  cn,
  fieldIds,
} from "@/components/ui";
import { ROLE_LABELS, type Profile, type Role } from "@/lib/types";

type EditableRole = Exclude<Role, "admin">;

export interface OperatorListProps {
  operators: Profile[];
}

export function OperatorList({ operators }: OperatorListProps) {
  if (operators.length === 0) {
    return (
      <p className="border border-dashed border-slate/40 bg-paper px-6 py-10 text-center text-[15px] text-slate">
        Nessun operatore. Crea il primo account di sala o cucina dal modulo a fianco.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-sand border border-sand bg-paper">
      {operators.map((operator) => (
        <OperatorRow key={operator.id} operator={operator} />
      ))}
    </ul>
  );
}

function OperatorRow({ operator }: { operator: Profile }) {
  const router = useRouter();
  const isAdminAccount = operator.role === "admin";
  const [editing, setEditing] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, startToggle] = useTransition();
  const { active, setActive, resetActive } = useOptimisticActive(operator.active);

  function toggleActive(next: boolean) {
    setActive(next);
    setError(null);
    setNotice(null);
    startToggle(async () => {
      const result = await setOperatorActive(operator.id, next);
      if (!result.ok) {
        resetActive();
        setError(`Impossibile ${next ? "attivare" : "disattivare"} ${operator.full_name}: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-4 p-4 sm:p-5">
      {editing && !isAdminAccount ? (
        <EditOperatorForm
          operator={operator}
          onDone={(message) => {
            setEditing(false);
            setNotice(message);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {/* Riga 1: chi è (a sinistra) e stato dell'account (a destra). */}
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className={cn("flex min-w-0 flex-col gap-1 transition-[opacity,filter] duration-300", !active && "opacity-60 grayscale")}>
              <p className="truncate font-serif text-xl leading-tight text-ink">{operator.full_name}</p>
              <p className="truncate text-[14px] text-slate-dark">{operator.email}</p>
            </div>
            {!isAdminAccount && (
              <Switch
                checked={active}
                onCheckedChange={toggleActive}
                disabled={toggling}
                label={`Account di ${operator.full_name} attivo`}
                onLabel="Attivo"
                offLabel="Disattivato"
              />
            )}
          </div>

          {/* Riga 2: ruolo e azioni, che vanno a capo se lo spazio non basta. */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Badge tone={isAdminAccount ? "bronze" : "petrol"}>{ROLE_LABELS[operator.role]}</Badge>
            {isAdminAccount ? (
              <span className="text-[13px] text-slate-dark">Account amministratore · non modificabile</span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Modifica
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPasswordOpen(true)}>
                  Reimposta password
                </Button>
                <ConfirmAction
                  label="Elimina"
                  variant="danger"
                  size="sm"
                  title={`Eliminare ${operator.full_name}?`}
                  description="L’account verrà eliminato definitivamente e non potrà più accedere. Prenotazioni, storico e giacenze restano, con il suo nome. Per bloccare l’accesso senza eliminare, usa lo switch Attivo."
                  confirmLabel="Elimina definitivamente"
                  pendingLabel="Eliminazione…"
                  run={() => deleteOperator(operator.id)}
                  onSuccess={() => router.refresh()}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      {!isAdminAccount && (
        <ResetPasswordDialog
          open={passwordOpen}
          operatorId={operator.id}
          operatorName={operator.full_name}
          onClose={() => setPasswordOpen(false)}
          onDone={(message) => {
            setPasswordOpen(false);
            setNotice(message);
          }}
        />
      )}
    </li>
  );
}

function EditOperatorForm({
  operator,
  onDone,
  onCancel,
}: {
  operator: Profile;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<EditableRole>(operator.role === "cucina" ? "cucina" : "sala");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const nameId = `edit-name-${operator.id}`;
  const roleId = `edit-role-${operator.id}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      full_name: String(form.get("full_name") ?? ""),
      role,
      active: operator.active, // lo stato si cambia con lo switch nella lista
    };

    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateOperator(operator.id, input);
      if (!result.ok) {
        setError(result.error);
        const first: Record<string, string> = {};
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (messages[0]) first[key] = messages[0];
        }
        setFieldErrors(first);
        return;
      }
      router.refresh();
      onDone(`Dati di ${input.full_name.trim()} aggiornati.`);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={`Modifica ${operator.full_name}`} className="flex flex-col gap-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Nome completo" htmlFor={nameId} error={fieldErrors.full_name}>
          <Input
            id={nameId}
            name="full_name"
            defaultValue={operator.full_name}
            invalid={!!fieldErrors.full_name}
            aria-describedby={fieldErrors.full_name ? fieldIds(nameId).errorId : undefined}
          />
        </Field>

        <Field label="Ruolo" htmlFor={roleId} error={fieldErrors.role}>
          <Select id={roleId} value={role} onChange={(e) => setRole(e.target.value as EditableRole)}>
            <option value="sala">Sala</option>
            <option value="cucina">Cucina</option>
          </Select>
        </Field>

      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Annulla
        </Button>
      </div>
    </form>
  );
}

function ResetPasswordDialog({
  open,
  operatorId,
  operatorName,
  onClose,
  onDone,
}: {
  open: boolean;
  operatorId: string;
  operatorName: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const passwordId = `reset-password-${operatorId}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await resetOperatorPassword(operatorId, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(`Password di ${operatorName} reimpostata.`);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Reimposta password">
      {/* Il contenuto è montato solo quando la finestra è aperta, così il campo parte sempre vuoto. */}
      {open && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <p className="text-[15px] text-slate-dark">
            Imposta una nuova password temporanea per <strong className="font-medium text-ink">{operatorName}</strong>.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Nuova password" htmlFor={passwordId} hint="Almeno 8 caratteri." required>
            <Input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" size="md" onClick={onClose} disabled={pending}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Salvataggio…" : "Imposta password"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
