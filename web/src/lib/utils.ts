import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { Category } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Categories not open for purchase yet — shown as "قريباً" instead of a buy button. */
export const COMING_SOON_CATEGORIES: Category[] = ['pillow', 'bedding'];

export function isComingSoon(category?: Category): boolean {
  return category ? COMING_SOON_CATEGORIES.includes(category) : false;
}

/** Libyan dinar. Single source so a market change is one edit. */
export const CURRENCY = 'د.ل';

/** ISO 4217 — needed for Meta Pixel events, which don't accept the display symbol. */
export const CURRENCY_ISO = 'LYD';

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
