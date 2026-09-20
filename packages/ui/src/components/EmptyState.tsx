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
        "flex flex-col items-center justify-center p-8 text-center bg-surface border border-border border-dashed rounded-lg h-full min-h-[200px]",
        className
      )}
      {...props}
    >
      {icon && <div className="text-text-muted mb-4">{icon}</div>}
      <h3 className="font-semibold text-lg text-text mb-2">{title}</h3>
      <p className="text-sm text-text-muted mb-6 max-w-sm">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
