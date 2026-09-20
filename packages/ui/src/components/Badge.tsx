import * as React from "react"
import { cn } from "../utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "pass" | "fail" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-ink-3 text-parchment",
    pass: "border-transparent bg-gold/10 text-gold",
    fail: "border-transparent bg-ember/10 text-ember",
    outline: "text-muted border-ink-3",
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
