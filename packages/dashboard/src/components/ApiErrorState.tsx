import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Button, EmptyState } from "@sibyl/ui";
import { describeApiError } from "../lib/api";

interface ApiErrorStateProps {
  title: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

/** Error state for data loaded from the Sibyl API (uses the shared EmptyState). */
export function ApiErrorState({ title, error, onRetry, className }: ApiErrorStateProps) {
  return (
    <EmptyState
      role="alert"
      className={className}
      icon={<AlertCircle size={32} className="text-ember" />}
      title={title}
      description={describeApiError(error)}
      action={onRetry ? <Button onClick={onRetry}>Retry</Button> : undefined}
    />
  );
}
