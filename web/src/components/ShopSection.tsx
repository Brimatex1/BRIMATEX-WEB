import { useMemo, useState } from 'react';
import { ArrowRight, Clock, Search, Truck, X } from 'lucide-react';

import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { cn, formatPrice } from '@/lib/utils';
import type { Category, Product, SortKey } from '@/types';

const TRUST = [
  { Icon: Truck, label: 'توصيل مجاني' },
  { Icon: Clock, label: 'تجربة 30 ليلة' },
];

const CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'mattress', label: 'المراتب' },
  { id: 'pillow', label: 'الوسائد' },
  { id: 'bedding', label: 'المفروشات' },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'featured', label: 'الافتراضي' },
  { id: 'price-asc', label: 'الأقل سعراً' },
  { id: 'price-desc', label: 'الأعلى سعراً' },
  { id: 'name', label: 'الاسم' },
];

interface ShopSectionProps {
  products: Product[];
  /** Lifted so the homepage search box and category cards can deep-link here. */
  category: Category | 'all';
  onCategoryChange: (category: Category | 'all') => void;
  query: string;
  onQueryChange: (query: string) => void;
  onBackHome: () => void;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onAdd: (product: Product) => void;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  isSaved: (productId: number) => boolean;
  wishlistPending: number | null;
  justAddedId: number | null;
}

export function ShopSection({
  products,
  category,
  onCategoryChange,
  query,
  onQueryChange,
  onBackHome,
  loading,
  error,
  onReload,
  onAdd,
  onOpen,
  onToggleWishlist,
  isSaved,
  wishlistPending,
  justAddedId,
}: ShopSectionProps) {
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>('featured');

  const priceCeiling = useMemo(
    () => products.reduce((max, p) => Math.max(max, Number(p.price) || 0), 0),
    [products]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (maxPrice !== null && (Number(p.price) || 0) > maxPrice) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.sku ?? '').toLowerCase().includes(needle) ||
        (p.description ?? '').toLowerCase().includes(needle)
      );
    });

    // Sort a copy — the products array is shared with the rest of the app.
    const sorted = [...filtered];
    if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return sorted;
  }, [products, query, category, maxPrice, sort]);

  const filtersActive = query.trim() !== '' || category !== 'all' || maxPrice !== null;

  const heading = query.trim()
    ? 'نتائج البحث'
    : (CATEGORIES.find((c) => c.id === category)?.label ?? 'كل المنتجات');

  function resetFilters() {
    onQueryChange('');
    onCategoryChange('all');
    setMaxPrice(null);
    setSort('featured');
  }

  return (
    <section className="container animate-fade-up">
      <div className="pt-6">
        <Button variant="ghost" onClick={onBackHome} className="px-2">
          <ArrowRight aria-hidden="true" />
          الرئيسية
        </Button>
      </div>

      {/* The heading reflects how the visitor arrived — a search or a category */}
      <div className="pt-4 pb-6">
        <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight text-primary sm:text-5xl">
          {heading}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {query.trim()
            ? `نتائج البحث عن «${query.trim()}»`
            : 'اطلب مباشرة دون تسجيل، وادفع عند الاستلام.'}
        </p>
      </div>

      <ul className="mb-8 flex flex-wrap gap-x-8 gap-y-3 border-y py-4">
        {TRUST.map(({ Icon, label }) => (
          <li key={label} className="flex items-center gap-2 text-sm text-secondary-foreground">
            <Icon className="size-[17px] shrink-0 text-accent" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>

      {!loading && !error && products.length > 0 && (
        <div className="mb-8 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="shop-search">البحث</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3"
                  aria-hidden="true"
                />
                <Input
                  id="shop-search"
                  type="search"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="ابحث بالاسم أو رقم المنتج"
                  className="ps-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shop-sort">الترتيب</Label>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger id="shop-sort" className="w-auto min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {priceCeiling > 0 && (
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor="shop-price">
                  السعر الأقصى:{' '}
                  <span className="tabular">
                    {maxPrice === null ? 'بلا حد' : `${formatPrice(maxPrice)} د.ل`}
                  </span>
                </Label>
                <Slider
                  id="shop-price"
                  min={0}
                  max={priceCeiling}
                  step={50}
                  value={[maxPrice ?? priceCeiling]}
                  onValueChange={([v]) => setMaxPrice(v >= priceCeiling ? null : v)}
                  className="h-11"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">التصنيف:</span>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onCategoryChange(c.id)}
                aria-pressed={category === c.id}
                className={cn(
                  'min-h-9 rounded-full border px-4 text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  category === c.id
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {c.label}
              </button>
            ))}

            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="ms-auto">
                <X aria-hidden="true" />
                مسح الفلاتر
              </Button>
            )}
          </div>

          <p aria-live="polite" className="text-sm text-muted-foreground">
            {visible.length === products.length
              ? `${products.length} منتج`
              : `${visible.length} من ${products.length} منتج`}
          </p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-8 pb-12 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="gap-3">
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-32" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-11 w-full rounded-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="py-16 text-center">
          <p className="mb-4 text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={onReload}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">لا توجد منتجات متاحة حالياً</p>
      )}

      {!loading && !error && products.length > 0 && visible.length === 0 && (
        <div className="py-16 text-center">
          <p className="mb-4 text-muted-foreground">لا توجد منتجات مطابقة لبحثك</p>
          <Button variant="outline" onClick={resetFilters}>
            مسح الفلاتر
          </Button>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="grid grid-cols-1 gap-8 pb-12 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product, i) => (
            // Stagger caps at 6 so a long grid does not crawl in
            <Reveal key={product.id} delay={Math.min(i, 6) * 60} className="flex">
            <ProductCard
              product={product}
              justAdded={justAddedId === product.id}
              saved={isSaved(product.id)}
              wishlistPending={wishlistPending === product.id}
              onAdd={onAdd}
              onOpen={onOpen}
              onToggleWishlist={onToggleWishlist}
            />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
