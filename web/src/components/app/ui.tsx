import type { ReactNode } from 'react';
import { ArrowLeft, Heart, Minus, Plus, ShoppingBag, Trash2, type LucideIcon } from 'lucide-react';

import { cn, formatPrice } from '@/lib/utils';
import type { Product } from '@/types';

/*
 * The site's building blocks - each one mirrors its twin in the iOS app
 * (brimatex-ios/src/ui/index.tsx and src/components), so the website, on any
 * screen, and the app are one shop with one look.
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
  // The photo uploaded from the dashboard - Odoo's pictures are not used.
  const src = product.image || null;
  return (
    <div className={cn('grid place-items-center overflow-hidden bg-app-nebula', className)}>
      {src ? (
        // Named for image search and screen readers - "Comfort Mattress، مرتبة كومفورت".
        <img
          src={src}
          alt={product.tier ? `${product.name}، مرتبة ${product.tier.name}` : product.name}
          className="size-full object-cover"
          loading="lazy"
        />
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
export function CatalogueCard({
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
      className="cursor-pointer overflow-hidden rounded-[20px] border border-app-border bg-white shadow-app-card transition-transform active:scale-[0.995] active:opacity-90"
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
        <p className="mt-1 text-xs text-app-muted">ادفع عند الاستلام · توصيل مجاني</p>
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

/** Round icon button (ui CircleIconButton): white with a red icon for "delete", tinted for actions. */
export function CircleIconButton({
  Icon,
  label,
  tone,
  size = 44,
  onClick,
  className,
}: {
  Icon: LucideIcon;
  label: string;
  tone: 'danger' | 'light';
  size?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        tone === 'danger' ? 'bg-white text-app-danger shadow-app-card' : 'bg-app-tint-soft text-app-ocean',
        className
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

/** Quantity stepper (ui Stepper): minus, the count, plus - on the app's grey. */
export function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-app-input p-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label={`إنقاص كمية ${label}`}
        className="grid size-9 place-items-center rounded-full bg-white text-app-ocean disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-8 text-center text-base font-bold text-app-text">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={`زيادة كمية ${label}`}
        className="grid size-9 place-items-center rounded-full bg-white text-app-ocean"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Empty screen (the cart's): a large white circle with the icon, and one line under it. */
export function EmptyCircle({ Icon = ShoppingBag, text, children }: { Icon?: LucideIcon; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="grid size-[170px] place-items-center rounded-full bg-white shadow-app-raised">
        <Icon className="size-[76px] text-app-ocean" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="mt-5 text-base text-app-muted">{text}</p>
      {children}
    </div>
  );
}

/**
 * The fixed bar above the tab bar (ui StickyBar): white, hairline top border,
 * upward shadow. Larger screens have no tab bar and room to spare, so there
 * it is an ordinary card in the page.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 z-20 border-t border-app-border bg-white px-4 py-3 shadow-app-bar bottom-[calc(72px+env(safe-area-inset-bottom))] md:static md:mt-6 md:rounded-[20px] md:border md:px-5 md:py-4 md:shadow-app-card">
      {children}
    </div>
  );
}

/**
 * A product row (components/WishRow): the picture in a white frame with a round
 * delete button over it, then the name, the price, the sizes as chips, and a
 * round "add to cart".
 */
export function WishRow({
  product,
  onOpen,
  onRemove,
  onAdd,
}: {
  product: Product;
  onOpen: () => void;
  onRemove?: () => void;
  onAdd: () => void;
}) {
  const variants = product.variants ?? [];
  const chips = variants.slice(0, 2).map((v) => v.label);
  return (
    <div className="mb-5 flex gap-4">
      <div className="relative w-[130px] shrink-0 rounded-[14px] bg-white p-[5px] shadow-app-raised">
        <button type="button" onClick={onOpen} aria-label={product.name} className="block w-full">
          <ProductImage product={product} letterSize={48} className="aspect-[0.85] rounded-[10px]" />
        </button>
        {onRemove && (
          <CircleIconButton Icon={Trash2} label={`حذف ${product.name}`} tone="danger" onClick={onRemove} className="absolute bottom-3 start-3" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <button type="button" onClick={onOpen} className="text-start">
          <span className="line-clamp-2 text-base leading-6 text-app-text">{product.name}</span>
          <span className="mt-2 block text-xl font-bold text-app-text">
            {formatPrice(priceFrom(product))} د.ل
            {variants.length > 1 && <span className="text-xs font-normal text-app-muted">  يبدأ من</span>}
          </span>
        </button>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(chips.length ? chips : ['مقاس واحد']).map((c) => (
              <span key={c} className="rounded-full bg-app-tint-soft px-3 py-1.5 text-sm font-medium text-app-ocean">
                {c}
              </span>
            ))}
            {variants.length > 2 && (
              <span className="rounded-full bg-app-tint-soft px-3 py-1.5 text-sm font-medium text-app-ocean">+{variants.length - 2}</span>
            )}
          </div>
          <CircleIconButton Icon={ShoppingBag} label={variants.length ? 'اختر المقاس' : 'أضف للسلة'} tone="light" size={46} onClick={onAdd} />
        </div>
      </div>
    </div>
  );
}
