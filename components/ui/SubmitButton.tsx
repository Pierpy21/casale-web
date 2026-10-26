"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

export interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  pendingLabel?: string;
}

/** Bottone submit che legge lo stato pending del form padre (useFormStatus). */
export function SubmitButton({
  pendingLabel,
  children,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
