import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Libyan dinar. Single source so a market change is one edit. */
export const CURRENCY = 'د.ل';

/** Arabic month names with Latin digits, which is what ar-LY uses. */
export const LOCALE = 'ar-LY';

/**
 * Latin digits with comma grouping.
 *
 * Not toLocaleString('ar-LY'): that groups with a period, so 1450 renders as
 * "1.450" and reads as one and a half dinars at a glance. On a price that
 * ambiguity is not worth the locale correctness.
 */
const PRICE_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatPrice(value: number | string): string {
  return PRICE_FORMAT.format(Number(value) || 0);
}
