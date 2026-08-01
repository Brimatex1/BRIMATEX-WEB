import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Reveals its children when they scroll into view.
 *
 * Two failure modes this guards against, both of which hide content forever:
 *   • the visitor asked for reduced motion — start revealed, never animate
 *   • IntersectionObserver is missing — start revealed rather than wait
 *
 * The observer disconnects after firing; these reveals are one-shot.
 */

interface RevealProps {
  children: ReactNode;
  /** Stagger offset in ms — pass index * 60 or so for grids. */
  delay?: number;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Skipping the animation entirely is the accessible default, not a fallback.
  const [shown, setShown] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (shown) return;

    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      {
        threshold: 0,
        // Top is expanded so anything scrolled past still counts as intersecting.
        // Without it, jumping down the page — an anchor, Ctrl+End, a restored
        // scroll position — moves an element from below the viewport to above it
        // with the ratio staying 0 the whole way. No threshold is crossed, the
        // callback never runs, and the element stays invisible for good.
        // Bottom is pulled in slightly so reveals trigger just before entry.
        rootMargin: '100000px 0px -40px 0px',
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={cn(
        'motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-out',
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        className
      )}
      style={shown && delay ? undefined : { transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
