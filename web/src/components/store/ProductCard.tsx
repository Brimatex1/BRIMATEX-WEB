import type { MouseEvent } from 'react';
import { Heart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';
import type { Product } from '@/types';

/** The lowest price a product sells at - what "يبدأ من" means. */
export function priceFrom(product: Product): number {
  return product.variants?.length ? Math.min(...product.variants.map((v) => v.price)) : product.price;
}

/** The card a cart line or an order line belongs to - a line holds the size's id. */
export function findProduct(products: Product[], id: number): Product | undefined {
  return products.find((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id));
}

/**
 * A real link to a product page - Google follows <a href>, not buttons - that
 * still opens the product inside the app on a plain click. Ctrl/Cmd/middle
 * click and long-press keep the browser's own "open in a new tab".
 */
export function productLinkClick(e: MouseEvent<HTMLAnchorElement>, open: () => void) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open();
}

/** The photo uploaded from the dashboard, or the name's first letter on a quiet surface. */
export function ProductImage({ product, className }: { product: Product; className?: string }) {
  return (
    <div className={cn('grid place-items-center overflow-hidden bg-muted', className)}>
      {product.image ? (
        <img
          src={product.image}
          alt={product.tier ? `${product.name}، مرتبة ${product.tier.name}` : product.name}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span aria-hidden="true" className="text-5xl font-bold text-primary/15">
          {product.name.trim().charAt(0)}
        </span>
      )}
    </div>
  );
}

export function TierBadge({ product, className }: { product: Product; className?: string }) {
  if (!product.tier) return null;
  return (
    <Badge variant="secondary" className={cn('font-medium', className)}>
      {product.tier.name}
    </Badge>
  );
}

export function WishlistButton({
  saved,
  disabled,
  onClick,
  className,
}: {
  saved: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={saved}
      aria-label={saved ? 'إزالة من المفضلة' : 'أضف للمفضلة'}
      className={cn(
        'grid size-9 place-items-center rounded-full bg-background/90 shadow-sm ring-1 ring-border backdrop-blur transition-colors hover:bg-background disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <Heart className={cn('size-[18px]', saved ? 'fill-destructive text-destructive' : 'text-foreground')} aria-hidden="true" />
    </button>
  );
}

/**
 * A product in a grid: photo, tier, name and price. The whole card is the
 * product's link - its name is an <a> whose ::after covers the card - with the
 * heart raised above it.
 */
export function ProductCard({
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
  const hasSizes = Boolean(product.variants && product.variants.length > 1);
  const out = product.inStock === false;
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative">
        <ProductImage product={product} className="aspect-square transition-transform duration-300 group-hover:scale-[1.02]" />
        {out && (
          <Badge variant="secondary" className="absolute start-3 top-3 bg-background/90 text-foreground">
            نفد المخزون
          </Badge>
        )}
        <WishlistButton
          saved={saved}
          disabled={wishlistPending}
          onClick={() => onToggleWishlist(product)}
          className="absolute end-3 top-3 z-10"
        />
      </div>
      <div className="space-y-2 p-4">
        <TierBadge product={product} />
        <a
          href={`/product/${product.id}`}
          onClick={(e) => productLinkClick(e, () => onOpen(product))}
          className="line-clamp-2 block font-semibold leading-6 text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {product.name}
        </a>
        <p className="flex items-baseline gap-1.5">
          {hasSizes && <span className="text-xs text-muted-foreground">يبدأ من</span>}
          <span className="text-lg font-bold text-primary">{formatPrice(priceFrom(product))} د.ل</span>
        </p>
      </div>
    </Card>
  );
}

/** A grid's placeholder while the catalogue loads. */
export function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="space-y-2 p-4">
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </Card>
  );
}
