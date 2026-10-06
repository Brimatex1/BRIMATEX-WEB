import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';

import { cn } from '@/lib/utils';
import type { WebBanner } from '@/types';

import { BannerSlide, type BannerMode, type RenderLink } from './BannerSlide';
import { resolveMarketingLink } from './marketing';
import { Link } from './router';
import { useShop } from './state';

/** How long a banner stays before the next slides in. */
const SLIDE_MS = 6000;

/** Desktop from 1024px - the storefront's lg, where the hero turns side by side. */
function useMode(): BannerMode {
  const query = '(min-width: 1024px)';
  const [mode, setMode] = useState<BannerMode>(() => (typeof window !== 'undefined' && window.matchMedia?.(query).matches ? 'desktop' : 'mobile'));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMode(mq.matches ? 'desktop' : 'mobile');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mode;
}

/** A banner's links: a /p/<slug> link becomes the mattress's own address, an https one opens apart. */
function useBannerLink(): RenderLink {
  const shop = useShop();
  return useCallback<RenderLink>(
    (href, props) => {
      const to = resolveMarketingLink(href, shop.products);
      if (/^https:\/\//.test(to)) return <a href={to} target="_blank" rel="noopener noreferrer" {...props} />;
      return <Link to={to} {...props} />;
    },
    [shop.products]
  );
}

/**
 * The offers page's campaigns: the banners that carry an offer card (the
 * loyalty banner's «60 د.ل خصم»), one under another - the same slides as the
 * home page, without the carousel.
 */
export function OfferBanners({ banners }: { banners: WebBanner[] }) {
  const mode = useMode();
  const renderLink = useBannerLink();
  if (!banners.length) return null;
  return (
    <div className="-mx-4 flex flex-col gap-5 lg:mx-0">
      {banners.map((b, i) => (
        <BannerSlide key={b.id} banner={b} mode={mode} heading="h2" renderLink={renderLink} eager={i === 0} />
      ))}
    </div>
  );
}

/**
 * The home page's banners (the panel's «الواجهة والبانرات», up to five):
 * real text and links over each photo (BannerSlide), sliding by themselves
 * every few seconds - paused while the pointer or the keyboard is on them,
 * and not at all with reduced motion. A /p/<slug> link becomes the
 * mattress's own address once the catalogue is in.
 */
export function HomeBanners({ banners }: { banners: WebBanner[] }) {
  const mode = useMode();
  const [viewport, embla] = useEmblaCarousel({ direction: 'rtl', loop: banners.length > 1, duration: 28 });
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);

  const renderLink = useBannerLink();

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setIndex(embla.selectedScrollSnap());
    embla.on('select', onSelect);
    embla.on('reInit', onSelect);
    return () => {
      embla.off('select', onSelect);
      embla.off('reInit', onSelect);
    };
  }, [embla]);

  useEffect(() => {
    if (!embla || banners.length < 2 || held) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => embla.scrollNext(), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [embla, banners.length, held]);

  if (!banners.length) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="العروض والمراتب"
      className="relative"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div ref={viewport} className="overflow-hidden">
        <div className="flex touch-pan-y">
          {banners.map((b, i) => (
            <div
              key={b.id}
              className="min-w-0 shrink-0 grow-0 basis-full"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} من ${banners.length}`}
              aria-hidden={i !== index}
            >
              <BannerSlide banner={b} mode={mode} heading={i === 0 ? 'h1' : 'h2'} renderLink={renderLink} eager={i === 0} tabbable={i === index} />
            </div>
          ))}
        </div>
      </div>
      {banners.length > 1 ? (
        <div className={cn('flex justify-center gap-1.5', mode === 'desktop' ? 'absolute bottom-4 left-0 w-[60%]' : 'py-3')}>
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => embla?.scrollTo(i)}
              aria-label={`البانر ${i + 1}: ${b.title}`}
              aria-current={i === index}
              className={cn(
                'relative h-2 rounded-full transition-all after:absolute after:-inset-2',
                i === index ? 'w-6' : 'w-2',
                mode === 'desktop' ? (i === index ? 'bg-white' : 'bg-white/60') : i === index ? 'bg-dark-ocean' : 'bg-dark-ocean/25'
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
