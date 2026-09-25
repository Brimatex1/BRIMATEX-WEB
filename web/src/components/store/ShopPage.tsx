import { useMemo, useState } from 'react';
import { ArrowUpDown, Search, SearchX } from 'lucide-react';

import { ProductCard, ProductCardSkeleton, priceFrom } from '@/components/store/ProductCard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { openSupport } from '@/lib/support';
import { ALL_TIERS, inTier, tiersOf, type TierFilter } from '@/lib/tiers';
import type { Product } from '@/types';

type Sort = 'newest' | 'price-asc' | 'price-desc';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price-asc', label: 'السعر: من الأقل' },
  { value: 'price-desc', label: 'السعر: من الأعلى' },
];

interface ShopPageProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** An Odoo tier's key, or 'all'. */
  category: TierFilter;
  onCategoryChange: (category: TierFilter) => void;
  isSaved: (productId: number) => boolean;
  wishlistPending: number | null;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onGoHome: () => void;
}

/**
 * The shop: a tab per Odoo tier, search and sort, and the mattresses in a
 * grid. The tier and the search live in the address (/shop?category=&q=), so
 * an ad can link straight to a filtered page.
 */
export function ShopPage({
  products,
  loading,
  error,
  onReload,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  isSaved,
  wishlistPending,
  onOpen,
  onToggleWishlist,
  onGoHome,
}: ShopPageProps) {
  const [sort, setSort] = useState<Sort>('newest');
  const tiers = useMemo(() => tiersOf(products).map((t) => t.tier), [products]);
  const current = tiers.find((t) => t.key === category);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = products.filter((p) => {
      if (!inTier(p, category)) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.sku ?? '').toLowerCase().includes(needle) ||
        (p.tier?.name ?? '').includes(needle) ||
        (p.description ?? '').toLowerCase().includes(needle)
      );
    });
    if (sort === 'price-asc') return [...list].sort((a, b) => priceFrom(a) - priceFrom(b));
    if (sort === 'price-desc') return [...list].sort((a, b) => priceFrom(b) - priceFrom(a));
    return [...list].sort((a, b) => b.id - a.id);
  }, [products, query, category, sort]);

  const title = query.trim() ? `نتائج البحث عن «${query.trim()}»` : current ? `مراتب ${current.name}` : 'كل المراتب';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onGoHome();
              }}
            >
              الرئيسية
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {current ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  href="/shop"
                  onClick={(e) => {
                    e.preventDefault();
                    onCategoryChange(ALL_TIERS);
                  }}
                >
                  المراتب
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>مراتب {current.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>المراتب</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">الدفع عند الاستلام وتوصيل مجاني على كل المراتب.</p>
      </div>

      {/* ── Filters: tier tabs, search, sort ── */}
      <div className="mb-6 flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
        {tiers.length > 1 ? (
          <Tabs value={category} onValueChange={onCategoryChange} dir="rtl" className="max-w-full overflow-x-auto">
            <TabsList>
              <TabsTrigger value={ALL_TIERS}>الكل</TabsTrigger>
              {tiers.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <div className="relative flex-1 md:w-64 md:flex-none">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="ابحث باسم المرتبة أو رمزها"
              aria-label="بحث في المراتب"
              className="h-10 border-border ps-9"
            />
          </div>
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <ArrowUpDown />
                <span className="hidden sm:inline">{SORTS.find((s) => s.value === sort)?.label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as Sort)}>
                {SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s.value} value={s.value}>
                    {s.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!loading && !error && (
        <p aria-live="polite" className="mb-4 text-sm text-muted-foreground">
          {visible.length} {visible.length === 1 ? 'مرتبة' : 'مراتب'}
        </p>
      )}

      {error ? (
        <Card className="p-8 text-center">
          <p className="font-semibold">تعذّر تحميل المراتب</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4" onClick={onReload}>
            إعادة المحاولة
          </Button>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">ما لقيناش مراتب تطابق بحثك</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onQueryChange('');
                onCategoryChange(ALL_TIERS);
              }}
            >
              عرض كل المراتب
            </Button>
            {/* Looking for something the shop may still make - ask the factory */}
            <Button
              variant="ghost"
              onClick={() =>
                openSupport({ topic: 'product', message: query.trim() ? `أدوّر على: ${query.trim()}\n` : '' })
              }
            >
              ما لقيتش اللي تدوّر عليه؟ اسألنا
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              saved={isSaved(p.id)}
              wishlistPending={wishlistPending === p.id}
              onOpen={onOpen}
              onToggleWishlist={onToggleWishlist}
            />
          ))}
        </div>
      )}
    </div>
  );
}
