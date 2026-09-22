import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { Banner } from '@/types';

/** How long each picture stays before the next slides in. */
const INTERVAL_MS = 4500;

/**
 * The home page's sliding banners, in the announcement's place - the same
 * list and the same behaviour as the app's (brimatex-ios/src/components/
 * BannerCarousel.tsx).
 *
 * The page is right-to-left, so the next picture comes in from the left and
 * the row moves left to right. It advances by itself, stops while a finger or
 * the mouse is on it, can be swiped, and holds still for visitors who asked
 * their device for reduced motion.
 */
export function BannerCarousel({ banners, onOpen }: { banners: Banner[]; onOpen: (link: string) => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = banners.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (count < 2 || paused || still) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;

  // Right-to-left: a positive shift reveals the pictures waiting on the left.
  const step = (by: number) => setIndex((i) => (i + by + count) % count);

  return (
    <div
      className="relative overflow-hidden rounded-[20px] bg-app-nebula"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        setPaused(true);
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        setPaused(false);
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        // Right-to-left: a swipe to the right brings the next picture in.
        if (Math.abs(dx) > 40) step(dx > 0 ? 1 : -1);
      }}
      aria-roledescription="carousel"
      aria-label="إعلانات"
    >
      <div
        className="flex transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      >
        {banners.map((b, i) => {
          const picture = (
            <img
              src={b.imageUrl}
              alt=""
              className="aspect-video w-full object-cover"
              // The first is on screen at load; the others can wait.
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
          );
          return (
            <div
              key={b.id}
              className="w-full shrink-0"
              aria-roledescription="slide"
              aria-label={`${i + 1} من ${count}`}
              aria-hidden={i !== index}
            >
              {b.link ? (
                <button
                  type="button"
                  onClick={() => onOpen(b.link)}
                  tabIndex={i === index ? 0 : -1}
                  className="block w-full"
                  aria-label={`إعلان ${i + 1}`}
                >
                  {picture}
                </button>
              ) : (
                picture
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`الإعلان ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'h-2 rounded-full bg-white/60 shadow transition-all',
                i === index ? 'w-5 bg-white' : 'w-2'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
