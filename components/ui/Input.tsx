import { ChevronDown } from "lucide-react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

const FIELD_BASE =
  "w-full min-w-0 max-w-full rounded-btn border bg-paper px-3.5 py-2.5 text-[16px] lg:text-[15px] text-ink placeholder:text-slate transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40 disabled:cursor-not-allowed disabled:bg-cream disabled:text-disabled";

function borderClass(invalid?: boolean): string {
  return invalid ? "border-danger" : "border-slate/70 hover:border-slate";
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Stato di errore: bordo danger + aria-invalid. */
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, borderClass(invalid), className)}
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
      className={cn(FIELD_BASE, "min-h-24 resize-y", borderClass(invalid), className)}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

/** Select nativo con chevron del design system. */
export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <div className="relative min-w-0">
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          FIELD_BASE,
          "appearance-none pr-10",
          borderClass(invalid),
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-dark"
      />
    </div>
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
