import { BadgeCheck, Heart } from 'lucide-react';

import { FeatureIcons } from '@/components/FeatureIcons';
import { ProductVisual } from '@/components/ProductVisual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatPrice, isComingSoon } from '@/lib/utils';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  justAdded: boolean;
  saved: boolean;
  wishlistPending: boolean;
  onAdd: (product: Product) => void;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
}

export function ProductCard({
  product,
  justAdded,
  saved,
  wishlistPending,
  onAdd,
  onOpen,
  onToggleWishlist,
}: ProductCardProps) {
  const comingSoon = isComingSoon(product.category);
  // More than one size/height means "add to cart" is ambiguous from a card —
  // send the customer to the product page to pick one first.
  const hasVariants = (product.variants?.length ?? 0) > 1;

  // Phones show cards two to a row (max-sm): the name, the price and one
  // button - the description, badges and feature icons wait on the product
  // page, one tap away.
  return (
    <Card
      className={cn(
        'group/card flex flex-col overflow-hidden',
        'motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-300',
        'hover:border-accent/45 hover:shadow-xl motion-safe:hover:-translate-y-1'
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(product)}
        aria-label={`عرض تفاصيل ${product.name}`}
        className="overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ProductVisual
          product={product}
          className="rounded-none motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover/card:scale-[1.04]"
        />
      </button>

      <CardHeader className="max-sm:space-y-1 max-sm:p-3">
        <div className="flex items-start justify-between gap-1 sm:gap-3">
          <CardTitle className="text-sm leading-snug sm:text-xl">
            <button
              type="button"
              onClick={() => onOpen(product)}
              className="text-start hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {product.name}
            </button>
          </CardTitle>

          <Button
            variant="ghost"
            size="icon"
            className={cn('shrink-0 max-sm:-me-1.5 max-sm:-mt-1.5 max-sm:size-9', saved && 'text-destructive')}
            onClick={() => onToggleWishlist(product)}
            disabled={wishlistPending}
            aria-pressed={saved}
            aria-label={saved ? `إزالة ${product.name} من المفضلة` : `إضافة ${product.name} للمفضلة`}
          >
            <Heart className={cn(saved && 'fill-current')} aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-sm:hidden">
          {product.sku && (
            <Badge variant="secondary" className="w-fit tabular">
              {product.sku}
            </Badge>
          )}
          {comingSoon && <Badge variant="outline">قريباً</Badge>}
        </div>
      </CardHeader>

      <CardContent className="flex-1 max-sm:px-3 max-sm:pb-3">
        <p className="text-sm text-muted-foreground max-sm:hidden">
          {product.tagline ?? product.description ?? 'جودة عالية · خامات مختارة بعناية'}
        </p>

        {hasVariants ? (
          <p className="mt-2 text-xs text-muted-foreground">{product.variants!.length} مقاسات متاحة</p>
        ) : (
          product.size?.label && (
            <p className="mt-2 text-xs text-muted-foreground">المقاس: {product.size.label}</p>
          )
        )}

        <FeatureIcons keys={product.iconFeatures} compact className="mt-3 max-sm:hidden" />

        <p className="mt-2 sm:mt-4">
          <span className="font-heading text-xl font-semibold tabular text-primary sm:text-3xl">
            {formatPrice(product.price)}
          </span>
          <span className="ms-1 text-sm text-muted-foreground">د.ل</span>
        </p>
        <p className="mt-2 text-xs text-success max-sm:hidden">بدون تسجيل · ادفع عند الاستلام</p>
      </CardContent>

      <CardFooter className="flex-col gap-2 max-sm:p-3 max-sm:pt-0">
        {hasVariants ? (
          <Button className="w-full max-sm:h-10 max-sm:px-2 max-sm:text-sm" onClick={() => onOpen(product)}>
            اختر المقاس
          </Button>
        ) : (
          <>
            <Button
              className="w-full max-sm:h-10 max-sm:px-2 max-sm:text-sm"
              onClick={() => onAdd(product)}
              disabled={justAdded || comingSoon}
            >
              {comingSoon ? (
                'قريباً'
              ) : justAdded ? (
                <>
                  <BadgeCheck aria-hidden="true" />
                  تمت الإضافة
                </>
              ) : (
                'إضافة للسلة'
              )}
            </Button>
            {/* On phones the picture and the name open the product already */}
            <Button variant="outline" className="w-full max-sm:hidden" onClick={() => onOpen(product)}>
              التفاصيل
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
