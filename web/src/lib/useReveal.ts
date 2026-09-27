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
    const reveal = () => {
      el.dataset.reveal = 'done';
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && reveal(), {
      rootMargin: '0px 0px -80px 0px',
    });
    // A net under the observer: a jump that skips the section in one frame
    // (the End key, a fast fling) must never leave it hidden - motion is
    // decoration, the content is not.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (el.getBoundingClientRect().top < window.innerHeight) reveal();
      });
    };
    observer.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return ref;
}

/** The stagger index, as the style an item needs. */
export function revealIndex(i: number): React.CSSProperties {
  return { '--i': Math.min(i, 8) } as React.CSSProperties;
}
