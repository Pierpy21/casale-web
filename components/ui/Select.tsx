"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { FIELD_BASE, FIELD_TEXT, borderClass } from "./Input";
import { isDeskLayout, subscribeDeskLayout } from "@/components/shell/shell-mode";

const MAX_LIST_HEIGHT = 320;
const EDGE = 8;
const GAP = 4;
const TYPEAHEAD_MS = 600;

interface OptionItem {
  value: string;
  text: string;
  label: ReactNode;
  disabled: boolean;
}

interface Section {
  label?: string;
  grouped: boolean;
  items: OptionItem[];
}

type OptionElement = ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;

interface Placement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export interface SelectProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "value" | "defaultValue" | "onChange" | "children" | "type" | "name" | "disabled" | "required"
  > {
  /** Nome per il form: il valore viene inviato con un input hidden (FormData, server action). */
  name?: string;
  /** Valore controllato. */
  value?: string;
  /** Valore iniziale non controllato. Senza, la prima opzione abilitata. */
  defaultValue?: string;
  /** Riceve un evento con `e.target.value` e `e.target.name`, come il select nativo. */
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  required?: boolean;
  /** Stato di errore: bordo danger + aria-invalid. */
  invalid?: boolean;
  /** `<option>` e `<optgroup>`, come per il select nativo. */
  children: ReactNode;
  /** Classi del contenitore esterno (es. per flex/grid). `className` va sul pulsante. */
  wrapperClassName?: string;
}

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

function isOptionElement(node: ReactNode): node is OptionElement {
  return isValidElement(node) && node.type === "option";
}

function toItem(el: OptionElement): OptionItem {
  const text = nodeText(el.props.children);
  return {
    value: el.props.value !== undefined ? String(el.props.value) : text,
    text,
    label: el.props.children,
    disabled: Boolean(el.props.disabled),
  };
}

/** Converte i figli `<option>` / `<optgroup>` in sezioni, come le legge il select nativo. */
function collectSections(children: ReactNode, sections: Section[] = []): Section[] {
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<{ children?: ReactNode; label?: string }>(child)) return;
    if ((child.type as unknown) === Fragment) {
      collectSections(child.props.children, sections);
      return;
    }
    if (child.type === "optgroup") {
      sections.push({
        label: child.props.label,
        grouped: true,
        items: Children.toArray(child.props.children).filter(isOptionElement).map(toItem),
      });
      return;
    }
    if (isOptionElement(child)) {
      let last = sections[sections.length - 1];
      if (!last || last.grouped) {
        last = { grouped: false, items: [] };
        sections.push(last);
      }
      last.items.push(toItem(child));
    }
  });
  return sections;
}

function firstEnabledIndex(flat: OptionItem[]): number {
  return flat.findIndex((item) => !item.disabled);
}

function lastEnabledIndex(flat: OptionItem[]): number {
  for (let i = flat.length - 1; i >= 0; i--) if (!flat[i].disabled) return i;
  return -1;
}

function stepEnabled(flat: OptionItem[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < flat.length; i += dir) {
    if (!flat[i].disabled) return i;
  }
  return from;
}

/** Prima voce abilitata il cui testo inizia con `query`, a partire da `from` (incluso), con giro circolare. */
function findByQuery(flat: OptionItem[], query: string, from: number): number {
  const q = query.toLocaleLowerCase();
  const n = flat.length;
  if (n === 0) return -1;
  for (let step = 0; step < n; step++) {
    const i = (((from + step) % n) + n) % n;
    const item = flat[i];
    if (!item.disabled && item.text.toLocaleLowerCase().startsWith(q)) return i;
  }
  return -1;
}

