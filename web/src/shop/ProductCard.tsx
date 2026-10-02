import { useState } from 'react';
import { Heart } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Product, ProductVariant } from '@/types';

import balance from './assets/photos/balance-pillowtop.jpg';
import comfort from './assets/photos/comfort-beige.jpg';
import deluxe from './assets/photos/deluxe-navy.jpg';
import hotel from './assets/photos/hotel-night.jpg';
import sport from './assets/photos/sport-grey.jpg';
import { describe, displayName, featuredVariant, parseSize, sizeText, tierOf } from './catalog';
import { Link } from './router';
import { useShop } from './state';
import { Price, RatingStars, SizeText, TierTag } from './ui';

/** The handoff's photos (assets/photos), for a mattress with no photo uploaded from the dashboard. */
const PLACEHOLDER: Record<string, string> = { بالانس: balance, ديلوكس: deluxe, هوتيل: hotel, سبورت: sport };

export function photoOf(product: Product): string {
  if (product.image) return product.image;
  return PLACEHOLDER[displayName(product)] ?? comfort;
}

/** The photo on #F5F5F5, no frame; zooms a little on hover (devices that hover). */
export function ProductPhoto({ product, className, eager = false }: { product: Product; className?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn('overflow-hidden bg-image-bg', className)}>
      <img
        src={photoOf(product)}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn('size-full object-cover transition-[opacity,transform] duration-slow ease-out-strong group-hover:scale-[1.03] motion-reduce:transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}

/** The 44 px white heart: shrinks, grows and fills when saved; guests are asked to sign in. */
export function HeartButton({ product, className }: { product: Product; className?: string }) {
  const shop = useShop();
  const saved = shop.wishlist.has(product.id);
  const [bump, setBump] = useState(0);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `إزالة ${displayName(product)} من المفضّلة` : `أضف ${displayName(product)} إلى المفضّلة`}
      disabled={shop.wishlist.pending === product.id}
      onClick={() => {
        setBump((n) => n + 1);
        shop.toggleFavorite(product);
      }}
      className={cn('grid size-11 place-items-center rounded-full border border-border bg-background text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      <Heart key={bump} className={cn('size-5', bump > 0 && 'animate-heart motion-reduce:animate-none', saved && 'fill-dark-ocean text-dark-ocean dark:fill-blue-violet dark:text-blue-violet')} strokeWidth={1.8} />
    </button>
  );
}

/**
 * A mattress in a grid: photo, heart over the photo's bottom corner, name,
 * description with the size, price, stars, tier. The card is one link; the
 * heart is its own button beside it (never a button inside a link).
 */
export function ProductCard({ product, variant, className, eager }: { product: Product; variant?: ProductVariant; className?: string; eager?: boolean }) {
  const v = variant ?? featuredVariant(product);
  const p = parseSize(v);
  const tier = tierOf(product);
  const query = p.width !== null ? `?size=${p.width}x${p.length}${p.height ? `&height=${p.height}` : ''}` : '';
  return (
    <div className={cn('group relative flex flex-col', className)}>
      <Link to={`/product/${product.id}${query}`} className="flex flex-col gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4" aria-label={`${displayName(product)}، ${v.price} دينار`}>
        <ProductPhoto product={product} eager={eager} className="aspect-[15/16] w-full" />
        <span className="mt-[22px] text-[15px] font-bold md:text-base">{displayName(product)}</span>
        <span className="text-[13px] leading-snug text-muted-foreground md:text-sm">
          {describe(product, v)}
          {p.width !== null ? (
            <>
              {describe(product, v) ? '، ' : ''}
              <SizeText>{sizeText(p)}</SizeText> سم
            </>
          ) : null}
        </span>
        <Price amount={v.price} className="mt-1" />
        {product.rating ? <RatingStars average={product.rating.average} count={product.rating.count} /> : null}
        {tier ? <TierTag tier={tier} className="mt-1 self-start" /> : null}
      </Link>
      {/* A square over the photo carries the heart, half over its bottom inline-end corner. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[15/16]">
        <HeartButton product={product} className="pointer-events-auto absolute -bottom-5 end-3" />
      </div>
    </div>
  );
}
