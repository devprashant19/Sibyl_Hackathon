import * as React from "react"
import { cn } from "../utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md";
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-gold text-ink hover:bg-gold/90 font-semibold",
  secondary: "bg-ink-3 text-parchment hover:bg-ink-3/80",
  outline: "bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20 font-semibold",
  ghost: "text-muted hover:text-parchment hover:bg-ink-3/50",
}

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
}

/** Server-safe button (no hooks). Event handlers still require a client component parent. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
)
Button.displayName = "Button"

export { Button }
