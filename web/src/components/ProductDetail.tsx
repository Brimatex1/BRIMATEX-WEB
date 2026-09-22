import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, Heart, Moon, Truck, Wallet } from 'lucide-react';

import { FeatureIcons } from '@/components/FeatureIcons';
import { ProductVisual } from '@/components/ProductVisual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatPrice, isComingSoon } from '@/lib/utils';
import type { Category, Product } from '@/types';

const CATEGORY_LABEL: Record<Category, string> = {
  mattress: 'مرتبة',
  pillow: 'وسادة',
  bedding: 'مفروشات',
};

interface ProductDetailProps {
  product: Product;
  related: Product[];
  /** Compared against the picked variant, not just the product — see justAdded below. */
  justAddedId: number | null;
  saved: boolean;
  wishlistPending: boolean;
  onAdd: (product: Product) => void;
  onBack: () => void;
  onToggleWishlist: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
}

export function ProductDetail({
  product,
  related,
  justAddedId,
  saved,
  wishlistPending,
  onAdd,
  onBack,
  onToggleWishlist,
  onOpenProduct,
}: ProductDetailProps) {
  const { specs, size } = product;
  const firmness = specs?.firmnessLevel;
  const comingSoon = isComingSoon(product.category);

  // A product with size/height options carries them in `variants` (see
  // src/lib/odoo.js) — this is the customer's picked one, defaulting to the
  // first. Re-picked whenever a different product is opened.
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants?.[0]?.id ?? product.id);
  useEffect(() => {
    setSelectedVariantId(product.variants?.[0]?.id ?? product.id);
  }, [product.id, product.variants]);

  const justAdded = justAddedId === selectedVariantId;

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId);
  const effectivePrice = selectedVariant?.price ?? product.price;
  const effectiveInStock = selectedVariant ? selectedVariant.inStock !== false : product.inStock !== false;
  const effectiveSku = selectedVariant?.sku || product.sku;
  // What actually gets added to the cart / ordered — the template's display
  // fields (name, images, description, icons) with the chosen variant's own
  // id/price/sku/stock, since that id is what Odoo needs to price and fulfil
  // the right size.
  const cartProduct: Product = selectedVariant
    ? {
        ...product,
        id: selectedVariant.id,
        price: selectedVariant.price,
        sku: selectedVariant.sku,
        stock: selectedVariant.stock,
        inStock: selectedVariant.inStock,
      }
    : product;

  return (
    <div className="animate-fade-up">
      <div className="container pt-6">
        <Button variant="ghost" onClick={onBack} className="px-2">
          <ArrowRight aria-hidden="true" />
          رجوع
        </Button>
      </div>

      {/* ---------- Buy panel ---------- */}
      <section className="container grid gap-10 pb-14 pt-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <ProductVisual product={product} variant="hero" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <ProductVisual key={i} product={product} className="opacity-70" />
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {product.category && (
              <Badge variant="secondary">{CATEGORY_LABEL[product.category]}</Badge>
            )}
            {comingSoon ? (
              <Badge variant="outline">قريباً</Badge>
            ) : !effectiveInStock ? (
              <Badge variant="outline" className="text-destructive">غير متوفر حالياً</Badge>
            ) : (
              <Badge variant="success">متوفر</Badge>
            )}
            {effectiveSku && (
              <Badge variant="secondary" className="tabular">
                {effectiveSku}
              </Badge>
            )}
          </div>

          <h1 className="font-heading text-3xl font-semibold leading-tight text-primary sm:text-4xl">
            {product.name}
          </h1>
          {product.tagline && <p className="mt-2 text-accent">{product.tagline}</p>}

          <p className="mt-6">
            <span className="font-heading text-4xl font-semibold tabular text-primary">
              {formatPrice(effectivePrice)}
            </span>
            <span className="ms-1 text-sm text-muted-foreground">د.ل</span>
          </p>
          <p className="mt-1 text-sm text-success">توصيل مجاني · ادفع عند الاستلام</p>

          {product.variants && product.variants.length > 1 && (
            <div className="mt-6 space-y-1.5">
              <Label htmlFor="variant-select">المقاس</Label>
              <Select
                value={String(selectedVariantId)}
                onValueChange={(v) => setSelectedVariantId(Number(v))}
              >
                <SelectTrigger id="variant-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {product.variants.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)} disabled={v.inStock === false}>
                      {v.label}
                      {v.inStock === false && ' — غير متوفر'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {typeof firmness === 'number' && (
            <div className="mt-7">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-medium">الصلابة</span>
                <span className="text-muted-foreground">{specs?.firmness}</span>
              </div>
              <div
                className="relative h-2 rounded-full bg-muted"
                role="img"
                aria-label={`الصلابة ${firmness} من 10`}
              >
                {/* المؤشر ينزلق إلى موضعه بدل أن يقفز */}
                <div
                  className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-card bg-accent shadow motion-safe:transition-[inset-inline-start] motion-safe:duration-700 motion-safe:ease-out"
                  style={{ insetInlineStart: `calc(${(firmness / 10) * 100}% - 8px)` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                <span>طرية</span>
                <span>صلبة</span>
              </div>
            </div>
          )}

          <div className="mt-7 space-y-3">
            <Button
              size="lg"
              className="w-full"
              onClick={() => onAdd(cartProduct)}
              disabled={justAdded || !effectiveInStock || comingSoon}
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
            <Button
              variant="outline"
              className={cn('w-full', saved && 'text-destructive')}
              onClick={() => onToggleWishlist(product)}
              disabled={wishlistPending}
              aria-pressed={saved}
            >
              <Heart className={cn(saved && 'fill-current')} aria-hidden="true" />
              {saved ? 'في المفضلة' : 'أضف للمفضلة'}
            </Button>
          </div>

          <ul className="mt-7 grid gap-3 border-t pt-6 text-sm">
            {(specs?.trialNights ?? 0) > 0 && (
              <li className="flex items-center gap-2.5">
                <Moon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                تجربة {specs?.trialNights} ليلة في بيتك
              </li>
            )}
            <li className="flex items-center gap-2.5">
              <Truck className="size-4 shrink-0 text-accent" aria-hidden="true" />
              توصيل مجاني إلى باب المنزل
            </li>
            <li className="flex items-center gap-2.5">
              <Wallet className="size-4 shrink-0 text-accent" aria-hidden="true" />
              الدفع عند الاستلام
            </li>
          </ul>
        </div>
      </section>

      {/* ---------- Description ---------- */}
      {product.description && (
        <section className="border-y bg-secondary/30">
          <div className="container max-w-3xl py-14 text-center">
            <h2 className="font-heading text-3xl font-semibold text-primary">عن هذا المنتج</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </div>
        </section>
      )}

      {/* ---------- Icon specs ---------- */}
      {product.iconFeatures && product.iconFeatures.length > 0 && (
        <section className="border-t bg-secondary/30">
          <div className="container py-14">
            <h2 className="font-heading text-3xl font-semibold text-primary">مواصفات بارزة</h2>
            <FeatureIcons keys={product.iconFeatures} className="mt-8" />
          </div>
        </section>
      )}

      {/* ---------- Compare ---------- */}
      {related.length > 0 && (
        <section className="border-t">
          <div className="container py-14">
            <h2 className="font-heading text-3xl font-semibold text-primary">قارن مع غيرها</h2>
            <p className="mt-2 text-muted-foreground">
              موديلات أخرى من نفس الفئة بمقاسات ودرجات صلابة مختلفة.
            </p>

            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-start">
                    <th scope="col" className="py-3 pe-4 text-start font-medium text-muted-foreground">
                      المنتج
                    </th>
                    <th scope="col" className="py-3 pe-4 text-start font-medium text-muted-foreground">
                      المقاس
                    </th>
                    <th scope="col" className="py-3 pe-4 text-start font-medium text-muted-foreground">
                      الصلابة
                    </th>
                    <th scope="col" className="py-3 text-start font-medium text-muted-foreground">
                      السعر
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-accent/5">
                    <th scope="row" className="py-4 pe-4 text-start font-semibold">
                      {product.name} <span className="text-accent">(تعرضه الآن)</span>
                    </th>
                    <td className="py-4 pe-4">{selectedVariant?.label ?? size?.label ?? '—'}</td>
                    <td className="py-4 pe-4">{specs?.firmness ?? '—'}</td>
                    <td className="py-4 tabular">{formatPrice(effectivePrice)} د.ل</td>
                  </tr>
                  {related.map((other) => (
                    <tr key={other.id} className="border-b">
                      <th scope="row" className="py-4 pe-4 text-start font-medium">
                        <button
                          type="button"
                          onClick={() => onOpenProduct(other)}
                          className="text-start hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {other.name}
                        </button>
                      </th>
                      <td className="py-4 pe-4">{other.size?.label ?? '—'}</td>
                      <td className="py-4 pe-4">{other.specs?.firmness ?? '—'}</td>
                      <td className="py-4 tabular">{formatPrice(other.price)} د.ل</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
