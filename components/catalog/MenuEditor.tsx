"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { upsertMenu } from "@/app/actions/catalog";
import { submitMutation, updatedAtOf } from "@/lib/offline/submit";
import { Alert, Button, cn, Field, Input, Switch } from "@/components/ui";
import { type Course, type Dish, type Menu } from "@/lib/types";
import { MENU_PHOTO_MAX_BYTES, MENU_PHOTO_MAX_COUNT, MENU_PHOTO_MIME_TYPES } from "@/lib/validation";
import { inCourseOrder, moveWithinCourse, useFocusNewRow } from "./CourseSections";
import { CourseDishesEditor, type CourseDishRow } from "./CourseDishesEditor";
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
/** Card di una sezione: fondo paper sullo sfondo cream dell'area di scorrimento. */
const CARD_CLASS = "flex min-w-0 flex-col gap-4 rounded-xl border border-sand bg-paper p-4 sm:p-5";
const COUNT_BADGE_CLASS = "rounded-full bg-cream px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-slate-dark";

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

/** Editor di un menù: dati generali e foto a sinistra (desktop), piatti per portata a destra. */
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
      // Le foto (File) restano nella coda insieme ai dati se la rete manca.
      const result = await submitMutation("catalog.upsertMenu", upsertMenu, [body], {
        label: menu ? `Modifica menù · ${input.name.trim()}` : `Nuovo menù · ${input.name.trim()}`,
        entity: menu ? { type: "menu", id: menu.id } : undefined,
        expectedUpdated: updatedAtOf(menu),
        createsTempId: !menu,
      });
      if (!result.ok) {
        setFormError(result.error);
        setErrors(toErrorMap(result.fieldErrors));
        return;
      }
      onSaved(`Menù "${input.name.trim()}" salvato.`);
    });
  }

  // Righe per il componente condiviso: nome del catalogo se collegato, errori per riga.
  const rowViews: CourseDishRow[] = items.map((item) => {
    const catalogDish = item.dish_id ? dishById.get(item.dish_id) : undefined;
    return {
      key: item.key,
      course: item.course,
      name: catalogDish?.name ?? item.name,
      description: item.description,
      showDescription: item.showDescription,
      dishId: item.dish_id,
      catalogDescription: catalogDish?.description ?? null,
      unavailableIds: unavailableFor(item.key),
      nameError: fieldErrorFor(item, "name"),
      descriptionError: fieldErrorFor(item, "description"),
    };
  });

  /** Chiave -> riga, per tradurre le azioni del componente condiviso nelle funzioni di questo editor. */
  function withItem(key: number, action: (item: DraftItem) => void) {
    const item = items.find((candidate) => candidate.key === key);
    if (item) action(item);
  }

  // Errori generali mostrati nella barra in basso: restano visibili anche con il form scorso in fondo.
  const footerErrors = [formError, errors._form].filter((message): message is string => Boolean(message));

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={menu ? "Modifica menù" : "Nuovo menù"}
      // Nella finestra "bare": scorre solo il contenuto, la barra azioni resta fissa in fondo alla finestra.
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-cream/40">
        <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          {/* Mobile: una colonna nell'ordine Dati, Foto, Piatti. Desktop: a sinistra dati e foto, a destra i piatti. */}
          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby={fieldId("section-data")} className={CARD_CLASS}>
              <h3 id={fieldId("section-data")} className="font-serif text-xl leading-tight text-ink">
                Dati del menù
              </h3>

              <div className="flex min-w-0 items-start gap-3">
                <Field
                  label="Nome del menù"
                  htmlFor={fieldId("name")}
                  required
                  error={errors.name}
                  className="min-w-0 flex-1"
                >
                  <Input id={fieldId("name")} name="name" defaultValue={menu?.name ?? ""} required invalid={!!errors.name} />
                </Field>
                <Field
                  label="Ordine"
                  htmlFor={fieldId("sort")}
                  error={errors.sort}
                  hint="Più basso = prima"
                  className="w-24 shrink-0"
                >
                  <Input
                    id={fieldId("sort")}
                    name="sort"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    defaultValue={String(menu?.sort ?? 0)}
                    invalid={!!errors.sort}
                  />
                </Field>
              </div>

              <Field label="Stagione" htmlFor={fieldId("season")} error={errors.season}>
                <Input
                  id={fieldId("season")}
                  name="season"
                  defaultValue={menu?.season ?? ""}
                  placeholder="Es. Autunno 2026"
                  invalid={!!errors.season}
                />
              </Field>

              <Field
                label="Prezzo a persona (€)"
                htmlFor={fieldId("price")}
                required
                error={errors.price_per_person}
              >
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

              <div className="flex flex-col gap-3">
                <ToggleRow
                  title="Menù bambini"
                  hint="Tariffa dedicata ai bambini"
                  label="Menù bambini"
                  checked={isKids}
                  onCheckedChange={setIsKids}
                  onLabel="Sì"
                  offLabel="No"
                  disabled={pending}
                />
                <ToggleRow
                  title="Visibilità"
                  hint="Attiva o nascondi il menù"
                  label="Visibilità del menù"
                  checked={visible}
                  onCheckedChange={setVisible}
                  onLabel="Visibile"
                  offLabel="Nascosto"
                  disabled={pending}
                />
              </div>
            </section>

            <section aria-labelledby={fieldId("section-photos")} className={CARD_CLASS}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={fieldId("section-photos")} className="font-serif text-xl leading-tight text-ink">
                  Foto
                </h3>
                <span className={COUNT_BADGE_CLASS}>
                  {keptPhotoCount + newPhotos.length}/{MENU_PHOTO_MAX_COUNT}
                </span>
              </div>
              <p className="-mt-2 text-[13px] leading-snug text-slate-dark">
                Fino a {MENU_PHOTO_MAX_COUNT} foto per menù, 5 MB ciascuna (JPG, PNG, WebP o AVIF).
              </p>

              {existingPhotos.length > 0 && (
                <ul aria-label="Foto attuali" className="grid grid-cols-2 gap-3">
                  {existingPhotos.map((photo, index) => {
                    const removing = removedPhotos.includes(photo.file);
                    return (
                      <li key={photo.file} className="flex min-w-0 flex-col gap-2">
                        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-sand bg-cream">
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
                <ul aria-label="Nuove foto da caricare" className="grid grid-cols-2 gap-3">
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
                        disabled={pending}
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
                  disabled={pending || photoSlotsLeft === 0}
                  aria-invalid={photoMessage ? true : undefined}
                  className="block min-h-11 w-full min-w-0 text-[14px] text-ink file:mr-4 file:min-h-11 file:cursor-pointer file:rounded-btn file:border file:border-petrol file:bg-transparent file:px-4 file:py-2 file:text-[11px] file:font-medium file:uppercase file:tracking-[0.14em] file:text-petrol hover:file:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
                />
              </Field>
            </section>
          </div>

          <section aria-labelledby={fieldId("section-dishes")} className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <h3 id={fieldId("section-dishes")} className="font-serif text-xl leading-tight text-ink">
                Piatti
              </h3>
              <span className={COUNT_BADGE_CLASS}>
                {items.length} {items.length === 1 ? "piatto" : "piatti"}
              </span>
            </div>
            <p className="-mt-2 text-[13px] leading-snug text-slate-dark">
              Scrivi il nome o cercalo nel catalogo. I piatti con etichetta Catalogo si modificano nella sezione Piatti.
              Le frecce cambiano l&apos;ordine nella portata.
            </p>

            <CourseDishesEditor
              idPrefix={fieldId("course")}
              rows={rowViews}
              catalog={dishes}
              disabled={pending}
              showNewHint
              emptyText="Nessun piatto. Aggiungi le portate del menù."
              onAddRow={addItem}
              onMoveRow={moveItem}
              onRemoveRow={removeItem}
              onNameChange={(key, text) => withItem(key, (item) => changeText(item, text))}
              onSelectDish={selectDish}
              onToggleDescription={toggleDescription}
              onDescriptionChange={(key, text) => updateItem(key, { description: text })}
            />
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-sand bg-paper px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-10px_24px_-18px_rgba(28,43,45,0.45)] sm:px-6 sm:pb-4">
        {footerErrors.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {footerErrors.map((message) => (
              <Alert key={message} tone="danger">
                {message}
              </Alert>
            ))}
          </div>
        )}
        <div className="flex gap-3 sm:justify-end">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={pending} className="min-h-11 flex-1 sm:flex-none">
            Annulla
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={pending}
            aria-busy={pending || undefined}
            className="min-h-11 flex-1 sm:flex-none"
          >
            {pending ? "Salvataggio…" : "Salva menù"}
          </Button>
        </div>
      </div>
    </form>
  );
}

interface ToggleRowProps {
  title: string;
  hint: string;
  /** Nome accessibile dello switch. */
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onLabel: string;
  offLabel: string;
  disabled: boolean;
}

/** Riga con titolo, spiegazione e interruttore: area di tocco ampia su mobile. */
function ToggleRow({ title, hint, label, checked, onCheckedChange, onLabel, offLabel, disabled }: ToggleRowProps) {
  return (
    <div className="flex min-h-14 min-w-0 items-center justify-between gap-3 rounded-lg border border-field-edge bg-field px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-ink">{title}</p>
        <p className="text-[13px] leading-snug text-slate-dark">{hint}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        label={label}
        onLabel={onLabel}
        offLabel={offLabel}
      />
    </div>
  );
}
