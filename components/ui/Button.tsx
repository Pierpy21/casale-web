import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "outline" | "light" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium uppercase transition-colors duration-300 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-petrol bg-petrol text-paper hover:bg-petrol-hover focus-visible:outline-ink",
  outline:
    "border border-petrol bg-transparent text-petrol hover:bg-petrol hover:text-paper focus-visible:outline-petrol",
  light:
    "border border-sand/50 bg-transparent text-sand hover:border-sand/80 hover:bg-sand/10 focus-visible:outline-sand",
  ghost:
    "border border-transparent bg-transparent text-petrol hover:bg-cream focus-visible:outline-petrol",
  danger:
    "border border-danger bg-danger text-paper hover:brightness-95 focus-visible:outline-danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-[11px] tracking-[0.14em]",
  md: "px-8 py-3.5 text-[13px] tracking-widest",
  lg: "px-10 py-4 text-[14px] tracking-widest",
};

/** Classi del bottone, riusabili su <Link> o altri elementi. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  // rounded-btn di default; una classe rounded-* nel className (es. rounded-none) lo sostituisce.
  const shape = className?.includes("rounded-") ? undefined : "rounded-btn";
  return cn(BASE, shape, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
