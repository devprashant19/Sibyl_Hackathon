import * as React from "react"
import { cn } from "../utils"

export interface ProgressTrackProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  indicatorColor?: "gold" | "violet" | "ember";
}

const ProgressTrack = React.forwardRef<HTMLDivElement, ProgressTrackProps>(
  ({ className, value, indicatorColor = "gold", ...props }, ref) => {
    const indicatorColors = {
      gold: "bg-gold",
      violet: "bg-violet",
      ember: "bg-ember",
    };

    return (
      <div
        ref={ref}
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
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </div>
    )
  }
)
ProgressTrack.displayName = "ProgressTrack"

export { ProgressTrack }
