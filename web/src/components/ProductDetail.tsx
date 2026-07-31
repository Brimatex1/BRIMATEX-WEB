import { ArrowRight, BadgeCheck, Check, Heart, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';
import type { Category, Product } from '@/types';

const CATEGORY_LABEL: Record<Category, string> = {
  mattress: 'مرتبة',
  pillow: 'وسادة',
  bedding: 'مفروشات',
};

interface ProductDetailProps {
  product: Product;
  justAdded: boolean;
  saved: boolean;
  wishlistPending: boolean;
  onAdd: (product: Product) => void;
  onBack: () => void;
  onToggleWishlist: (product: Product) => void;
}

export function ProductDetail({
  product,
  justAdded,
  saved,
  wishlistPending,
  onAdd,
  onBack,
  onToggleWishlist,
}: ProductDetailProps) {
  const { specs, size, features } = product;

  const specRows: { label: string; value: string }[] = [];
  if (specs?.material) specRows.push({ label: 'الخامة', value: specs.material });
  if (specs?.firmness) specRows.push({ label: 'درجة الصلابة', value: specs.firmness });
  if (specs?.coverFabric) specRows.push({ label: 'القماش الخارجي', value: specs.coverFabric });
  if (size?.label) specRows.push({ label: 'المقاس', value: size.label });
  if (size?.height) specRows.push({ label: 'السماكة', value: `${size.height} سم` });
  if (product.sku) specRows.push({ label: 'رقم المنتج', value: product.sku });

  return (
    <section className="container max-w-4xl animate-fade-up">
      <div className="pt-8">
        <Button variant="ghost" onClick={onBack} className="mb-4 px-2">
          <ArrowRight aria-hidden="true" />
          رجوع للمتجر
        </Button>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {product.category && (
              <Badge variant="secondary">{CATEGORY_LABEL[product.category]}</Badge>
            )}
            {product.inStock === false ? (
              <Badge variant="outline" className="text-destructive">
                غير متوفر حالياً
              </Badge>
            ) : (
              <Badge variant="success">متوفر</Badge>
            )}
          </div>

          <h1 className="font-heading text-3xl font-semibold leading-tight text-primary sm:text-4xl">
            {product.name}
          </h1>

          {product.tagline && <p className="mt-2 text-accent">{product.tagline}</p>}

          {product.description && (
            <p className="mt-5 leading-relaxed text-muted-foreground">{product.description}</p>
          )}

          {features && features.length > 0 && (
            <>
              <h2 className="mt-8 mb-3 font-heading text-xl font-semibold text-primary">
                المميزات
              </h2>
              <ul className="space-y-2">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {specRows.length > 0 && (
            <>
              <h2 className="mt-8 mb-3 font-heading text-xl font-semibold text-primary">
                المواصفات
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {specRows.map((row) => (
                      <tr key={row.label} className="border-b">
                        <th
                          scope="row"
                          className="w-40 py-3 pe-4 text-start font-medium text-muted-foreground"
                        >
                          {row.label}
                        </th>
                        <td className="py-3">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div>
          <Card className="md:sticky md:top-24">
            <CardHeader>
              <CardTitle>
                <span className="font-heading text-4xl font-semibold tabular text-primary">
                  {formatPrice(product.price)}
                </span>
                <span className="ms-1 text-sm font-normal text-muted-foreground">ر.س</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={() => onAdd(product)}
                disabled={justAdded || product.inStock === false}
              >
                {justAdded ? (
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

              <ul className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  ضمان {specs?.warrantyYears ?? 12} سنة
                </li>
                {(specs?.trialNights ?? 0) > 0 && (
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    تجربة {specs?.trialNights} ليلة
                  </li>
                )}
                <li className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  توصيل مجاني · الدفع عند الاستلام
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="pb-12" />
    </section>
  );
}
