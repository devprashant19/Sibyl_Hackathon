import * as React from "react"
import { cn } from "../utils"

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
}

const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, ...props }, ref) => {
    return (
      <pre
        ref={ref}
        className={cn(
          "overflow-x-auto rounded-md bg-ink-3 p-4 text-sm font-mono text-muted",
          className
        )}
        {...props}
      >
        <code>{code}</code>
      </pre>
    )
  }
)
CodeBlock.displayName = "CodeBlock"

export { CodeBlock }