function computePlacement(rect: DOMRect): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(rect.width, vw - EDGE * 2);
  const left = Math.min(Math.max(rect.left, EDGE), vw - EDGE - width);
  const below = vh - rect.bottom - EDGE;
  const above = rect.top - EDGE;
  const openUp = below < Math.min(MAX_LIST_HEIGHT, 220) && above > below;
  const space = (openUp ? above : below) - GAP;
  const maxHeight = Math.min(Math.max(160, Math.min(MAX_LIST_HEIGHT, space)), vh - EDGE * 2);
  const top = openUp ? rect.top - GAP - maxHeight : rect.bottom + GAP;
  return { top: Math.max(EDGE, top), left, width, maxHeight };
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDeskLayout,
    isDeskLayout,
    () => false,
  );
}

/** Evento minimo compatibile con `onChange` del select nativo (si legge solo target.value / target.name). */
function createChangeEvent(value: string, name?: string, id?: string): ChangeEvent<HTMLSelectElement> {
  const target = { value, name: name ?? "", id: id ?? "" };
  return {
    target,
    currentTarget: target,
    type: "change",
    bubbles: true,
    preventDefault() {},
    stopPropagation() {},
    persist() {},
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
  } as unknown as ChangeEvent<HTMLSelectElement>;
}

/**
 * Select del design system: pulsante + elenco custom (pannello sotto/sopra su desktop,
 * foglio dal basso sotto `lg`). Il valore va nel form tramite input hidden con `name`.
 */
