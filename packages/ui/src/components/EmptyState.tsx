import * as React from "react";
import { cn } from "../utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center bg-ink-2/30 border border-ink-3 border-dashed rounded-lg h-full min-h-[200px]",
        className
      )}
      {...props}
    >
      {icon && <div className="text-ink-3 mb-4">{icon}</div>}
      <h3 className="font-display text-lg text-parchment mb-2">{title}</h3>
      <p className="text-sm text-muted mb-6 max-w-sm">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
