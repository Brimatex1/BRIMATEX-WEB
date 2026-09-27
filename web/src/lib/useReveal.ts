import { useEffect, useRef } from 'react';

/**
 * A home-page section that comes in as it scrolls into view - once, never
 * again on the way back up. Its items carry `reveal-item` and an index `--i`
 * for the stagger (index.css). A section already on screen when the page
 * opens is left alone: nothing the visitor is looking at gets hidden.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = 'done';
        observer.disconnect();
      },
      { rootMargin: '0px 0px -80px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** The stagger index, as the style an item needs. */
export function revealIndex(i: number): React.CSSProperties {
  return { '--i': Math.min(i, 8) } as React.CSSProperties;
}
