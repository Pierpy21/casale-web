"use client";

import { useState, useTransition, type FormEvent } from "react";
import { upsertDish } from "@/app/actions/catalog";
import { submitMutation, updatedAtOf } from "@/lib/offline/submit";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { COURSE_LABELS, COURSE_ORDER, type Course, type Dish } from "@/lib/types";

export interface DishFormProps {
  /** null = nuovo piatto. */
  dish: Dish | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const DESCRIPTION_MAX = 500;

/** Creazione e modifica di un piatto del catalogo (nome, portata, descrizione). */
export function DishForm({ dish, onSaved, onCancel }: DishFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState(dish?.name ?? "");
  const [course, setCourse] = useState<Course>(dish?.course ?? "primo");
  const [description, setDescription] = useState(dish?.description ?? "");
  const idPrefix = dish ? `dish-${dish.id}` : "dish-new";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      id: dish?.id,
      name: name.trim(),
      course,
      description: description.trim(),
      // Il form non modifica stato e ordine: si conservano quelli attuali (upsert li sovrascrive).
      active: dish?.active ?? true,
      sort: dish?.sort ?? 0,
    };

    setFormError(null);
    setErrors({});
    startTransition(async () => {
      const result = await submitMutation("catalog.upsertDish", upsertDish, [input], {
        label: dish ? `Modifica piatto · ${input.name}` : `Nuovo piatto · ${input.name}`,
        entity: dish ? { type: "dish", id: dish.id } : undefined,
        expectedUpdated: updatedAtOf(dish),
        createsTempId: !dish,
      });
      if (!result.ok) {
        setFormError(result.error);
        const mapped: Record<string, string> = {};
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (messages[0]) mapped[key] = messages[0];
        }
        setErrors(mapped);
        return;
      }
      onSaved(`Piatto "${input.name}" salvato.`);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label={dish ? "Modifica piatto" : "Nuovo piatto"}>
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Field label="Nome del piatto" htmlFor={`${idPrefix}-name`} required error={errors.name}>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="off"
          invalid={!!errors.name}
        />
      </Field>

      <Field label="Portata" htmlFor={`${idPrefix}-course`} error={errors.course}>
        <Select
          id={`${idPrefix}-course`}
          name="course"
          value={course}
          onChange={(e) => setCourse(e.target.value as Course)}
          invalid={!!errors.course}
        >
          {COURSE_ORDER.map((c) => (
            <option key={c} value={c}>
              {COURSE_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Descrizione"
        htmlFor={`${idPrefix}-description`}
        error={errors.description}
        hint={`Facoltativa, massimo ${DESCRIPTION_MAX} caratteri.`}
      >
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          invalid={!!errors.description}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-3 border-t border-sand pt-5">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          Annulla
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio…" : "Salva piatto"}
        </Button>
      </div>
    </form>
  );
}
