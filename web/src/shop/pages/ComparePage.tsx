import { useState } from 'react';
import { Scale, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

import { TIER_TITLE, canOrderVariant, displayName, featuredVariant, fixedHeight, heightsOf, parseSize, priceFrom, sizeText, tierOf, variantsOf } from '../catalog';
import { useTitle } from '../hooks';
import { photoOf } from '../ProductCard';
import { Link, useRouter } from '../router';
import { useShop } from '../state';
import { Container, EmptyState, Price, TierTag } from '../ui';
import { Breadcrumb } from './CategoryPage';
import { responsivePhoto } from '@/shop/photoSizes';

const MAX = 3;

function sizesText(p: Product): string {
  const n = new Set(variantsOf(p).map((v) => sizeText(parseSize(v))).filter(Boolean)).size;
  if (n === 1) return 'مقاس واحد';
  if (n === 2) return 'مقاسان';
  return n <= 10 ? `${n} مقاسات` : `${n} مقاساً`;
}

function heightText(p: Product): string {
  const fixed = fixedHeight(p);
  if (fixed !== null) return `${fixed} سم`;
  const hs = heightsOf(p);
  return hs.length ? `${hs.slice(0, -1).join(' أو ')}${hs.length > 1 ? ' أو ' : ''}${hs[hs.length - 1]} سم` : '—';
}

function warrantyText(p: Product): string {
  const y = p.warrantyYears;
  if (!y) return 'بدون ضمان';
  if (y === 1) return 'سنة';
  if (y === 2) return 'سنتان';
  return y <= 10 ? `${y} سنوات` : `${y} سنة`;
}

const ROWS: { label: string; value: (p: Product) => string }[] = [
  { label: 'الفئة', value: (p) => (tierOf(p) ? TIER_TITLE[tierOf(p)!] : '—') },
  { label: 'النوع', value: (p) => p.compare?.type ?? '—' },
  { label: 'الارتفاع', value: heightText },
  { label: 'الطبقة العلوية', value: (p) => p.compare?.topLayer ?? '—' },
  { label: 'الإطار والكثافة', value: (p) => p.compare?.frame ?? '—' },
  { label: 'المقاسات', value: sizesText },
  { label: 'الضمان', value: warrantyText },
];

/**
 * قارن المراتب (handoff WebCompare): up to three side by side - photo, tier,
 * «يبدأ من», add to cart, remove - then the rows from the catalogue (type,
 * height, top layer, frame and density, sizes, warranty), with «إظهار الفروق
 * فقط». The ids are in the address, so a comparison can be shared.
 */
export function ComparePage({ ids }: { ids: number[] }) {
  const shop = useShop();
  const { go } = useRouter();
  const [onlyDiff, setOnlyDiff] = useState(false);
  useTitle('قارن المراتب');
  const items = ids.map((id) => shop.find(id)).filter((p): p is Product => Boolean(p));
  const others = shop.products.filter((p) => !items.some((i) => i.id === p.id));
  const setIds = (next: number[]) => go({ name: 'compare', ids: next }, { replace: true, keepScroll: true });

  const rows = ROWS.filter((r) => !onlyDiff || new Set(items.map(r.value)).size > 1);
  const cols = `minmax(110px,180px) repeat(${Math.max(items.length, 1)}, minmax(150px, 1fr))`;

  return (
    <Container className="pb-16">
      <Breadcrumb items={[{ label: 'المراتب', to: { name: 'category', tier: null } }, { label: 'المقارنة' }]} />
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
        <h1 className="font-display text-[28px] font-bold lg:text-[40px]">قارن المراتب</h1>
        {items.length > 1 ? (
          <label className="flex cursor-pointer items-center gap-3 text-sm font-bold">
            <span className="relative inline-flex h-6 w-11 items-center">
              <input type="checkbox" className="peer sr-only" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
              <span className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
              <span className="absolute start-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5" />
            </span>
            إظهار الفروق فقط
          </label>
        ) : null}
      </div>

      {items.length === 0 && !shop.loading ? (
        <EmptyState icon={<Scale />} title="اختر مراتب للمقارنة" body="افتح أي مرتبة واضغط «قارن مع مراتب أخرى»، أو اختر من هنا." />
      ) : null}

      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div className="grid min-w-[560px]" style={{ gridTemplateColumns: cols }}>
          {/* Heads */}
          <div className="flex flex-col justify-end gap-2 pb-4 pe-4 text-sm text-muted-foreground">
            <span>حتى {MAX} مراتب.</span>
            {items.length < MAX && others.length ? (
              <select
                aria-label="أضف مرتبة أخرى"
                className="h-10 rounded-full border border-border bg-background px-3 text-sm font-bold text-foreground"
                value=""
                onChange={(e) => e.target.value && setIds([...items.map((i) => i.id), Number(e.target.value)])}
              >
                <option value="">أضف مرتبة أخرى</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {items.map((p) => {
            const v = featuredVariant(p);
            const tier = tierOf(p);
            return (
              <div key={p.id} className="flex flex-col gap-1.5 px-3 pb-4">
                <Link to={{ name: 'product', id: p.id }}>
                  <img {...responsivePhoto(photoOf(p), '(min-width: 1024px) 280px, 45vw')} alt={displayName(p)} className="aspect-[4/3] w-full bg-image-bg object-cover" />
                </Link>
                {tier ? <TierTag tier={tier} className="mt-2 self-start" /> : null}
                <b className="text-base">{displayName(p)}</b>
                <span className="text-xs text-muted-foreground">يبدأ من</span>
                <Price amount={priceFrom(p)} />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" className="h-10 flex-1" disabled={!canOrderVariant(v)} onClick={() => shop.addToCart(p, v)}>
                    أضف إلى السلة
                  </Button>
                  <button type="button" aria-label={`إزالة ${displayName(p)} من المقارنة`} className="grid size-10 place-items-center rounded-full border border-border hover:border-foreground" onClick={() => setIds(items.filter((i) => i.id !== p.id).map((i) => i.id))}>
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {/* Rows */}
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <b className="border-t border-border py-4 pe-4 text-sm">{r.label}</b>
              {items.map((p) => (
                <span key={p.id} className={cn('border-t border-border px-3 py-4 text-[15px]', r.label === 'الضمان' && !p.warrantyYears && 'text-muted-foreground')}>
                  {r.value(p)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {items.length ? <p className="mt-6 text-[13px] text-muted-foreground">من كتالوج بريماتكس وبيانات أودو. الصلابة غير مذكورة في الكتالوج، فلا تظهر في المقارنة.</p> : null}
    </Container>
  );
}