export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  invalid,
  className,
  wrapperClassName,
  children,
  ...props
}: SelectProps) {
  const reactId = useId();
  const listId = `${reactId}-list`;
  const optionId = (index: number) => `${reactId}-opt-${index}`;
  const ariaLabel = props["aria-label"];

  const sections = collectSections(children);
  const flat = sections.flatMap((section) => section.items);
  const firstEnabledValue = flat.find((item) => !item.disabled)?.value ?? "";

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<string>(() => defaultValue ?? firstEnabledValue);
  const current = isControlled ? value : internal;
  const selected = flat.find((item) => item.value === current);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const isDesktop = useIsDesktop();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef({ query: "", at: 0 });

  // Il reset del form riporta il valore iniziale (come il select nativo).
  useEffect(() => {
    if (isControlled) return;
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onReset = () => setTimeout(() => setInternal(defaultValue ?? firstEnabledValue), 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [isControlled, defaultValue, firstEnabledValue]);

  // Tiene visibile la voce attiva durante la navigazione da tastiera.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Chiusura su click fuori, scroll (esterno all'elenco) e resize.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (listRef.current && event.target instanceof Node && listRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const openList = () => {
    if (disabled) return;
    const button = buttonRef.current;
    if (button) setPlacement(computePlacement(button.getBoundingClientRect()));
    const index = flat.findIndex((item) => item.value === current);
    setActive(index >= 0 && !flat[index].disabled ? index : firstEnabledIndex(flat));
    setOpen(true);
  };

  const choose = (item: OptionItem) => {
    setOpen(false);
    if (item.disabled || item.value === current) return;
    if (!isControlled) setInternal(item.value);
    onChange?.(createChangeEvent(item.value, name, id));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const { key } = event;
    const printable = key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && key !== " ";

    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        openList();
        return;
      }
      if (printable) {
        const from = flat.findIndex((item) => item.value === current);
        const now = Date.now();
        const buf = typeRef.current;
        buf.query = now - buf.at > TYPEAHEAD_MS ? key : buf.query + key;
        buf.at = now;
        const idx = findByQuery(flat, buf.query, buf.query.length === 1 ? from + 1 : Math.max(from, 0));
        if (idx >= 0) choose(flat[idx]);
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => stepEnabled(flat, i, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => stepEnabled(flat, i, -1));
        return;
      case "Home":
        event.preventDefault();
        setActive(firstEnabledIndex(flat));
        return;
      case "End":
        event.preventDefault();
        setActive(lastEnabledIndex(flat));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (flat[active]) choose(flat[active]);
        else setOpen(false);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      case "Tab":
        setOpen(false);
        return;
    }

    if (printable) {
      const now = Date.now();
      const buf = typeRef.current;
      buf.query = now - buf.at > TYPEAHEAD_MS ? key : buf.query + key;
      buf.at = now;
      let idx = findByQuery(flat, buf.query, buf.query.length === 1 ? active + 1 : Math.max(active, 0));
      if (idx < 0 && buf.query.length > 1) idx = findByQuery(flat, key, active + 1);
      if (idx >= 0) setActive(idx);
    }
  };

  const renderList = (sheet: boolean) => (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : id}
      tabIndex={-1}
      // Il clic sulle voci non sposta il fuoco: resta sul pulsante, che riceve i tasti.
      onMouseDown={(event) => event.preventDefault()}
      style={sheet || !placement ? undefined : { top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }}
      className={cn(
        "outline-none",
        sheet
          ? "min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
          : "fixed z-[60] overflow-y-auto overscroll-contain rounded-xl border border-ink/10 bg-field p-1.5 shadow-xl shadow-ink/15",
      )}
    >
      {sections.map((section, sectionIndex) => (
        <Fragment key={sectionIndex}>
          {section.grouped && section.label !== undefined && (
            <li
              role="presentation"
              className={cn(
                "px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-bronze",
              )}
            >
              {section.label}
            </li>
          )}
          {section.items.map((item) => {
            const index = flat.indexOf(item);
            const isSelected = item.value === current;
            const isActive = index === active;
            return (
              <li
                key={index}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={item.disabled || undefined}
                data-active={isActive || undefined}
                onMouseEnter={() => {
                  if (!item.disabled) setActive(index);
                }}
                onClick={() => choose(item)}
                className={cn(
                  "flex items-center gap-2 px-3.5 text-[15px] text-ink transition-colors duration-150",
                  sheet ? "min-h-12 text-[16px]" : "min-h-10 rounded-lg py-2",
                  !item.disabled && "cursor-pointer",
                  item.disabled && "cursor-not-allowed text-disabled",
                  !item.disabled && isActive ? "bg-cream" : !item.disabled && isSelected ? "bg-petrol/10" : "",
                  isSelected && !item.disabled && "font-medium text-petrol",
                )}
              >
                <span className="min-w-0 flex-1 break-words">{item.label}</span>
                {isSelected && <Check aria-hidden="true" className="size-4 shrink-0 text-petrol" />}
              </li>
            );
          })}
        </Fragment>
      ))}
    </ul>
  );

  return (
    <div className={cn("relative min-w-0", wrapperClassName)}>
      <button
        {...props}
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          // Lo spazio attiva il pulsante al rilascio: lo gestiamo noi in keydown.
          if (event.key === " ") event.preventDefault();
        }}
        className={cn(
          FIELD_BASE,
          FIELD_TEXT,
          "flex min-h-11 items-center gap-2 text-left",
          borderClass(invalid),
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-slate")}>{selected ? selected.label : ""}</span>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md bg-cream/70 text-petrol transition-[transform,background-color] duration-200 motion-reduce:transition-none",
            open && "rotate-180 bg-petrol/10",
            disabled && "bg-transparent text-disabled",
          )}
        >
          <ChevronDown className="size-4" />
        </span>
      </button>

      <input ref={hiddenRef} type="hidden" name={name} value={current} disabled={disabled} />
      {required && (
        // Validazione nativa del form: il campo nascosto segnala "obbligatorio" quando il valore è vuoto.
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          required
          disabled={disabled}
          value={current}
          onChange={() => {}}
        />
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          isDesktop ? (
            placement ? (
              renderList(false)
            ) : null
          ) : (
            <div className="fixed inset-0 z-[60] flex items-end bg-ink/40">
              <div className="flex max-h-[70svh] w-full flex-col rounded-t-2xl bg-field pb-[env(safe-area-inset-bottom)] shadow-xl shadow-ink/20">
                <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-10 shrink-0 rounded-full bg-ink/15" />
                {renderList(true)}
              </div>
            </div>
          ),
          // Dentro una <dialog> modale il resto della pagina è inerte e sotto il top layer: la lista va nella dialog.
          buttonRef.current?.closest("dialog") ?? document.body,
        )}
    </div>
  );
}
