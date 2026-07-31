import { BadgeCheck, Heart } from 'lucide-react';

import { ProductVisual } from '@/components/ProductVisual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';
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
  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:border-accent/45 hover:shadow-xl">
      <button
        type="button"
        onClick={() => onOpen(product)}
        aria-label={`عرض تفاصيل ${product.name}`}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ProductVisual product={product} className="rounded-none" />
      </button>

      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl">
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
            className={cn('shrink-0', saved && 'text-destructive')}
            onClick={() => onToggleWishlist(product)}
            disabled={wishlistPending}
            aria-pressed={saved}
            aria-label={saved ? `إزالة ${product.name} من المفضلة` : `إضافة ${product.name} للمفضلة`}
          >
            <Heart className={cn(saved && 'fill-current')} aria-hidden="true" />
          </Button>
        </div>

        {product.sku && (
          <Badge variant="secondary" className="w-fit tabular">
            {product.sku}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground">
          {product.tagline ?? product.description ?? 'جودة عالية · خامات مختارة بعناية'}
        </p>

        {product.size?.label && (
          <p className="mt-2 text-xs text-muted-foreground">المقاس: {product.size.label}</p>
        )}

        <p className="mt-4">
          <span className="font-heading text-3xl font-semibold tabular text-primary">
            {formatPrice(product.price)}
          </span>
          <span className="ms-1 text-sm text-muted-foreground">ر.س</span>
        </p>
        <p className="mt-2 text-xs text-success">بدون تسجيل · ادفع عند الاستلام</p>
      </CardContent>

      <CardFooter className="flex-col gap-2">
        <Button className="w-full" onClick={() => onAdd(product)} disabled={justAdded}>
          {justAdded ? (
            <>
              <BadgeCheck aria-hidden="true" />
              تمت الإضافة
            </>
          ) : (
            'إضافة للسلة'
          )}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onOpen(product)}>
          التفاصيل
        </Button>
      </CardFooter>
    </Card>
  );
}
