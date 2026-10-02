import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CreditCard, ShieldCheck, ShoppingBasket, Store, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { trackViewContent } from '@/lib/pixel';
import { cn } from '@/lib/utils';
import type { Product, ProductReviews, ProductVariant } from '@/types';

import { TIER_TITLE, availabilityOf, availabilityText, availabilityTone, canOrderVariant, describe, displayName, featuredVariant, parseSize, sizeText, tierOf, variantFromQuery, variantsOf } from '../catalog';
import { Features } from '../Features';
import { useIsDesktop, useTitle } from '../hooks';
import { HeartButton, photoOf, ProductCard } from '../ProductCard';
import { Link, useRouter } from '../router';
import { recordViewed } from '../recent';
import { SizePicker } from '../SizePicker';
import { useShop } from '../state';
import { Container, EmptyState, Price, RatingStars, Skeleton, SizeText, StatusDot, TierTag } from '../ui';
import { Breadcrumb } from './CategoryPage';

/** The cutaway's layer colours, top to bottom (handoff WebProduct «ماذا بداخلها؟»). */
const LAYER_COLOURS = ['bg-paper border border-border', 'bg-nebula', 'bg-porcelain', 'bg-blue-violet', 'bg-dark-ocean', 'bg-image-bg border border-border'];

function warrantyText(years: number | null | undefined): string | null {
  if (!years) return null;
  if (years === 1) return 'ضمان سنة';
  if (years === 2) return 'ضمان سنتين';
  return years <= 10 ? `ضمان ${years} سنوات` : `ضمان ${years} سنة`;
}

