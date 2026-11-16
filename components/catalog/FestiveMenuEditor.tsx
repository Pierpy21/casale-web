"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { upsertFestiveMenu } from "@/app/actions/festive";
import { Alert, Button, cn, Field, Input, Switch, Textarea } from "@/components/ui";
import type { FestiveMenu } from "@/lib/festive-types";
import { MENU_PHOTO_MAX_BYTES, MENU_PHOTO_MIME_TYPES } from "@/lib/validation";

/** Massimo foto per menù festivo (il server applica lo stesso limite). */
export const FESTIVE_PHOTO_MAX_COUNT = 10;

const PHOTO_ACCEPT = MENU_PHOTO_MIME_TYPES.join(",");
/** Card di una sezione: stessa resa dell'editor dei menù del catalogo. */
const CARD_CLASS = "flex min-w-0 flex-col gap-4 rounded-xl border border-sand bg-paper p-4 sm:p-5";
const COUNT_BADGE_CLASS = "rounded-full bg-cream px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-slate-dark";

interface NewPhoto {
  key: number;
  file: File;
  previewUrl: string;
}

type ErrorMap = Record<string, string>;

export interface FestiveMenuEditorProps {
  menu: FestiveMenu | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

/** Converte fieldErrors (record di messaggi per campo) in un messaggio per campo. Le chiavi annidate (es. "courses.0") vanno al campo padre. */
function toErrorMap(raw: Record<string, string[]> | undefined): ErrorMap {
  const out: ErrorMap = {};
  for (const [key, messages] of Object.entries(raw ?? {})) {
    const field = key.split(".")[0];
    if (messages[0] && !out[field]) out[field] = messages[0];
  }
  return out;
}

/** Controllo lato client di formato e dimensione (il server ripete gli stessi controlli). */
function checkPhotoFile(file: File): string | null {
  if (!(MENU_PHOTO_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
    return `"${file.name}" non è un formato ammesso (usa JPG, PNG, WebP o AVIF).`;
  }
  if (file.size > MENU_PHOTO_MAX_BYTES) {
    return `"${file.name}" supera 5 MB.`;
  }
  return null;
}

/** Editor di un menù festivo: dati, prezzo, portate, nota, attivo e foto. Salva con FormData (contratto upsertFestiveMenu). */
export function FestiveMenuEditor({ menu, onSaved, onCancel }: FestiveMenuEditorProps) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(menu?.active ?? true);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorMap>({});

  const existingPhotos = menu?.photos ?? [];
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const nextKey = useRef(0);

  // Object URL delle anteprime: revocati alla rimozione e allo smontaggio.
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const idPrefix = menu ? `festive-${menu.id}` : "festive-new";
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  const keptPhotoCount = existingPhotos.filter((photo) => !removedPhotos.includes(photo.file)).length;
  const photoSlotsLeft = Math.max(0, FESTIVE_PHOTO_MAX_COUNT - keptPhotoCount - newPhotos.length);
  const photoMessage = photoError ?? errors.photos;

  function toggleRemovePhoto(file: string) {
    setRemovedPhotos((prev) => (prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]));
  }

  function handleAddPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files: File[] = event.target.files ? Array.from(event.target.files) : [];
    // Svuota l'input così lo stesso file può essere scelto di nuovo dopo una rimozione.
    event.target.value = "";
    if (files.length === 0) return;

    const problems: string[] = [];
    const accepted: NewPhoto[] = [];
    for (const file of files) {
      const problem = checkPhotoFile(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      if (accepted.length >= photoSlotsLeft) {
        problems.push(`Massimo ${FESTIVE_PHOTO_MAX_COUNT} foto per menù: "${file.name}" non è stata aggiunta.`);
        continue;
      }
      nextKey.current += 1;
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      accepted.push({ key: nextKey.current, file, previewUrl });
    }

    setPhotoError(problems.length > 0 ? problems.join(" ") : null);
    if (accepted.length > 0) setNewPhotos((prev) => [...prev, ...accepted]);
  }

