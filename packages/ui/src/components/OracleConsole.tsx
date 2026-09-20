"use client"

import * as React from "react"
import { cn } from "../utils"

export interface OracleConsoleProps extends React.HTMLAttributes<HTMLDivElement> {
  scenarios: string[];
  typingSpeedMs?: number;
  pauseBetweenScenariosMs?: number;
}

export function OracleConsole({
  scenarios,
  typingSpeedMs = 30,
  pauseBetweenScenariosMs = 3000,
  className,
  ...props
}: OracleConsoleProps) {
  const [scenarioIndex, setScenarioIndex] = React.useState(0);
  const [displayedText, setDisplayedText] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(true);
  
  React.useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    
    if (prefersReducedMotion) {
      setDisplayedText(scenarios[scenarioIndex]);
      setIsTyping(false);
      
      const timer = setTimeout(() => {
        setScenarioIndex((prev) => (prev + 1) % scenarios.length);
      }, pauseBetweenScenariosMs);
      
      return () => clearTimeout(timer);
    }
    
    // Typing effect
    const currentScenario = scenarios[scenarioIndex];
    if (displayedText.length < currentScenario.length) {
      const timer = setTimeout(() => {
        setDisplayedText(currentScenario.slice(0, displayedText.length + 1));
      }, typingSpeedMs);
      return () => clearTimeout(timer);
    } else {
      setIsTyping(false);
      const timer = setTimeout(() => {
        setDisplayedText("");
        setIsTyping(true);
        setScenarioIndex((prev) => (prev + 1) % scenarios.length);
      }, pauseBetweenScenariosMs);
      return () => clearTimeout(timer);
    }
  }, [displayedText, scenarioIndex, scenarios, typingSpeedMs, pauseBetweenScenariosMs]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-ink-3 bg-ink-2 p-6 font-mono text-sm shadow-xl",
        className
      )}
      {...props}
    >
      <div className="absolute top-0 left-0 flex w-full items-center border-b border-ink-3 bg-ink-3/50 px-4 py-2">
        <div className="flex space-x-2">
          <div className="h-2.5 w-2.5 rounded-full bg-ember/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-gold/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-violet/80" />
        </div>
        <div className="ml-4 flex-1 text-center text-xs text-muted">oracle-console</div>
      </div>
      
      <div className="mt-8 min-h-[120px] text-parchment whitespace-pre-wrap">
        <span className="text-gold">❯</span> {displayedText}
        {isTyping && <span className="animate-pulse text-gold">_</span>}
      </div>
    </div>
  )
}
