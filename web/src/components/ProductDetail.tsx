import { ArrowRight, BadgeCheck, Check, Heart, Moon, ShieldCheck, Truck, Wallet } from 'lucide-react';

import { ProductVisual } from '@/components/ProductVisual';
import { Reveal } from '@/components/Reveal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';
import type { Category, Product } from '@/types';

const CATEGORY_LABEL: Record<Category, string> = {
  mattress: 'مرتبة',
  pillow: 'وسادة',
  bedding: 'مفروشات',
};

/** Splits the material string into named layers, top-of-bed first. */
function readLayers(material?: string): string[] {
  if (!material) return [];
  return material
    .replace(/^[^:]*:\s*/, '')
    .split(/\s*[+،]\s*|\s+مع\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ProductDetailProps {
  product: Product;
  related: Product[];
  justAdded: boolean;
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
  justAdded,
  saved,
  wishlistPending,
  onAdd,
  onBack,
  onToggleWishlist,
  onOpenProduct,
}: ProductDetailProps) {
  const { specs, size, features } = product;
  const layers = readLayers(specs?.material);
  const firmness = specs?.firmnessLevel;

  const specRows: { label: string; value: string }[] = [];
  if (specs?.material) specRows.push({ label: 'الخامة', value: specs.material });
  if (specs?.firmness) specRows.push({ label: 'درجة الصلابة', value: specs.firmness });
  if (specs?.coverFabric) specRows.push({ label: 'القماش الخارجي', value: specs.coverFabric });
  if (size?.label) specRows.push({ label: 'المقاس', value: size.label });
  if (size?.height) specRows.push({ label: 'السماكة', value: `${size.height} سم` });
  if (product.sku) specRows.push({ label: 'رقم المنتج', value: product.sku });

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
            {product.inStock === false ? (
              <Badge variant="outline" className="text-destructive">غير متوفر حالياً</Badge>
            ) : (
              <Badge variant="success">متوفر</Badge>
            )}
          </div>

          <h1 className="font-heading text-3xl font-semibold leading-tight text-primary sm:text-4xl">
            {product.name}
          </h1>
          {product.tagline && <p className="mt-2 text-accent">{product.tagline}</p>}

          <p className="mt-6">
            <span className="font-heading text-4xl font-semibold tabular text-primary">
              {formatPrice(product.price)}
            </span>
            <span className="ms-1 text-sm text-muted-foreground">د.ل</span>
          </p>
          <p className="mt-1 text-sm text-success">توصيل مجاني · ادفع عند الاستلام</p>

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
          </div>

          <ul className="mt-7 grid gap-3 border-t pt-6 text-sm">
            {(specs?.trialNights ?? 0) > 0 && (
              <li className="flex items-center gap-2.5">
                <Moon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                تجربة {specs?.trialNights} ليلة في بيتك
              </li>
            )}
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
              ضمان {specs?.warrantyYears ?? 12} سنة
            </li>
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

      {/* ---------- Construction ---------- */}
      {layers.length > 0 && (
        <section className="container py-14">
          <h2 className="font-heading text-3xl font-semibold text-primary">كيف صُنعت</h2>
          <p className="mt-2 text-muted-foreground">الطبقات من الأعلى إلى القاعدة.</p>

          {/* الطبقات تظهر تباعاً من الأعلى للأسفل، كأن المرتبة تُفتح */}
          <ol className="mt-8 space-y-3">
            {layers.map((layer, i) => (
              <Reveal key={layer} delay={i * 120}>
                <li className="flex items-center gap-4 rounded-xl border p-4 motion-safe:transition-colors hover:border-accent/50 hover:bg-muted/50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 font-heading font-semibold tabular text-accent">
                    {i + 1}
                  </span>
                  <span>{layer}</span>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>
      )}

      {/* ---------- Features ---------- */}
      {features && features.length > 0 && (
        <section className="border-t">
          <div className="container py-14">
            <h2 className="font-heading text-3xl font-semibold text-primary">المميزات</h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {features.map((f, i) => (
                <Reveal key={f} delay={i * 80}>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/15">
                      <Check className="size-3.5 text-accent" aria-hidden="true" />
                    </span>
                    <span>{f}</span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- Specs ---------- */}
      {specRows.length > 0 && (
        <section className="border-t bg-secondary/30">
          <div className="container max-w-3xl py-14">
            <h2 className="font-heading text-3xl font-semibold text-primary">المواصفات</h2>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {specRows.map((row) => (
                    <tr key={row.label} className="border-b">
                      <th
                        scope="row"
                        className="w-44 py-3.5 pe-4 text-start font-medium text-muted-foreground"
                      >
                        {row.label}
                      </th>
                      <td className="py-3.5">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <td className="py-4 pe-4">{size?.label ?? '—'}</td>
                    <td className="py-4 pe-4">{specs?.firmness ?? '—'}</td>
                    <td className="py-4 tabular">{formatPrice(product.price)} د.ل</td>
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
