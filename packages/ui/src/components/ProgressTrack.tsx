import * as React from "react"
import { clampPercent, cn } from "../utils"

export interface ProgressTrackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Percentage 0..100. Out-of-range values are clamped. */
  value: number;
  indicatorColor?: "gold" | "violet" | "ember";
}

const ProgressTrack = React.forwardRef<HTMLDivElement, ProgressTrackProps>(
  ({ className, value, indicatorColor = "gold", ...props }, ref) => {
    const indicatorColors = {
      gold: "bg-gold",
      violet: "bg-violet",
      ember: "bg-ember",
    };
    const pct = clampPercent(value);

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-ink-3",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full w-full flex-1 transition-all duration-500 ease-in-out motion-reduce:transition-none",
            indicatorColors[indicatorColor]
          )}
          style={{ transform: `translateX(-${100 - pct}%)` }}
        />
      </div>
    )
  }
)
ProgressTrack.displayName = "ProgressTrack"

export { ProgressTrack }
