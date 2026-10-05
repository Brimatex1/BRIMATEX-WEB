import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { Check, ChevronDown, Search, SlidersHorizontal, Store, Tag, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { searchProducts } from '@/lib/productSearch';
import { trackSearch, trackViewCategory } from '@/lib/pixel';
import { cn } from '@/lib/utils';
import type { Product, ProductVariant } from '@/types';

import { TIER_KEYS, TIER_TITLE, displayName, featuredVariant, parseSize, sizeText, tierOf, variantsOf, type TierKey } from '../catalog';
import { useTitle } from '../hooks';
import { photoOf, ProductCard } from '../ProductCard';
import { Link, useRouter } from '../router';
import { useShop } from '../state';
import { Container, EmptyState, Skeleton, SizeText } from '../ui';

type Mode = { kind: 'tier'; tier: TierKey | null } | { kind: 'search'; query: string } | { kind: 'offers' };
type Sort = 'popular' | 'price-asc' | 'price-desc' | 'rating';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'popular', label: 'الأكثر طلباً' },
  { value: 'price-asc', label: 'السعر من الأقل' },
  { value: 'price-desc', label: 'السعر من الأعلى' },
  { value: 'rating', label: 'الأعلى تقييماً' },
];

const INTRO: Record<TierKey | 'all', string> = {
  elite: 'أعلى درجات الراحة. ديلوكس بارتفاع 30 سم، بخمسة مقاسات.',
  premium: 'نوابض وإسفنج طبي بارتفاع 28 و30 سم، بخمسة مقاسات.',
  comfort: 'كلاسيك وكومفورت ودايلي، بثلاثة ارتفاعات ومقاسات كثيرة.',
  all: 'مراتب بريماتكس بفئاتها الثلاث، من مصنعنا إلى منزلك.',
};

/** The filters in the address: ?tier=premium,elite&size=180x200&height=28&min=&max=&stock=1&sort= */
interface Filters {
  tiers: TierKey[];
  sizes: string[];
  heights: number[];
  min: number | null;
  max: number | null;
  stock: boolean;
  sort: Sort;
}

