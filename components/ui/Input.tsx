import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

/**
 * Superficie di tutti i campi (input, textarea, select, stepper, combobox):
 * angoli morbidi, fondo bianco che stacca dalla carta. Il bordo e il focus sono in borderClass.
 * cn non fa merge: le varianti di testo non si sovrascrivono con className, si usa FIELD_TEXT / FIELD_TEXT_LARGE.
 */
export const FIELD_BASE =
  "w-full min-h-11 min-w-0 max-w-full rounded-lg border bg-field px-3.5 py-2.5 text-ink placeholder:text-slate shadow-[inset_0_1px_2px_rgb(28_43_45/0.04)] transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none disabled:cursor-not-allowed disabled:border-ink/10 disabled:bg-cream/50 disabled:text-disabled disabled:shadow-none";

/** Testo dei campi: 16px su mobile (niente zoom iOS), 15px da lg. */
export const FIELD_TEXT = "text-[16px] desk:text-[15px]";
/** Testo grande dei campi (date e ricerche in primo piano). */
export const FIELD_TEXT_LARGE = "text-[17px]";

/** Bordo e focus. Focus petrol a riposo; con errore il focus resta danger. */
export function borderClass(invalid?: boolean): string {
  return invalid
    ? "border-danger/70 bg-danger/[0.03] ring-[3px] ring-danger/15 hover:border-danger focus:border-danger focus:ring-danger/25"
    : "border-field-edge hover:border-field-edge-hover focus:border-petrol focus:ring-[3px] focus:ring-petrol/25";
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Stato di errore: bordo danger + aria-invalid. */
  invalid?: boolean;
  /** Testo grande (17px) al posto della tipografia standard dei campi. */
  large?: boolean;
}

export function Input({ className, invalid, large, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, large ? FIELD_TEXT_LARGE : FIELD_TEXT, borderClass(invalid), className)}
      {...props}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, FIELD_TEXT, "min-h-24 resize-y", borderClass(invalid), className)}
      {...props}
    />
  );
}

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
}

export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.5 text-[15px] text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:text-disabled",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="size-4 cursor-pointer rounded-[2px] accent-petrol"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
