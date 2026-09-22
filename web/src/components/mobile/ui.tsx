import type { ReactNode } from 'react';
import { ArrowLeft, Heart } from 'lucide-react';

import { cn, formatPrice } from '@/lib/utils';
import type { Product } from '@/types';

/*
 * The phone layout's building blocks - each one mirrors its twin in the iOS app
 * (brimatex-ios/src/ui/index.tsx and src/components), so a customer moving
 * between the app and the site on the same phone sees the same shop.
 */

/** White card on white: a hairline border and a faint Dark Ocean shadow (ui Card). */
export function AppCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-[20px] border border-app-border bg-white p-5 shadow-app-card', className)}>
      {children}
    </div>
  );
}

/** A section's heading, with an optional action on the other side (ui SectionHeader). */
export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xl font-bold text-app-ocean">{title}</h2>
      {action && onAction && (
        <button type="button" onClick={onAction} className="text-base text-app-text">
          {action}
        </button>
      )}
    </div>
  );
}

/** A card's own title, with an optional hint under it (ui SectionTitle). */
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[17px] font-bold text-app-ocean">{children}</h3>
      {hint && <p className="mt-0.5 text-sm text-app-muted">{hint}</p>}
    </div>
  );
}

/** Filter chip - soft tint, Dark Ocean when active (ui Chip). */
export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full px-5 py-2.5 text-base font-medium transition-colors active:scale-[0.99]',
        active ? 'bg-app-ocean text-white' : 'bg-app-tint-soft text-app-ocean'
      )}
    >
      {label}
    </button>
  );
}

/** The round Dark Ocean arrow button of the app's promo cards (ui ArrowButton). */
export function ArrowButton({ label, size = 44, onClick }: { label: string; size?: number; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-label': label } : { 'aria-hidden': true })}
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-app-ocean text-white"
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </Tag>
  );
}

/** The white round heart laid over a product picture (components/HeartButton). */
export function HeartButton({
  saved,
  disabled,
  size = 36,
  onClick,
  className,
}: {
  saved: boolean;
  disabled?: boolean;
  size?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // It sits inside a tappable card - saving must not also open the product.
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-pressed={saved}
      aria-label={saved ? 'إزالة من المفضلة' : 'أضف للمفضلة'}
      style={{ width: size, height: size }}
      className={cn('grid place-items-center rounded-full bg-white shadow-app-card', className)}
    >
      <Heart
        style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }}
        className={saved ? 'fill-app-ocean text-app-ocean' : 'text-app-muted'}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The product picture, or - when the product has none, as most do today - the
 * name's first letter on Nebula, instead of a dead grey box (as in the app).
 */
export function ProductImage({ product, letterSize = 64, className }: { product: Product; letterSize?: number; className?: string }) {
  return (
    <div className={cn('grid place-items-center overflow-hidden bg-app-nebula', className)}>
      {product.image ? (
        <img src={product.image} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden="true" style={{ fontSize: letterSize }} className="font-bold leading-none text-app-porcelain">
          {product.name.trim().charAt(0)}
        </span>
      )}
    </div>
  );
}

/** Lowest price across a product's sizes - what "from" means on a card. */
export function priceFrom(product: Product): number {
  return product.variants?.length ? Math.min(...product.variants.map((v) => v.price)) : product.price;
}

/** Status pill (ui Pill). */
export function Pill({ tone, children }: { tone: 'success' | 'danger'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold',
        tone === 'success' ? 'bg-app-success-bg text-app-success' : 'bg-red-50 text-app-danger'
      )}
    >
      <span className={cn('size-[7px] rounded-full', tone === 'success' ? 'bg-app-success' : 'bg-app-danger')} />
      {children}
    </span>
  );
}

/** The catalogue card (components/ProductCard): the whole card opens the product. */
export function MobileProductCard({
  product,
  saved,
  wishlistPending,
  onOpen,
  onToggleWishlist,
}: {
  product: Product;
  saved: boolean;
  wishlistPending: boolean;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
}) {
  const hasSizes = Boolean(product.variants?.length);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(product)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(product))}
      aria-label={`${product.name}، ${formatPrice(priceFrom(product))} د.ل`}
      className="mb-4 cursor-pointer overflow-hidden rounded-[20px] border border-app-border bg-white shadow-app-card transition-transform active:scale-[0.995] active:opacity-90"
    >
      <div className="relative">
        <ProductImage product={product} className="aspect-[4/3]" />
        {product.inStock === false && (
          <span className="absolute top-3 start-3 rounded-full bg-app-danger px-3 py-1 text-xs font-bold text-white">
            نفد المخزون
          </span>
        )}
        <HeartButton
          saved={saved}
          disabled={wishlistPending}
          onClick={() => onToggleWishlist(product)}
          className="absolute top-3 end-3"
        />
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-base font-semibold leading-6 text-app-text">{product.name}</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-xl font-bold text-app-ocean">{formatPrice(priceFrom(product))} د.ل</span>
          {hasSizes && <span className="text-sm text-app-muted">يبدأ من</span>}
        </p>
        <p className="mt-1 text-xs text-app-muted">ادفع عند الاستلام · جرّبها 30 ليلة</p>
      </div>
    </div>
  );
}

/** The small card of a sideways row - "new arrivals", "you may like" (components/NewItemCard). */
export function NewItemCard({ product, onOpen }: { product: Product; onOpen: (product: Product) => void }) {
  return (
    <button type="button" onClick={() => onOpen(product)} className="w-[150px] shrink-0 text-start">
      <span className="block rounded-[20px] bg-white p-2 shadow-app-raised">
        <ProductImage product={product} letterSize={44} className="aspect-square rounded-[14px]" />
      </span>
      <span className="mt-3 line-clamp-2 block min-h-10 text-sm leading-5 text-app-text">{product.name}</span>
      <span className="mt-0.5 block text-[17px] font-bold text-app-text">{formatPrice(priceFrom(product))} د.ل</span>
    </button>
  );
}
