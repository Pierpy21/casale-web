"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { createInventoryProduct, submitInventoryReport } from "@/app/actions/inventory";
import { CountStepper } from "@/components/bookings/CountStepper";
import { Alert, Button, Field, Input, Textarea, cn } from "@/components/ui";
import { INVENTORY_STATE_LABELS, INVENTORY_STATES, type InventoryProduct, type InventoryState } from "@/lib/types";
import { Check, Plus, Search, Trash2 } from "lucide-react";

export interface InventoryReportFormProps {
  /** Prodotti attivi dal catalogo. */
  products: InventoryProduct[];
  /** Data di oggi (YYYY-MM-DD), calcolata sul server per evitare differenze di fuso. */
  today: string;
}

interface LineDraft {
  key: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  state: InventoryState;
  quantity: number;
}

type Errors = Record<string, string[]>;

let lineSeq = 0;
const nextLineKey = (): string => {
  lineSeq += 1;
  return `line-${lineSeq}`;
};

const SUGGESTIONS = 8;

/**
 * Nuova giacenza: data, righe prodotto (dal catalogo o nuovo nome, che entra nel catalogo),
 * stato Presente / Da ordinare, quantità, note. Invio → dettaglio del report.
 */
export function InventoryReportForm({ products: initialProducts, today }: InventoryReportFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts);
  const [reportDate, setReportDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const normalized = trimmedQuery.toLowerCase();

  const suggestions = useMemo(
    () =>
      products
        .filter((p) => !normalized || p.name.toLowerCase().includes(normalized))
        .slice(0, SUGGESTIONS),
    [products, normalized],
  );
  const exactProduct = products.find((p) => p.name.trim().toLowerCase() === normalized);
  const exactMatch = exactProduct !== undefined;

  /** Aggiunge un prodotto del catalogo: se la stessa riga (stesso prodotto e stato) esiste, aumenta la quantità. */
  const addProduct = (product: { id: string; name: string; unit: string | null }) => {
    setErrors({});
    setQuery("");
    setLines((current) => {
      const existing = current.find((l) => l.product_id === product.id && l.state === "presente");
      if (existing) {
        return current.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...current,
        {
          key: nextLineKey(),
          product_id: product.id,
          product_name: product.name,
          unit: product.unit ?? "",
          state: "presente",
          quantity: 1,
        },
      ];
    });
  };

  /** Nome nuovo: lo crea nel catalogo (così resta disponibile), poi aggiunge la riga. */
  const createAndAdd = () => {
    if (!trimmedQuery) return;
    setFormError(null);
    startTransition(async () => {
      const result = await createInventoryProduct({ name: trimmedQuery });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      const created: InventoryProduct = {
        id: result.data.id,
        name: result.data.name,
        unit: result.data.unit,
        category: null,
        active: true,
      };
      // Il prodotto entra nel catalogo locale (senza duplicati) prima di aggiungere la riga.
      setProducts((list) => {
        if (list.some((p) => p.id === created.id)) return list;
        return [...list, created].sort((a, b) => a.name.localeCompare(b.name, "it"));
      });
      addProduct(created);
    });
  };

  const updateLine = (key: string, changes: Partial<Omit<LineDraft, "key">>) => {
    setErrors({});
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  };

  const removeLine = (key: string) => {
    setErrors({});
    setLines((current) => current.filter((l) => l.key !== key));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const local: Errors = {};
    if (!reportDate) local.report_date = ["Data obbligatoria"];
    if (lines.length === 0) local._form = ["Aggiungi almeno un prodotto"];
    lines.forEach((line, index) => {
      if (!line.product_id && !line.product_name.trim()) local[`lines.${index}.product_name`] = ["Indica il prodotto"];
      if (!(line.quantity > 0)) local[`lines.${index}.quantity`] = ["La quantità deve essere almeno 1"];
    });
    setErrors(local);
    if (Object.keys(local).length > 0) {
      setFormError(local._form?.[0] ?? "Controlla le righe evidenziate.");
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }

    const payload = {
      report_date: reportDate,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        product_name: l.product_id ? null : l.product_name.trim(),
        unit: l.unit.trim() || null,
        state: l.state,
        quantity: l.quantity,
      })),
    };

    startTransition(async () => {
      const result = await submitInventoryReport(payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      router.push(`/admin/giacenza/${result.data.id}`);
    });
  };

  const lineError = (index: number, field: string) => errors[`lines.${index}.${field}`]?.[0];
  const toOrder = lines.filter((l) => l.state === "da_ordinare").length;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label="Nuova giacenza" className="flex min-w-0 flex-col gap-6">
      {formError && <Alert tone="danger">{formError}</Alert>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Field label="Data" htmlFor="report-date" required error={errors.report_date?.[0]}>
          <Input
            id="report-date"
            type="date"
            disabled={pending}
            invalid={!!errors.report_date}
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="text-[18px]"
          />
        </Field>
      </div>

      <section aria-labelledby="inventory-search-title" className="flex flex-col gap-3 rounded-[2px] border border-sand bg-paper p-4 sm:p-5">
        <h2 id="inventory-search-title" className="text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">
          Aggiungi prodotto
        </h2>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate" />
          <Input
            id="inventory-search"
            type="search"
            autoComplete="off"
            enterKeyHint="done"
            disabled={pending}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // Invio: prodotto esatto → aggiunge; un solo risultato → aggiunge; altrimenti crea il nuovo nome.
              if (exactProduct) addProduct(exactProduct);
              else if (suggestions.length === 1) addProduct(suggestions[0]);
              else if (trimmedQuery) createAndAdd();
            }}
            placeholder="Cerca o scrivi un prodotto…"
            className="h-12 pl-12 text-[17px]"
          />
        </div>

        {trimmedQuery && (
          <ul aria-label="Risultati" className="flex max-h-72 flex-col divide-y divide-sand overflow-y-auto rounded-btn border border-sand">
            {suggestions.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={pending}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[17px] text-ink transition-colors hover:bg-cream"
                >
                  <span className="min-w-0 wrap-anywhere">{product.name}</span>
                  {product.unit && <span className="shrink-0 text-[14px] text-slate-dark">{product.unit}</span>}
                </button>
              </li>
            ))}
            {!exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={createAndAdd}
                  disabled={pending}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-[17px] font-medium text-petrol transition-colors hover:bg-cream"
                >
                  <Plus aria-hidden="true" className="size-5 shrink-0" />
                  <span className="min-w-0 wrap-anywhere">Nuovo prodotto: «{trimmedQuery}»</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {lines.length === 0 ? (
        <p className="border border-dashed border-slate/40 px-5 py-8 text-center text-[16px] text-slate-dark">
          Nessun prodotto ancora. Cerca un prodotto qui sopra o scrivine il nome.
        </p>
      ) : (
        <ul aria-label="Prodotti della giacenza" className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <li
              key={line.key}
              data-invalid={lineError(index, "product_name") || lineError(index, "quantity") ? "true" : undefined}
              className={cn(
                "flex min-w-0 flex-col gap-4 rounded-[2px] border bg-paper p-4 shadow-sm shadow-ink/5",
                line.state === "da_ordinare" ? "border-l-[6px] border-l-warning border-sand" : "border-sand",
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="wrap-anywhere font-serif text-2xl leading-tight text-ink">{line.product_name}</p>
                  {lineError(index, "product_name") && <p className="text-[13px] text-danger">{lineError(index, "product_name")}</p>}
                </div>
                <button
                  type="button"
                  aria-label={`Rimuovi ${line.product_name}`}
                  onClick={() => removeLine(line.key)}
                  disabled={pending}
                  className="grid size-11 shrink-0 place-items-center rounded-[2px] text-slate-dark transition-colors hover:bg-cream hover:text-danger"
                >
                  <Trash2 aria-hidden="true" className="size-5" />
                </button>
              </div>

              <div role="group" aria-label={`Stato di ${line.product_name}`} className="grid grid-cols-2 gap-2">
                {INVENTORY_STATES.map((state) => {
                  const active = line.state === state;
                  return (
                    <button
                      key={state}
                      type="button"
                      aria-pressed={active}
                      disabled={pending}
                      onClick={() => updateLine(line.key, { state })}
                      className={cn(
                        "flex min-h-12 items-center justify-center gap-2 rounded-btn border px-3 text-[15px] font-semibold uppercase tracking-[0.08em] transition-colors",
                        active
                          ? state === "da_ordinare"
                            ? "border-warning bg-warning text-ink"
                            : "border-petrol bg-petrol text-paper"
                          : "border-slate/50 bg-paper text-slate-dark hover:border-slate",
                      )}
                    >
                      {active && <Check aria-hidden="true" className="size-4" />}
                      {INVENTORY_STATE_LABELS[state]}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
                <CountStepper
                  id={`qty-${line.key}`}
                  label="Quantità"
                  value={line.quantity}
                  min={1}
                  onChange={(n) => updateLine(line.key, { quantity: n })}
                  error={lineError(index, "quantity")}
                />
                <Field label="Unità" htmlFor={`unit-${line.key}`} hint="Es. kg, g, bottiglie">
                  <Input
                    id={`unit-${line.key}`}
                    disabled={pending}
                    value={line.unit}
                    maxLength={40}
                    onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                    placeholder="es. 500 g"
                  />
                </Field>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <p className="text-[15px] text-slate-dark">
          {lines.length} {lines.length === 1 ? "prodotto" : "prodotti"} · <span className="font-semibold text-ink">{toOrder} da ordinare</span>
        </p>
      )}

      <Field label="Note" htmlFor="report-notes" hint="Facoltative: visibili nel PDF">
        <Textarea id="report-notes" rows={3} disabled={pending} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex flex-col-reverse gap-3 border-t border-sand pt-6 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || lines.length === 0}
          aria-busy={pending || undefined}
          className="w-full sm:w-auto"
        >
          {pending ? "Invio in corso…" : "Invia giacenza"}
        </Button>
      </div>
    </form>
  );
}
