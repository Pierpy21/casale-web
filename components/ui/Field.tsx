import type { ReactNode } from "react";
import { cn } from "./cn";

/** Id stabili per collegare l'input a hint/errore con aria-describedby. */
export function fieldIds(htmlFor: string) {
  return { hintId: `${htmlFor}-hint`, errorId: `${htmlFor}-error` };
}

export interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FieldProps) {
  const { hintId, errorId } = fieldIds(htmlFor);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="break-words text-[12px] font-medium uppercase tracking-[0.14em] text-slate-dark"
      >
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
            <span className="sr-only"> (obbligatorio)</span>
          </>
        )}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-slate">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
