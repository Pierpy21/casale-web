"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

export type ModalSize = "md" | "lg" | "xl";

const SIZE_CLASSES: Record<ModalSize, string> = {
  // Larghezza di default (invariata per le finestre esistenti).
  md: "w-[min(92vw,32rem)]",
  lg: "w-[min(92vw,44rem)] max-h-[calc(100dvh-3rem)]",
  // Telefono: schermo intero. Da sm in su: finestra larga con margine e corpo a scorrimento.
  xl: "h-dvh max-h-none w-dvw max-w-none sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[min(94vw,64rem)]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Larghezza della finestra (default "md"). */
  size?: ModalSize;
}

/** Dialog nativo (focus trap, Esc, inert del resto della pagina gestiti dal browser). */
export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      // open:flex evita di mostrare la finestra chiusa (display:none del browser).
      className={cn(
        "m-auto flex-col open:flex rounded-[2px] border border-sand bg-paper p-0 text-ink shadow-2xl shadow-ink/30 backdrop:bg-ink/50",
        SIZE_CLASSES[size],
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-sand px-6 py-4">
        <h2 id={titleId} className="text-2xl">
          {title}
        </h2>
        <Button variant="ghost" size="sm" aria-label="Chiudi" onClick={onClose} className="-mr-2">
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer && (
        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-sand px-6 py-4">
          {footer}
        </div>
      )}
    </dialog>
  );
}
