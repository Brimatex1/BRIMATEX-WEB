import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** A CSS media query, live (false before the first paint on the server - there is none here). */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Desktop layout from 1024 px (design/docs/DESIGN.md breakpoints). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** The tab's title, worded for search: «بالانس | بريماتكس». */
export function useTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | بريماتكس` : 'بريماتكس — متجر المراتب';
  }, [title]);
}

/**
 * A change that moves things on the page (a cart row removed): the browser
 * animates it with View Transitions - the row fades, the ones below slide up
 * (index.css). Without support, or under reduced motion, it simply happens.
 */
export function animateChange(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return update();
  doc.startViewTransition(() => flushSync(update));
}