  function removeNewPhoto(key: number) {
    const target = newPhotos.find((photo) => photo.key === key);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
      previewUrls.current.delete(target.previewUrl);
    }
    setNewPhotos((prev) => prev.filter((photo) => photo.key !== key));
    setPhotoError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const date = String(form.get("date") ?? "").trim();
    const priceRaw = String(form.get("price") ?? "").trim().replace(",", ".");
    const price = priceRaw === "" ? null : Number(priceRaw);
    const courses = String(form.get("courses") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const notes = String(form.get("notes") ?? "").trim();

    // Controlli minimi lato client; il resto (formati, limiti) lo valida il server.
    const clientErrors: ErrorMap = {};
    if (!title) clientErrors.title = "Inserisci il nome della festa.";
    if (!date) clientErrors.date = "Scegli la data della festa.";
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      clientErrors.price = "Inserisci un prezzo valido, zero o più.";
    }
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(null);
      return;
    }

    const payload = {
      ...(menu ? { id: menu.id } : {}),
      title,
      date,
      price,
      courses,
      notes,
      active,
    };

    // Sempre FormData: payload JSON + foto nuove + nomi delle foto da rimuovere.
    const body = new FormData();
    body.set("payload", JSON.stringify(payload));
    for (const photo of newPhotos) body.append("photos", photo.file, photo.file.name);
    for (const file of removedPhotos) body.append("remove_photos", file);

    setFormError(null);
    setErrors({});
    setPhotoError(null);

    startTransition(async () => {
      const result = await upsertFestiveMenu(body);
      if (!result.ok) {
        setFormError(result.error);
        setErrors(toErrorMap(result.fieldErrors));
        return;
      }
      onSaved(`Menù "${title}" salvato.`);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={menu ? "Modifica menù festivo" : "Nuovo menù festivo"} className="flex flex-col gap-5">
      {formError && <Alert tone="danger">{formError}</Alert>}

      {/* Disabilita tutti i controlli nativi mentre la richiesta è in corso. */}
      <fieldset disabled={pending} className="contents">
        <section aria-labelledby={fieldId("section-data")} className={CARD_CLASS}>
          <h3 id={fieldId("section-data")} className="font-serif text-xl leading-tight text-ink">
            Dati della festa
          </h3>

          <Field label="Nome della festa" htmlFor={fieldId("title")} required error={errors.title}>
            <Input
              id={fieldId("title")}
              name="title"
              defaultValue={menu?.title ?? ""}
              placeholder="Es. Natale"
              required
              invalid={!!errors.title}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Data"
              htmlFor={fieldId("date")}
              required
              error={errors.date}
              hint="Dopo questa data il menù non compare più sul sito."
            >
              <Input
                id={fieldId("date")}
                name="date"
                type="date"
                defaultValue={menu?.date ?? ""}
                required
                invalid={!!errors.date}
              />
            </Field>

            <Field
              label="Prezzo a persona (€)"
              htmlFor={fieldId("price")}
              error={errors.price}
              hint="Lascia vuoto per non mostrare il prezzo."
            >
              <Input
                id={fieldId("price")}
                name="price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                defaultValue={menu?.price != null ? String(menu.price) : ""}
                placeholder="Es. 70"
                invalid={!!errors.price}
              />
            </Field>
          </div>

          <Field label="Portate" htmlFor={fieldId("courses")} error={errors.courses} hint="Una per riga. Le righe vuote vengono ignorate.">
            <Textarea
              id={fieldId("courses")}
              name="courses"
              rows={6}
              defaultValue={menu?.courses.join("\n") ?? ""}
              placeholder={"Prosecco di benvenuto\nEntrée\nAntipasto…"}
              invalid={!!errors.courses}
            />
          </Field>

          <Field label="Nota" htmlFor={fieldId("notes")} error={errors.notes} hint="Facoltativa, es. bevande incluse.">
            <Textarea
              id={fieldId("notes")}
              name="notes"
              rows={2}
              defaultValue={menu?.notes ?? ""}
              invalid={!!errors.notes}
            />
          </Field>

          <div className="flex min-h-14 min-w-0 items-center justify-between gap-3 rounded-lg border border-field-edge bg-field px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-ink">Attivo</p>
              <p className="text-[13px] leading-snug text-slate-dark">Un menù disattivato non compare sul sito.</p>
            </div>
            <Switch
              checked={active}
              onCheckedChange={setActive}
              label="Menù festivo attivo"
              onLabel="Attivo"
              offLabel="Disattivato"
            />
          </div>
        </section>

        <section aria-labelledby={fieldId("section-photos")} className={CARD_CLASS}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 id={fieldId("section-photos")} className="font-serif text-xl leading-tight text-ink">
              Foto
            </h3>
            <span className={COUNT_BADGE_CLASS}>
              {keptPhotoCount + newPhotos.length}/{FESTIVE_PHOTO_MAX_COUNT}
            </span>
          </div>
          <p className="-mt-2 text-[13px] leading-snug text-slate-dark">
            Fino a {FESTIVE_PHOTO_MAX_COUNT} foto per menù, 5 MB ciascuna (JPG, PNG, WebP o AVIF). Le foto compaiono nella
            lavagna della sezione sul sito.
          </p>

          {existingPhotos.length > 0 && (
            <ul aria-label="Foto attuali" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {existingPhotos.map((photo, index) => {
                const removing = removedPhotos.includes(photo.file);
                return (
                  <li key={photo.file} className="flex min-w-0 flex-col gap-2">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-sand bg-cream">
                      <img
                        src={photo.url}
                        alt={`Foto ${index + 1} della festa`}
                        className={cn("size-full object-cover transition-opacity", removing && "opacity-40")}
                      />
                      {removing && (
                        <span className="absolute inset-x-0 bottom-0 bg-ink/75 px-2 py-1 text-center text-[11px] uppercase tracking-[0.14em] text-paper">
                          Da rimuovere
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRemovePhoto(photo.file)}
                      aria-label={`${removing ? "Annulla rimozione" : "Rimuovi"} foto ${index + 1}`}
                      className="min-h-11 w-full"
                    >
                      {removing ? "Annulla" : "Rimuovi"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {newPhotos.length > 0 && (
            <ul aria-label="Nuove foto da caricare" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {newPhotos.map((photo, index) => (
                <li key={photo.key} className="flex min-w-0 flex-col gap-2">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-petrol/40 bg-cream">
                    <img src={photo.previewUrl} alt={`Nuova foto ${index + 1}`} className="size-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-petrol/85 px-2 py-1 text-center text-[11px] uppercase tracking-[0.14em] text-paper">
                      Nuova
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeNewPhoto(photo.key)}
                    aria-label={`Rimuovi nuova foto ${index + 1}`}
                    className="min-h-11 w-full"
                  >
                    Rimuovi
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Field
            label="Aggiungi foto"
            htmlFor={fieldId("photos")}
            error={photoMessage}
            hint={photoSlotsLeft > 0 ? `Puoi aggiungere ancora ${photoSlotsLeft} foto.` : "Limite di foto raggiunto."}
          >
            <input
              id={fieldId("photos")}
              type="file"
              multiple
              accept={PHOTO_ACCEPT}
              onChange={handleAddPhotos}
              disabled={photoSlotsLeft === 0}
              aria-invalid={photoMessage ? true : undefined}
              className="block min-h-11 w-full min-w-0 text-[14px] text-ink file:mr-4 file:min-h-11 file:cursor-pointer file:rounded-btn file:border file:border-petrol file:bg-transparent file:px-4 file:py-2 file:text-[11px] file:font-medium file:uppercase file:tracking-[0.14em] file:text-petrol hover:file:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>
        </section>

        <div className="flex flex-wrap justify-end gap-3 border-t border-sand pt-5">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
            Annulla
          </Button>
          <Button type="submit" variant="primary" size="md" aria-busy={pending || undefined}>
            {pending ? "Salvataggio…" : "Salva menù"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
