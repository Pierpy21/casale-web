"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { upsertMenu } from "@/app/actions/catalog";
import { Alert, Button, cn, Field, Input, Switch, Textarea } from "@/components/ui";
import { COURSE_ORDER, type Course, type Dish, type Menu } from "@/lib/types";
import { MENU_PHOTO_MAX_BYTES, MENU_PHOTO_MAX_COUNT, MENU_PHOTO_MIME_TYPES } from "@/lib/validation";
import { CourseSections, ReorderButtons, inCourseOrder, moveWithinCourse, useFocusNewRow } from "./CourseSections";
import { DishPicker } from "./DishPicker";
import { normalizeSearch } from "./search";

interface DraftItem {
  key: number;
  course: Course;
  /** Testo digitato, oppure nome del piatto collegato (vedi rowName). */
  name: string;
  description: string;
  /** Campo descrizione aperto (chiuso di default per tenere l'editor compatto). */
  showDescription: boolean;
  /** Piatto del catalogo collegato. null = testo libero (il server lo collega o lo crea). */
  dish_id: string | null;
}

interface NewPhoto {
  key: number;
  file: File;
  previewUrl: string;
}

export interface MenuEditorProps {
  menu: Menu | null;
  /** Catalogo piatti (anche inattivi: si mostrano solo quelli attivi nella scelta). */
  dishes: Dish[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}

type ErrorMap = Record<string, string>;

const PHOTO_ACCEPT = MENU_PHOTO_MIME_TYPES.join(",");
const DESCRIPTION_MAX = 500;
const LABEL_CLASS = "break-words text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark";

/** Converte fieldErrors Zod (chiavi tipo "items.2.name") in messaggi per campo. */
function toErrorMap(raw: Record<string, string[]> | undefined): ErrorMap {
  const out: ErrorMap = {};
  for (const [key, messages] of Object.entries(raw ?? {})) {
    if (messages[0]) out[key] = messages[0];
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

/** Nome della riga: per una riga collegata è il nome del catalogo. */
function rowName(item: DraftItem, dishById: ReadonlyMap<string, Dish>): string {
  if (item.dish_id) return dishById.get(item.dish_id)?.name ?? item.name;
  return item.name;
}

/** Riga appena aggiunta e non compilata: non viene salvata. */
function isBlank(item: DraftItem): boolean {
  return item.dish_id === null && item.name.trim() === "";
}

/** Editor di un menù: dati generali, piatti raggruppati per portata e foto. */
export function MenuEditor({ menu, dishes, onSaved, onCancel }: MenuEditorProps) {
  const [pending, startTransition] = useTransition();
  const nextKey = useRef(0);
  const newKey = () => {
    nextKey.current += 1;
    return nextKey.current;
  };
  // Riga appena aggiunta: il suo campo piatto riceve il focus dopo il render.
  const requestFocus = useFocusNewRow();

  // Object URL delle anteprime: revocati alla rimozione e allo smontaggio.
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const dishById = useMemo(() => new Map<string, Dish>(dishes.map((dish): [string, Dish] => [dish.id, dish])), [dishes]);
  const pickableByCourse = useMemo(
    () =>
      new Map<Course, Dish[]>(
        COURSE_ORDER.map((course): [Course, Dish[]] => [course, dishes.filter((dish) => dish.active && dish.course === course)]),
      ),
    [dishes],
  );

  const [items, setItems] = useState<DraftItem[]>(() =>
    (menu?.items ?? []).map((item) => ({
      key: newKey(),
      course: item.course,
      name: item.name,
      description: item.description ?? "",
      showDescription: Boolean(item.description),
      dish_id: item.dish_id ?? null,
    })),
  );
  const [visible, setVisible] = useState(menu?.active ?? true);
  const [isKids, setIsKids] = useState(menu?.is_kids ?? false);
  const existingPhotos = menu?.photos ?? [];
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorMap>({});

  const fieldId = (name: string) => (menu ? `menu-${menu.id}-${name}` : `menu-new-${name}`);

  const keptPhotoCount = existingPhotos.filter((photo) => !removedPhotos.includes(photo.file)).length;
  const photoSlotsLeft = Math.max(0, MENU_PHOTO_MAX_COUNT - keptPhotoCount - newPhotos.length);
  const photoMessage = photoError ?? errors.photos;

  /** Righe da salvare nell'ordine del payload: sort = posizione. Le righe vuote vengono ignorate. */
  const saveRows = useMemo(() => inCourseOrder(items).filter((item) => !isBlank(item)), [items]);
  /** Posizione della riga nel payload: serve a mappare le chiavi di errore "items.<i>.*". */
  const saveIndex = useMemo(
    () => new Map<number, number>(saveRows.map((item, index): [number, number] => [item.key, index])),
    [saveRows],
  );
  /** Stesso piatto due volte nel menù (per id o per nome nella stessa portata). */
  const duplicateErrors = useMemo(() => {
    const seen = new Set<string>();
    const out = new Map<number, string>();
    for (const item of saveRows) {
      const keys = [`name:${item.course}:${normalizeSearch(rowName(item, dishById))}`];
      if (item.dish_id) keys.push(`id:${item.dish_id}`);
      if (keys.some((key) => seen.has(key))) out.set(item.key, "Questo piatto è già nel menù.");
      for (const key of keys) seen.add(key);
    }
    return out;
  }, [saveRows, dishById]);

  function fieldErrorFor(item: DraftItem, field: "name" | "description"): string | undefined {
    const index = saveIndex.get(item.key);
    const fromServer = index === undefined ? undefined : errors[`items.${index}.${field}`];
    if (fromServer) return fromServer;
    return field === "name" ? duplicateErrors.get(item.key) : undefined;
  }

  /** Piatti già scelti in altre righe del menù: non selezionabili di nuovo. */
  function unavailableFor(key: number): ReadonlySet<string> {
    return new Set(items.flatMap((other) => (other.key !== key && other.dish_id ? [other.dish_id] : [])));
  }

  function updateItem(key: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem(course: Course) {
    const key = newKey();
    requestFocus(key);
    setItems((prev) => [...prev, { key, course, name: "", description: "", showDescription: false, dish_id: null }]);
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  /** Sposta la riga tra le righe della sua portata (scambia la posizione con la vicina). */
  function moveItem(key: number, delta: -1 | 1) {
    setItems((prev) => moveWithinCourse(prev, key, delta));
  }

  /** Sceglie un piatto del catalogo: nome e descrizione passano dal catalogo. */
  function selectDish(key: number, dish: Dish) {
    updateItem(key, { dish_id: dish.id, name: dish.name, description: "", showDescription: false });
  }

  /** Digitare nel campo di una riga collegata la rende un nome libero. */
  function changeText(item: DraftItem, text: string) {
    if (item.dish_id) {
      // La descrizione era quella del catalogo: non si porta dietro al nuovo testo.
      updateItem(item.key, { name: text, dish_id: null, description: "", showDescription: false });
    } else {
      updateItem(item.key, { name: text });
    }
  }

  function toggleDescription(key: number, open: boolean) {
    // Chiudere il campo svuota la descrizione: niente testo nascosto che finisce comunque nel salvataggio.
    updateItem(key, open ? { showDescription: true } : { showDescription: false, description: "" });
  }

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
        problems.push(`Massimo ${MENU_PHOTO_MAX_COUNT} foto per menù: "${file.name}" non è stata aggiunta.`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      accepted.push({ key: newKey(), file, previewUrl });
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
    if (duplicateErrors.size > 0) {
      setFormError("Alcuni piatti compaiono più di una volta nel menù: rimuovi i duplicati prima di salvare.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const input = {
      id: menu?.id,
      name: String(form.get("name") ?? ""),
      season: String(form.get("season") ?? ""),
      price_per_person: String(form.get("price_per_person") ?? ""),
      is_kids: isKids,
      active: visible,
      sort: String(form.get("sort") ?? "0"),
      items: saveRows.map((item, index) => ({
        course: item.course,
        name: rowName(item, dishById).trim(),
        sort: index,
        // Con dish_id il server usa nome, portata e descrizione del catalogo; senza, crea o riusa il piatto.
        ...(item.dish_id ? { dish_id: item.dish_id } : { description: item.description.trim() }),
      })),
    };

    // Sempre FormData: payload JSON + foto nuove + nomi delle foto da rimuovere.
    const body = new FormData();
    body.set("payload", JSON.stringify(input));
    for (const photo of newPhotos) body.append("photos", photo.file, photo.file.name);
    for (const file of removedPhotos) body.append("remove_photos", file);

    setFormError(null);
    setErrors({});
    setPhotoError(null);

    startTransition(async () => {
      const result = await upsertMenu(body);
      if (!result.ok) {
        setFormError(result.error);
        setErrors(toErrorMap(result.fieldErrors));
        return;
      }
      onSaved(`Menù "${input.name.trim()}" salvato.`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={menu ? "Modifica menù" : "Nuovo menù"}
      // Annulla il padding del corpo della finestra: il piè di pagina arriva ai bordi e resta in basso.
      className="-mx-6 -my-5 flex flex-col"
    >
      <div className="flex flex-col gap-6 px-6 py-5">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {errors._form && <Alert tone="danger">{errors._form}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Nome del menù"
            htmlFor={fieldId("name")}
            required
            error={errors.name}
            className="sm:col-span-2 lg:col-span-2"
          >
            <Input id={fieldId("name")} name="name" defaultValue={menu?.name ?? ""} required invalid={!!errors.name} />
          </Field>
          <Field label="Stagione" htmlFor={fieldId("season")} error={errors.season} className="lg:col-span-2">
            <Input
              id={fieldId("season")}
              name="season"
              defaultValue={menu?.season ?? ""}
              placeholder="Es. Autunno 2026"
              invalid={!!errors.season}
            />
          </Field>
          <Field label="Prezzo a persona (€)" htmlFor={fieldId("price")} required error={errors.price_per_person}>
            <Input
              id={fieldId("price")}
              name="price_per_person"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              defaultValue={menu ? String(menu.price_per_person) : ""}
              required
              invalid={!!errors.price_per_person}
            />
          </Field>
          <Field label="Ordine in elenco" htmlFor={fieldId("sort")} error={errors.sort}>
            <Input
              id={fieldId("sort")}
              name="sort"
              type="number"
              min={0}
              step={1}
              defaultValue={String(menu?.sort ?? 0)}
              invalid={!!errors.sort}
            />
          </Field>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={LABEL_CLASS}>Menù bambini</span>
            <div className="flex h-11 items-center">
              <Switch
                checked={isKids}
                onCheckedChange={setIsKids}
                disabled={pending}
                label="Menù bambini"
                onLabel="Sì"
                offLabel="No"
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={LABEL_CLASS}>Visibilità</span>
            <div className="flex h-11 items-center">
              <Switch
                checked={visible}
                onCheckedChange={setVisible}
                disabled={pending}
                label="Visibilità del menù"
                onLabel="Visibile"
                offLabel="Nascosto"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <fieldset className="flex min-w-0 flex-col gap-6 border-t border-sand pt-5 lg:border-t-0 lg:pt-0">
            <legend className="mb-1 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">
              Piatti per portata
            </legend>

            <CourseSections
              idPrefix={fieldId("course")}
              items={items}
              disabled={pending}
              emptyText="Nessun piatto. Aggiungi le portate del menù."
              onAdd={addItem}
              renderItem={(item, position) => (
                <DishRow
                  key={item.key}
                  item={item}
                  catalogDish={item.dish_id ? dishById.get(item.dish_id) : undefined}
                  options={pickableByCourse.get(item.course) ?? []}
                  unavailableIds={unavailableFor(item.key)}
                  isFirst={position.isFirst}
                  isLast={position.isLast}
                  nameError={fieldErrorFor(item, "name")}
                  descriptionError={fieldErrorFor(item, "description")}
                  disabled={pending}
                  onTextChange={changeText}
                  onSelect={selectDish}
                  onMove={moveItem}
                  onRemove={removeItem}
                  onToggleDescription={toggleDescription}
                  onDescriptionChange={(key, text) => updateItem(key, { description: text })}
                />
              )}
            />
          </fieldset>

          <fieldset className="flex min-w-0 flex-col gap-4 border-t border-sand pt-5 lg:border-t-0 lg:pt-0">
            <legend className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark">Foto</legend>
            <p className="text-[13px] text-slate-dark">
              Fino a {MENU_PHOTO_MAX_COUNT} foto per menù, 5 MB ciascuna (JPG, PNG, WebP o AVIF).
            </p>

            {existingPhotos.length > 0 && (
              <ul aria-label="Foto attuali" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                {existingPhotos.map((photo, index) => {
                  const removing = removedPhotos.includes(photo.file);
                  return (
                    <li key={photo.file} className="flex flex-col gap-2">
                      <div className="relative aspect-[4/3] overflow-hidden border border-sand bg-cream">
                        <img
                          src={photo.url}
                          alt={`Foto ${index + 1} del menù`}
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
                        disabled={pending}
                        aria-label={`${removing ? "Annulla rimozione" : "Rimuovi"} foto ${index + 1}`}
                        className="self-start"
                      >
                        {removing ? "Annulla" : "Rimuovi"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            {newPhotos.length > 0 && (
              <ul aria-label="Nuove foto da caricare" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                {newPhotos.map((photo, index) => (
                  <li key={photo.key} className="flex flex-col gap-2">
                    <div className="relative aspect-[4/3] overflow-hidden border border-petrol/40 bg-cream">
                      <img src={photo.previewUrl} alt={`Nuova foto ${index + 1}`} className="size-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-petrol/85 px-2 py-1 text-center text-[11px] uppercase tracking-[0.14em] text-paper">
                        Nuova
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeNewPhoto(photo.key)}
                      disabled={pending}
                      aria-label={`Rimuovi nuova foto ${index + 1}`}
                      className="self-start"
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
                disabled={pending || photoSlotsLeft === 0}
                aria-invalid={photoMessage ? true : undefined}
                className="block w-full min-w-0 text-[14px] text-ink file:mr-4 file:cursor-pointer file:rounded-btn file:border file:border-petrol file:bg-transparent file:px-4 file:py-2 file:text-[11px] file:font-medium file:uppercase file:tracking-[0.14em] file:text-petrol hover:file:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>
          </fieldset>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex gap-3 border-t border-sand bg-paper px-6 py-4 sm:justify-end">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending} className="flex-1 sm:flex-none">
          Annulla
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending}
          aria-busy={pending || undefined}
          className="flex-1 sm:flex-none"
        >
          {pending ? "Salvataggio…" : "Salva menù"}
        </Button>
      </div>
    </form>
  );
}

interface DishRowProps {
  item: DraftItem;
  /** Piatto del catalogo collegato alla riga (se presente). */
  catalogDish: Dish | undefined;
  /** Piatti attivi della portata della riga. */
  options: Dish[];
  /** Piatti già presenti in altre righe del menù. */
  unavailableIds: ReadonlySet<string>;
  isFirst: boolean;
  isLast: boolean;
  nameError?: string;
  descriptionError?: string;
  disabled: boolean;
  onTextChange: (item: DraftItem, text: string) => void;
  onSelect: (key: number, dish: Dish) => void;
  onMove: (key: number, delta: -1 | 1) => void;
  onRemove: (key: number) => void;
  onToggleDescription: (key: number, open: boolean) => void;
  onDescriptionChange: (key: number, text: string) => void;
}

/** Riga di un piatto: campo piatto (ricerca nel catalogo o nome libero), ordine e rimozione. */
function DishRow({
  item,
  catalogDish,
  options,
  unavailableIds,
  isFirst,
  isLast,
  nameError,
  descriptionError,
  disabled,
  onTextChange,
  onSelect,
  onMove,
  onRemove,
  onToggleDescription,
  onDescriptionChange,
}: DishRowProps) {
  const rowId = `item-${item.key}`;
  const nameId = `${rowId}-name`;
  const nameErrorId = `${rowId}-name-error`;
  const descriptionId = `${rowId}-description`;
  const linked = item.dish_id !== null;
  const value = catalogDish?.name ?? item.name;
  const label = value.trim() || "piatto senza nome";

  return (
    <li className="flex flex-col gap-2 border-l-[3px] border-sand bg-paper py-1 pl-3 sm:pl-4">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={nameId} className="sr-only">
            Piatto
          </label>
          <DishPicker
            id={nameId}
            value={value}
            options={options}
            selectedId={item.dish_id}
            unavailableIds={unavailableIds}
            invalid={!!nameError}
            describedBy={nameError ? nameErrorId : undefined}
            onChangeText={(text) => onTextChange(item, text)}
            onSelect={(dish) => onSelect(item.key, dish)}
          />
          {nameError && (
            <p id={nameErrorId} className="mt-1.5 text-[13px] text-danger">
              {nameError}
            </p>
          )}
        </div>
        <ReorderButtons
          label={label}
          isFirst={isFirst}
          isLast={isLast}
          disabled={disabled}
          onMove={(delta) => onMove(item.key, delta)}
          onRemove={() => onRemove(item.key)}
        />
      </div>

      {linked ? (
        catalogDish?.description ? (
          <p className="text-[13px] leading-snug text-slate-dark">{catalogDish.description}</p>
        ) : null
      ) : (
        <div className="flex flex-col gap-2">
          {item.showDescription && (
            <Field
              label="Descrizione"
              htmlFor={descriptionId}
              error={descriptionError}
              hint={`Facoltativa, massimo ${DESCRIPTION_MAX} caratteri.`}
            >
              <Textarea
                id={descriptionId}
                rows={2}
                maxLength={DESCRIPTION_MAX}
                value={item.description}
                onChange={(e) => onDescriptionChange(item.key, e.target.value)}
                invalid={!!descriptionError}
              />
            </Field>
          )}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleDescription(item.key, !item.showDescription)}
              disabled={disabled}
              aria-expanded={item.showDescription}
            >
              {item.showDescription ? "Rimuovi descrizione" : "Aggiungi descrizione"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