/** On phones a section folds into a row; on desktop it is always open. */
function Fold({ title, summary, children, desktop }: { title: string; summary?: React.ReactNode; children: React.ReactNode; desktop: boolean }) {
  if (desktop) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-[21px] font-bold lg:text-[26px]">{title}</h2>
        {children}
      </section>
    );
  }
  return (
    <details className="group border-b border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 [&::-webkit-details-marker]:hidden">
        <span className="text-base font-bold">{title}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {summary}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

function Gallery({ product }: { product: Product }) {
  // The photo from the dashboard, and the cutaway when there is one - no empty placeholders.
  const photos = [photoOf(product), ...(product.layersImage ? [product.layersImage] : [])];
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative -mx-4 lg:mx-0">
        {/* Phones: swipe; desktop: the chosen one. */}
        <div
          ref={strip}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] lg:block lg:overflow-visible"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
          }}
        >
          {photos.map((src, i) => (
            <div key={src} className={cn('aspect-square w-full shrink-0 snap-center bg-image-bg lg:aspect-[4/3.4]', i !== index && 'lg:hidden', i === 1 && 'bg-white')}>
              <img src={src} alt={i === 0 ? `مرتبة ${displayName(product)}` : `طبقات مرتبة ${displayName(product)}`} className={cn('size-full animate-fade-up motion-reduce:animate-none', i === 1 ? 'object-contain' : 'object-cover')} />
            </div>
          ))}
        </div>
        <HeartButton product={product} className="absolute end-4 top-4" />
        {photos.length > 1 ? (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
            {photos.map((src, i) => (
              <span key={src} className={cn('size-2 rounded-full', i === index ? 'bg-foreground' : 'bg-foreground/30')} />
            ))}
          </div>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="hidden grid-cols-4 gap-3 lg:grid">
          {photos.map((src, i) => (
            <button key={src} type="button" onClick={() => setIndex(i)} aria-label={i === 0 ? 'الصورة الرئيسية' : 'صورة الطبقات'} aria-pressed={i === index} className={cn('aspect-square overflow-hidden bg-image-bg', i === index ? 'ring-2 ring-foreground' : 'hover:opacity-80')}>
              <img src={src} alt="" className={cn('size-full', i === 1 ? 'bg-white object-contain' : 'object-cover')} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SizeGuide({ product, open, onOpenChange }: { product: Product; open: boolean; onOpenChange: (o: boolean) => void }) {
  const sizes = [...new Set(variantsOf(product).map((v) => sizeText(parseSize(v))).filter(Boolean))];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>دليل المقاسات</DialogTitle>
          <DialogDescription>المقاس هو العرض × الطول بالسنتيمتر. قِس قاعدة السرير من الداخل واختر المقاس المطابق لها.</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-3 gap-2">
          {sizes.map((s) => (
            <li key={s} className="rounded-lg border border-border py-2 text-center font-bold tabular-nums">
              <SizeText>{s}</SizeText>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function MethodCard({ selected, onSelect, icon, title, sub }: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; sub: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={cn('flex items-center gap-3 p-4 text-start transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected ? 'relative z-10 rounded-lg outline outline-2 outline-foreground' : '')}>
      <span className={cn('grid size-[22px] shrink-0 place-items-center rounded-full border-2', selected ? 'border-foreground' : 'border-input')} aria-hidden>
        {selected ? <span className="size-[9px] rounded-full bg-foreground" /> : null}
      </span>
      <span className="text-brand-text [&_svg]:size-[22px]" aria-hidden>
        {icon}
      </span>
      <span className="flex flex-col">
        <b className="text-[15px]">{title}</b>
        <span className="text-[13px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

function ReviewsSummary({ product }: { product: Product }) {
  const [data, setData] = useState<ProductReviews | null>(null);
  useEffect(() => {
    api.getProductReviews(product.id).then(setData).catch(() => setData({ count: 0, average: null, reviews: [] }));
  }, [product.id]);
  if (!data) return <Skeleton className="h-40" />;
  const max = Math.max(1, ...Object.values(data.distribution ?? {}));
  const latest = [...data.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2);
  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-3">
        {data.count ? (
          <>
            <div className="flex items-center gap-3">
              <b className="text-[34px] tabular-nums">{data.average?.toFixed(1)}</b>
              <RatingStars average={data.average ?? 0} count={data.count} />
            </div>
            {[5, 4, 3, 2, 1].map((n) => {
              const c = data.distribution?.[String(n) as '5'] ?? 0;
              return (
                <div key={n} className="flex items-center gap-3 text-[13px]" aria-label={`${n} نجوم: ${c}`}>
                  <span className="w-12 text-muted-foreground">{n} نجوم</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-image-bg">
                    <span className="block h-full rounded-full bg-foreground" style={{ width: `${(c / max) * 100}%` }} />
                  </span>
                  <span className="w-6 text-end tabular-nums text-muted-foreground">{c}</span>
                </div>
              );
            })}
          </>
        ) : (
          <p className="text-[15px] text-muted-foreground">لا توجد تقييمات بعد. يمكن لمن اشترى هذه المرتبة تقييمها بعد استلامها.</p>
        )}
        <Button asChild variant="outline" size="store" className="mt-2 self-start">
          <Link to={{ name: 'reviewWrite', productId: product.id, orderName: null }}>اكتب تقييماً</Link>
        </Button>
        <span className="text-[13px] text-muted-foreground">يكتب التقييم من اشترى المرتبة فقط، وننشره بعد المراجعة.</span>
      </div>
      {latest.length ? (
        <div className="flex flex-col">
          {latest.map((r) => (
            <article key={r.id} className="flex flex-col gap-1.5 border-b border-border py-4 first:pt-0">
              <span className="flex items-center gap-2">
                <RatingStars average={r.rating} count={0} className="[&>span:last-child]:hidden" />
                <span className="text-xs text-text-tertiary">{new Date(r.createdAt).toLocaleDateString('ar-LY', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </span>
              {r.title ? <b className="text-[15px]">{r.title}</b> : null}
              <p className="text-[15px] leading-relaxed">{r.comment}</p>
              <span className="text-[13px]">
                <b>{r.name}</b> <span className="text-success">· مشترٍ مؤكَّد</span>
              </span>
            </article>
          ))}
          <Link to={{ name: 'reviews', productId: product.id }} className="mt-4 self-start text-[15px] font-bold underline underline-offset-4">
            كل التقييمات
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/**
 * المرتبة (handoff WebProduct, WebProductComfort; phones MProduct): gallery,
 * the info column (sticky on desktop) with the size, delivery or pickup and
 * «أضف إلى السلة», then what is inside, the warranty, reviews and others.
 * The size is in the address (?size=180x200&height=24).
 */
export function ProductPage({ id }: { id: number }) {
  const shop = useShop();
  const { location, setQuery, go } = useRouter();
  const desktop = useIsDesktop();
  const product = shop.find(id);
  const [guide, setGuide] = useState(false);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<number>();
  const mainButton = useRef<HTMLDivElement>(null);
  const [mainVisible, setMainVisible] = useState(true);

  const variant: ProductVariant | null = useMemo(() => {
    if (!product) return null;
    // An id that is a size (from an ad or the Meta catalogue) opens on that size.
    return variantFromQuery(product, location.search) ?? variantsOf(product).find((v) => v.id === id && v.id !== product.id) ?? featuredVariant(product);
  }, [product, location.search, id]);

  useTitle(product ? displayName(product) : null);

  // ViewContent once the catalogue has the product - a visitor from an ad counts too.
  useEffect(() => {
    if (!product) return;
    trackViewContent(product);
    recordViewed(product.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // The phone's bottom bar comes up when the main button scrolls away.
  useEffect(() => {
    const el = mainButton.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setMainVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [product?.id]);

  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

  if (!product || !variant) {
    if (shop.loading) {
      return (
        <Container className="grid gap-10 py-8 lg:grid-cols-[1.25fr_1fr]">
          <Skeleton className="aspect-square" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-40" />
          </div>
        </Container>
      );
    }
    return (
      <Container>
        <EmptyState icon={<ShoppingBasket />} title="المرتبة غير موجودة" body="ربما لم تعد معروضة. تصفّح مراتبنا الأخرى." action="كل المراتب" onAction={() => go({ name: 'category', tier: null })} />
      </Container>
    );
  }

  const tier = tierOf(product);
  const size = parseSize(variant);
  const availability = availabilityOf(variant);
  const orderable = canOrderVariant(variant);
  const warranty = warrantyText(product.warrantyYears);
  const related = [...shop.products.filter((p) => p.id !== product.id && tierOf(p) === tier), ...shop.products.filter((p) => p.id !== product.id && tierOf(p) !== tier)].slice(0, 4);
  const pickup = shop.method === 'pickup';

  function choose(v: ProductVariant) {
    const p = parseSize(v);
    setQuery({ size: p.width !== null ? `${p.width}x${p.length}` : null, height: p.height !== null && variantsOf(product!).some((o) => parseSize(o).height !== p.height) ? String(p.height) : null });
  }

  function add() {
    if (!orderable) return;
    shop.addToCart(product!, variant!);
    setAdded(true);
    window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setAdded(false), 1500);
  }

  const addButton = (
    <Button size="xl" className="w-full" onClick={add} disabled={!orderable}>
      {added ? <Check /> : <ShoppingBasket />}
      {!orderable ? 'نفد هذا المقاس' : added ? 'أُضيفت إلى السلة' : 'أضف إلى السلة'}
    </Button>
  );

  return (
    <>
      <Container className="pb-24 lg:pb-16">
        <Breadcrumb items={[{ label: 'المراتب', to: { name: 'category', tier: null } }, ...(tier ? [{ label: TIER_TITLE[tier], to: { name: 'category' as const, tier } }] : []), { label: displayName(product) }]} />

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
          <Gallery product={product} />

          <div className="flex flex-col gap-5 lg:sticky lg:top-40 lg:self-start">
            <div className="flex flex-col gap-2">
              {tier ? <TierTag tier={tier} className="self-start" /> : null}
              <h1 className="font-display text-[28px] font-bold leading-tight lg:text-[40px]">{displayName(product)}</h1>
              <p className="text-[15px] text-muted-foreground lg:text-base">{describe(product, variant)}</p>
              {product.rating ? (
                <Link to={{ name: 'reviews', productId: product.id }} className="self-start hover:underline">
                  <RatingStars average={product.rating.average} count={product.rating.count} />
                </Link>
              ) : null}
              {/* A new size's price comes in from below (design/docs/MOTION.md «Change size»). */}
              <span aria-live="polite" className="mt-2 overflow-hidden">
                <Price key={variant.price} amount={variant.price} size="page" className="animate-fade-up motion-reduce:animate-none" />
              </span>
              <StatusDot tone={availabilityTone(availability)}>{availabilityText(availability, product.leadDays)}</StatusDot>
            </div>

            <div className="flex flex-col gap-2">
              <SizePicker product={product} value={variant} onChange={choose} />
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {variantsOf(product).length > 1 ? (
                  <button type="button" className="text-sm font-bold text-brand-text underline underline-offset-4" onClick={() => setGuide(true)}>
                    دليل المقاسات
                  </button>
                ) : null}
                <Link to={`/compare?ids=${product.id}`} className="text-sm font-bold text-brand-text underline underline-offset-4">
                  قارن مع مراتب أخرى
                </Link>
              </div>
            </div>

            <div role="radiogroup" aria-label="طريقة الاستلام" className="flex flex-col divide-y divide-border rounded-lg border border-border">
              <MethodCard
                selected={!pickup}
                onSelect={() => shop.setMethod('home')}
                icon={<Truck />}
                title="توصيل إلى المنزل"
                sub={
                  <>
                    <span className="text-success">● متوفّر</span> · {shop.city ?? 'اختر مدينتك'}
                  </>
                }
              />
              <MethodCard selected={pickup} onSelect={() => shop.setMethod('pickup')} icon={<Store />} title="استلام من الصالة" sub="معروضة للتجربة · حي الأندلس" />
            </div>

            <div ref={mainButton}>{addButton}</div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {warranty ? (
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-brand-text" strokeWidth={1.8} aria-hidden />
                  {warranty}
                </span>
              ) : null}
              <span className="flex items-center gap-2">
                <CreditCard className="size-5 text-brand-text" strokeWidth={1.8} aria-hidden />
                الدفع عند الاستلام
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-0 lg:mt-16 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
          <div className="flex flex-col gap-0 lg:gap-12">
            {product.featureIcons?.length ? (
              <Fold title="المميزات" desktop={desktop}>
                <Features names={product.featureIcons} />
              </Fold>
            ) : null}
            {product.layers?.length ? (
              <Fold title="ماذا بداخلها؟" summary={`${product.layers.length} طبقات`} desktop={desktop}>
                <span className="-mt-2 text-sm text-muted-foreground">الطبقات من الأعلى إلى الأسفل</span>
                <ol className="mt-3 flex flex-col gap-2.5">
                  {product.layers.map((layer, i) => (
                    <li key={i} className="flex items-center gap-3 text-[15px]">
                      <span className={cn('h-3 w-14 shrink-0', LAYER_COLOURS[i % LAYER_COLOURS.length])} aria-hidden />
                      {layer}
                    </li>
                  ))}
                </ol>
              </Fold>
            ) : null}
          </div>
          <Fold title="مع بريماتكس" summary={warranty ?? undefined} desktop={desktop}>
            <div className="flex flex-col gap-5">
              {warranty ? (
                <div className="flex items-start gap-3">
                  <ShieldCheck className="size-6 shrink-0 text-brand-text" strokeWidth={1.8} aria-hidden />
                  <div>
                    <b>{warranty.replace('ضمان', 'مضمونة')}</b>
                    <p className="text-sm text-muted-foreground">سجّل الضمان من حسابك بعد الاستلام.</p>
                  </div>
                </div>
              ) : null}
              <div className="flex items-start gap-3">
                <Truck className="size-6 shrink-0 text-brand-text" strokeWidth={1.8} aria-hidden />
                <div>
                  <b>من مصنعنا إلى منزلك</b>
                  <p className="text-sm text-muted-foreground">يتصل بك السائق قبل الوصول.</p>
                </div>
              </div>
            </div>
          </Fold>
        </div>

        <div className="mt-0 lg:mt-16">
          <Fold title="التقييمات" summary={product.rating ? `${product.rating.average.toFixed(1)} (${product.rating.count})` : undefined} desktop={desktop}>
            <ReviewsSummary product={product} />
          </Fold>
        </div>

        {related.length ? (
          <section className="mt-12 lg:mt-16">
            <h2 className="mb-5 text-[21px] font-bold lg:text-[28px]">قد تعجبك أيضاً</h2>
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ) : null}
      </Container>

      {/* Size, price and the button once the main one has scrolled away - phones and desktop (MOTION.md «Sticky buy bar»). */}
      <div className={cn('fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[max(12px,env(safe-area-inset-bottom))] pt-3 transition-transform duration-base ease-out-strong', mainVisible ? 'translate-y-full' : 'translate-y-0')} aria-hidden={mainVisible}>
        <Container className="flex items-center gap-3 lg:gap-6">
          <div className="hidden min-w-0 flex-1 items-center gap-4 lg:flex">
            <img src={photoOf(product)} alt="" className="size-12 bg-image-bg object-cover" />
            <b className="truncate text-base">{displayName(product)}</b>
          </div>
          <div className="flex flex-col">
            {size.width !== null ? (
              <span className="text-xs text-muted-foreground">
                <SizeText>{sizeText(size)}</SizeText> سم{size.height ? ` · ارتفاع ${size.height} سم` : ''}
              </span>
            ) : null}
            <Price amount={variant.price} size="row" />
          </div>
          <Button size="store" className="flex-1 lg:w-72 lg:flex-none" onClick={add} disabled={!orderable} tabIndex={mainVisible ? -1 : 0}>
            {added ? 'أُضيفت إلى السلة' : 'أضف إلى السلة'}
          </Button>
        </Container>
      </div>

      <SizeGuide product={product} open={guide} onOpenChange={setGuide} />
    </>
  );
}
