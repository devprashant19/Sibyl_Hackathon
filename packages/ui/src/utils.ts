import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Coerces any number (including NaN / Infinity) into the 0..100 range used by percentage UIs. */
export function clampPercent(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}