function readFilters(search: string): Filters {
  const q = new URLSearchParams(search);
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
  const num = (k: string) => (q.get(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  const sort = q.get('sort') as Sort | null;
  return {
    tiers: list('tier').filter((t): t is TierKey => (TIER_KEYS as string[]).includes(t)),
    sizes: list('size').filter((s) => /^\d{2,3}x\d{2,3}$/.test(s)),
    heights: list('height').map(Number).filter((n) => Number.isInteger(n) && n > 0),
    min: num('min'),
    max: num('max'),
    stock: q.get('stock') === '1',
    sort: sort && SORTS.some((s) => s.value === sort) ? sort : 'popular',
  };
}

const keyOf = (v: ProductVariant) => {
  const p = parseSize(v);
  return p.width === null ? '' : `${p.width}x${p.length}`;
};

/** The size a card shows: the first that meets the size/height filters, else the featured one. */
function shownVariant(product: Product, f: Filters): ProductVariant | null {
  const all = variantsOf(product);
  const ok = all.filter((v) => {
    const p = parseSize(v);
    if (f.sizes.length && !f.sizes.includes(keyOf(v))) return false;
    if (f.heights.length && (p.height === null || !f.heights.includes(p.height))) return false;
    if (f.min !== null && v.price < f.min) return false;
    if (f.max !== null && v.price > f.max) return false;
    if (f.stock && v.inStock === false) return false;
    return true;
  });
  if (!ok.length) return null;
  const featured = featuredVariant(product);
  return ok.includes(featured) ? featured : ok[0];
}

function Checkbox({ checked, label, count, onChange }: { checked: boolean; label: React.ReactNode; count?: number; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-[15px]">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-[4px] border peer-focus-visible:ring-2 peer-focus-visible:ring-ring', checked ? 'border-foreground bg-foreground text-background' : 'border-input')} aria-hidden>
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="flex-1">{label}</span>
      {count !== undefined ? <span className="text-[13px] text-text-tertiary tabular-nums">{count}</span> : null}
    </label>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-t border-border py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-bold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 flex flex-col">{children}</div>
    </details>
  );
}

/**
 * The tiers' page (handoff WebCategory; phones MCategory), also every mattress,
 * search results (WebSearch's «كل النتائج») and offers (WebOffers). Filters
 * live in the address, so a link or the back button keeps them.
 */
export function CategoryPage({ mode }: { mode: Mode }) {
  const shop = useShop();
  const { location, setQuery, go } = useRouter();
  const f = readFilters(location.search);
  const [sheetOpen, setSheetOpen] = useState(false);

  const tier = mode.kind === 'tier' ? mode.tier : null;
  const title = mode.kind === 'search' ? `نتائج البحث عن «${mode.query}»` : mode.kind === 'offers' ? 'العروض' : tier ? `مراتب ${TIER_TITLE[tier]}` : 'كل المراتب';
  useTitle(mode.kind === 'search' ? `بحث: ${mode.query}` : title);

  // The set before filters: the tier, the search's matches, or the discounted ones (none in Odoo yet).
  const base = useMemo(() => {
    if (mode.kind === 'search') return searchProducts(shop.products, mode.query);
    if (mode.kind === 'offers') return [] as Product[];
    return tier ? shop.products.filter((p) => tierOf(p) === tier) : shop.products;
  }, [shop.products, mode, tier]);

  const results = useMemo(() => {
    const list = base
      .filter((p) => !f.tiers.length || f.tiers.includes(tierOf(p)!))
      .map((p) => ({ product: p, variant: shownVariant(p, f) }))
      .filter((r): r is { product: Product; variant: ProductVariant } => r.variant !== null);
    if (f.sort === 'price-asc') list.sort((a, b) => a.variant.price - b.variant.price);
    if (f.sort === 'price-desc') list.sort((a, b) => b.variant.price - a.variant.price);
    if (f.sort === 'rating') list.sort((a, b) => (b.product.rating?.average ?? 0) - (a.product.rating?.average ?? 0));
    if (f.sort === 'popular' && mode.kind !== 'search') list.sort((a, b) => (b.product.rating?.count ?? 0) - (a.product.rating?.count ?? 0));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, location.search]);

  // Only the sizes and heights this set has (design: «Show only sizes and heights that exist»).
  const sizes = useMemo(() => {
    const m = new Map<string, { width: number; length: number }>();
    for (const p of base) for (const v of variantsOf(p)) {
      const s = parseSize(v);
      if (s.width !== null && s.length !== null) m.set(`${s.width}x${s.length}`, { width: s.width, length: s.length });
    }
    return [...m.entries()].sort((a, b) => a[1].length - b[1].length || a[1].width - b[1].width);
  }, [base]);
  const heights = useMemo(() => {
    const hs = new Set<number>();
    for (const p of base) for (const v of variantsOf(p)) {
      const h = parseSize(v).height;
      if (h !== null) hs.add(h);
    }
    return [...hs].sort((a, b) => a - b);
  }, [base]);

  // Analytics: the tier opened (catalogue audiences), the search made - once each.
  const tracked = useRef('');
  useEffect(() => {
    const key = mode.kind === 'search' ? `s:${mode.query}` : `t:${tier ?? 'all'}`;
    if (!base.length || tracked.current === key) return;
    tracked.current = key;
    if (mode.kind === 'search') trackSearch(mode.query);
    else if (tier) trackViewCategory(TIER_TITLE[tier], base.map((p) => p.variants?.[0]?.id ?? p.id));
  }, [base, mode, tier]);

  const toggle = (key: 'tier' | 'size' | 'height', value: string, current: string[]) => {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setQuery({ [key]: next.join(',') || null });
  };
  const activeCount = f.tiers.length + f.sizes.length + f.heights.length + (f.min !== null ? 1 : 0) + (f.max !== null ? 1 : 0) + (f.stock ? 1 : 0);
  const clearAll = () => setQuery({ tier: null, size: null, height: null, min: null, max: null, stock: null });

  const filters = (
    <div className="flex flex-col">
      {mode.kind !== 'tier' || !tier ? (
        <FilterGroup title="الفئة">
          {TIER_KEYS.map((t) => (
            <Checkbox key={t} label={TIER_TITLE[t]} count={base.filter((p) => tierOf(p) === t).length} checked={f.tiers.includes(t)} onChange={() => toggle('tier', t, f.tiers)} />
          ))}
        </FilterGroup>
      ) : null}
      {sizes.length ? (
        <FilterGroup title="المقاس">
          {sizes.map(([key, s]) => (
            <Checkbox key={key} label={<SizeText>{sizeText(s)}</SizeText>} checked={f.sizes.includes(key)} onChange={() => toggle('size', key, f.sizes)} />
          ))}
        </FilterGroup>
      ) : null}
      {heights.length > 1 ? (
        <FilterGroup title="الارتفاع">
          {heights.map((h) => (
            <Checkbox key={h} label={`${h} سم`} checked={f.heights.includes(h)} onChange={() => toggle('height', String(h), f.heights.map(String))} />
          ))}
        </FilterGroup>
      ) : null}
      <FilterGroup title="السعر">
        <div className="flex gap-2 pt-1">
          {(['min', 'max'] as const).map((k) => (
            <label key={k} className="flex flex-1 flex-col gap-1 text-[13px] text-muted-foreground">
              {k === 'min' ? 'من' : 'إلى'}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                // Keyed by the address's value: removing the chip or «مسح الكل» clears the box too.
                key={f[k] ?? ''}
                defaultValue={f[k] ?? ''}
                onBlur={(e) => setQuery({ [k]: e.target.value || null })}
                onKeyDown={(e) => e.key === 'Enter' && setQuery({ [k]: (e.target as HTMLInputElement).value || null })}
                className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-[15px] text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={k === 'min' ? 'السعر من' : 'السعر إلى'}
              />
            </label>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="التوفّر">
        <Checkbox label="متوفّر للتوصيل" checked={f.stock} onChange={() => setQuery({ stock: f.stock ? null : '1' })} />
      </FilterGroup>
    </div>
  );

  const chips = (
    <div className="flex flex-wrap items-center gap-2">
      {f.tiers.map((t) => (
        <Chip key={t} onRemove={() => toggle('tier', t, f.tiers)}>
          {TIER_TITLE[t]}
        </Chip>
      ))}
      {f.sizes.map((s) => (
        <Chip key={s} onRemove={() => toggle('size', s, f.sizes)}>
          <SizeText>{s.replace('x', '×')}</SizeText>
        </Chip>
      ))}
      {f.heights.map((h) => (
        <Chip key={h} onRemove={() => toggle('height', String(h), f.heights.map(String))}>
          {h} سم
        </Chip>
      ))}
      {f.min !== null ? <Chip onRemove={() => setQuery({ min: null })}>من {f.min} د.ل</Chip> : null}
      {f.max !== null ? <Chip onRemove={() => setQuery({ max: null })}>إلى {f.max} د.ل</Chip> : null}
      {f.stock ? <Chip onRemove={() => setQuery({ stock: null })}>متوفّر للتوصيل</Chip> : null}
      {activeCount > 0 ? (
        <button type="button" onClick={clearAll} className="text-sm font-bold underline underline-offset-4">
          مسح الكل
        </button>
      ) : null}
    </div>
  );

  const loading = shop.loading && shop.products.length === 0;

  // ── Offers with no discounts in Odoo, and searches with nothing ──
  if (mode.kind === 'offers' && !loading) {
    return (
      <Container className="pb-16">
        <Breadcrumb items={[{ label: 'العروض' }]} />
        <EmptyState icon={<Tag />} title="لا توجد عروض حالياً" body="سنُعلمك عند وصول عرض جديد على مراتبنا." action="تصفّح المراتب" onAction={() => go({ name: 'category', tier: null })} />
      </Container>
    );
  }
  if (mode.kind === 'search' && !loading && base.length === 0) return <SearchEmpty query={mode.query} />;

  return (
    <Container className="pb-16">
      <Breadcrumb items={mode.kind === 'search' ? [{ label: 'البحث' }] : tier ? [{ label: 'المراتب', to: { name: 'category', tier: null } }, { label: TIER_TITLE[tier] }] : [{ label: 'المراتب' }]} />
      <div className="flex flex-col gap-2 pb-5 lg:pb-6">
        <h1 className="font-display text-[28px] font-bold leading-tight lg:text-[40px]">{title}</h1>
        {mode.kind === 'tier' ? <p className="text-[15px] text-muted-foreground lg:text-base">{INTRO[tier ?? 'all']}</p> : null}
      </div>

      {/* The tier's mattresses as chips, photo and name. */}
      {mode.kind === 'tier' && tier && base.length ? (
        <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
          {base.map((p) => (
            <Link key={p.id} to={{ name: 'product', id: p.id }} className="flex shrink-0 items-center gap-2 rounded-full border border-border py-1 pe-4 ps-1 text-[15px] font-bold hover:border-foreground">
              <img src={photoOf(p, 36)} alt="" className="size-9 rounded-full object-cover" />
              {displayName(p)}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside aria-label="الفلترة" className="hidden lg:block">
          <b className="mb-2 block text-lg">الفلترة</b>
          {filters}
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Phones: one sticky button for filters and sort. */}
          <div className="sticky top-[132px] z-30 -mx-4 flex items-center gap-3 border-b border-border bg-background px-4 py-2 lg:hidden">
            <Button variant="default" size="sm" className="h-10 gap-2 px-4" onClick={() => setSheetOpen(true)}>
              <SlidersHorizontal className="size-4" />
              الفلترة والترتيب
              {activeCount ? <span className="grid size-5 place-items-center rounded-full bg-background text-[11px] text-foreground">{activeCount}</span> : null}
            </Button>
            <span className="text-sm text-muted-foreground">{countText(results.length)}</span>
          </div>

          <div className="hidden items-center justify-between gap-4 lg:flex">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">{countText(results.length)}</span>
              {chips}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">الترتيب:</span>
              <select value={f.sort} onChange={(e) => setQuery({ sort: e.target.value === 'popular' ? null : e.target.value })} className="h-10 cursor-pointer rounded-full border border-border bg-background px-4 font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="lg:hidden">{activeCount ? chips : null}</div>

          {loading ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-3 lg:gap-x-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="aspect-[15/16]" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/3" />
                </div>
              ))}
            </div>
          ) : results.length ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10">
              {results.map(({ product, variant }, i) => (
                <ProductCard key={product.id} product={product} variant={variant} eager={i < 3} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<SlidersHorizontal />} title="لا توجد مراتب بهذه الفلترة" body="جرّب مقاساً آخر أو ألغِ بعض الاختيارات." action="مسح الكل" onAction={clearAll} />
          )}

          <ShowroomBox tier={tier} />
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="flex max-h-[85svh] flex-col gap-0 rounded-t-2xl p-0">
          <SheetTitle className="border-b border-border px-5 py-4 text-start text-lg font-bold">الفلترة والترتيب</SheetTitle>
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            <FilterGroup title="الترتيب">
              {SORTS.map((s) => (
                <label key={s.value} className="flex cursor-pointer items-center gap-3 py-1.5 text-[15px]">
                  <input type="radio" name="sort" className="size-5 accent-foreground" checked={f.sort === s.value} onChange={() => setQuery({ sort: s.value === 'popular' ? null : s.value })} />
                  {s.label}
                </label>
              ))}
            </FilterGroup>
            {filters}
          </div>
          <div className="flex gap-3 border-t border-border p-4">
            <Button variant="outline" size="store" className="flex-1" onClick={clearAll}>
              مسح الكل
            </Button>
            <Button size="store" className="flex-[2]" onClick={() => setSheetOpen(false)}>
              عرض النتائج ({results.length})
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Container>
  );
}

function countText(n: number): string {
  if (n === 0) return 'لا مراتب';
  if (n === 1) return 'مرتبة واحدة';
  if (n === 2) return 'مرتبتان';
  return n <= 10 ? `${n} مراتب` : `${n} مرتبة`;
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  const id = useId();
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground ps-3.5 pe-1.5 text-sm font-bold">
      <span id={id}>{children}</span>
      {/* 24 px to the eye, 44 px to the finger. */}
      <button type="button" onClick={onRemove} className="relative grid size-6 place-items-center rounded-full after:absolute after:-inset-2.5 hover:bg-accent" aria-label="إزالة الفلتر" aria-describedby={id}>
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: Parameters<typeof Link>[0]['to'] }[] }) {
  return (
    <nav aria-label="مسار التصفح" className="flex flex-wrap items-center gap-1.5 py-4 text-[13px] text-muted-foreground lg:py-5">
      <Link to={{ name: 'home' }} className="hover:text-foreground hover:underline">
        الرئيسية
      </Link>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span aria-hidden>/</span>
          {it.to ? (
            <Link to={it.to} className="hover:text-foreground hover:underline">
              {it.label}
            </Link>
          ) : (
            <span aria-current="page" className="text-foreground">
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

function ShowroomBox({ tier }: { tier: TierKey | null }) {
  return (
    <div className="mt-4 flex flex-col items-start gap-4 bg-image-bg p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
      <div className="flex items-start gap-3">
        <Store className="mt-0.5 size-6 shrink-0 text-brand-text" strokeWidth={1.8} aria-hidden />
        <div className="flex flex-col gap-0.5">
          <b className="text-[15px]">جرّب المراتب قبل الشراء</b>
          <span className="text-sm text-muted-foreground">كل مراتب {tier ? TIER_TITLE[tier] : 'بريماتكس'} معروضة في صالة العرض، حي الأندلس، طرابلس.</span>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="h-10 px-5">
        <Link to={{ name: 'showroom' }}>الموقع وساعات العمل</Link>
      </Button>
    </div>
  );
}

/** Nothing found (handoff WebSearchEmpty): nearby sizes, the tiers, contact, best sellers. */
function SearchEmpty({ query }: { query: string }) {
  const shop = useShop();
  const best = [...shop.products].sort((a, b) => (b.rating?.count ?? 0) - (a.rating?.count ?? 0)).slice(0, 4);
  // A size in the query («140×220») suggests the three sizes sold nearest to it.
  const m = query.match(/(\d{2,3})\s*[*x×X]\s*(\d{2,3})/);
  const near: string[] = [];
  if (m) {
    const w = Math.min(Number(m[1]), Number(m[2]));
    const all = new Map<string, number>();
    for (const p of shop.products) for (const v of variantsOf(p)) {
      const s = parseSize(v);
      if (s.width !== null && s.length !== null) all.set(`${s.width}×${s.length}`, Math.abs(s.width - w));
    }
    near.push(...[...all.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => k));
  }
  return (
    <Container className="flex flex-col gap-8 pb-16 pt-8">
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-image-bg">
          <Search className="size-6 text-muted-foreground" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold lg:text-[32px]">
            لم نجد نتائج لـ «<bdi>{query}</bdi>»
          </h1>
          <span className="text-[15px] text-muted-foreground">تحقّق من الكتابة، أو جرّب كلمة أعمّ مثل «مرتبة 120» أو اسم الفئة.</span>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {near.length ? (
          <div className="flex flex-col gap-3">
            <b>مقاسات قريبة</b>
            <div className="flex flex-wrap gap-2">
              {near.map((s) => (
                <Link key={s} to={`/mattresses?size=${s.replace('×', 'x')}`} className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-foreground">
                  <SizeText>{s}</SizeText>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-3">
          <b>تصفّح الفئات</b>
          <div className="flex flex-wrap gap-2">
            {TIER_KEYS.map((t) => (
              <Link key={t} to={{ name: 'category', tier: t }} className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-foreground">
                {TIER_TITLE[t]}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-3 bg-image-bg p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col">
          <b>لم تجد ما تبحث عنه؟</b>
          <span className="text-sm text-muted-foreground">تواصل معنا لنساعدك في الاختيار.</span>
        </div>
        <Button asChild variant="outline" size="sm" className="h-10 px-5">
          <Link to={{ name: 'help' }}>تواصل معنا</Link>
        </Button>
      </div>
      <h2 className="text-[21px] font-bold lg:text-[28px]">الأكثر طلباً</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
        {best.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </Container>
  );
}

