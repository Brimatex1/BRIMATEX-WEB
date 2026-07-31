import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with Arabic-Egyptian grouping, no decimals. */
export function formatPrice(value: number | string): string {
  return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 0 });
}
