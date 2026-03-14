import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatProbability(val: number | null | undefined): string {
  if (val == null) return "0%";
  return `${(val * 100).toFixed(0)}%`;
}

export function formatOdds(val: number | null | undefined): string {
  if (val == null) return "-";
  return val.toFixed(2);
}
