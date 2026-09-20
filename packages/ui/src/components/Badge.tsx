import * as React from "react"
import { cn } from "../utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "pass" | "fail" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-amber bg-amber/10 text-amber",
    pass: "border-green bg-green-dim text-green-bright",
    fail: "border-red bg-red-dim text-red",
    outline: "border-border bg-surface-raised text-text-muted",
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 border text-[10px] font-semibold font-mono transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
