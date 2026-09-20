import * as React from "react"
import { cn } from "../utils"

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
  /** Optional language hint. No highlighting is applied; it is exposed as `data-language` / `language-*` for styling. */
  language?: string;
}

const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, language, ...props }, ref) => {
    return (
      <pre
        ref={ref}
        data-language={language}
        className={cn(
          "overflow-x-auto rounded-md bg-ink-3 p-4 text-sm font-mono text-muted",
          className
        )}
        {...props}
      >
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    )
  }
)
CodeBlock.displayName = "CodeBlock"

export { CodeBlock }
