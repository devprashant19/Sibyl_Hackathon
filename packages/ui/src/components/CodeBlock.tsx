"use client";

import * as React from "react"
import { cn } from "../utils"

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
  language?: string;
}

const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, language, ...props }, ref) => {
    return (
      <div className={cn("rounded-xl overflow-hidden border border-[#2d3449] shadow-lg bg-[#060e20] text-left", className)}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3449] bg-[#0b1326]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
            <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
            <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
            {language && <div className="ml-2 font-mono text-xs text-[#94a3b8]">{language}</div>}
          </div>
          <button 
            className="text-[#64748b] hover:text-white transition-colors flex items-center justify-center"
            title="Copy to clipboard"
            onClick={() => navigator.clipboard.writeText(code)}
          >
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
          </button>
        </div>
        <pre
          ref={ref}
          data-language={language}
          className="p-4 text-sm font-mono text-[#dae2fd] overflow-x-auto whitespace-pre-wrap leading-relaxed m-0"
          {...props}
        >
          <code className={language ? `language-${language}` : undefined}>{code}</code>
        </pre>
      </div>
    )
  }
)
CodeBlock.displayName = "CodeBlock"

export { CodeBlock }
