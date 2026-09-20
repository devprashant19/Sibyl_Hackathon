import * as React from "react";
import { cn } from "../utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-ink-3/50", className)}
      {...props}
    />
  );
}
