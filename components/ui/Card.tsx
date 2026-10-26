import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-btn border border-sand bg-paper shadow-sm shadow-ink/5", className)}
      {...props}
    />
  );
}
