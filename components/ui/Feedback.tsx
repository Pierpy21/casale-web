import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[2px] border border-dashed border-slate/40 bg-paper px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="text-bronze">{icon}</div>}
      <h3 className="text-xl text-ink">{title}</h3>
      {description && <p className="max-w-sm text-[15px] text-slate">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Senza margine inferiore fisso: lo spazio verticale lo gestisce il contenitore. */
  compact?: boolean;
}

export function PageHeader({ eyebrow, title, description, actions, compact = false }: PageHeaderProps) {
  return (
    <header
      className={
        compact
          ? "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
          : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      }
    >
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && (
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl desk:text-4xl">{title}</h1>
        {description && <p className="max-w-2xl text-[15px] text-slate">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_TONES: Record<AlertTone, string> = {
  info: "border-petrol bg-petrol/5 text-ink",
  success: "border-success bg-success/5 text-ink",
  warning: "border-warning bg-warning/10 text-ink",
  danger: "border-danger bg-danger/5 text-ink",
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(
        "border-l-[3px] px-4 py-3 text-[14px] leading-relaxed",
        ALERT_TONES[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-[2px] bg-cream", className)} />;
}
