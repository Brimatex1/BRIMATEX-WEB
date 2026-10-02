import { useEffect, useState } from 'react';

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
