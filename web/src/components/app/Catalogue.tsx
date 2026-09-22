import { useMemo } from 'react';

import { Chip, CatalogueCard } from '@/components/app/ui';
import type { Category, Product } from '@/types';

const CATEGORY_LABEL: Record<Category, string> = {
  mattress: 'مراتب',
  pillow: 'وسائد',
  bedding: 'مفروشات',
};

interface CatalogueProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  category: Category | 'all';
  onCategoryChange: (category: Category | 'all') => void;
  isSaved: (productId: number) => boolean;
  wishlistPending: number | null;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
}

/**
 * "All products" as the app's home screen has it: a borderless search field,
 * category chips, the count, and one card per row.
 *
 * Only categories that have products get a chip - an empty chip would lead to
 * an empty list.
 */
export function Catalogue({
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
}: CatalogueProps) {
  const categories = useMemo(
    () => (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => products.some((p) => p.category === c)),
    [products]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.sku ?? '').toLowerCase().includes(needle) ||
        (p.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [products, query, category]);

  return (
    <div>
      <label htmlFor="m-search" className="sr-only">
        بحث في المنتجات
      </label>
      <input
        id="m-search"
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="ابحث باسم المنتج أو رمزه"
        enterKeyHint="search"
        className="w-full rounded-[28px] bg-app-input md:max-w-md px-5 py-3.5 text-base text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-app-ocean/30"
      />

      {categories.length > 1 && (
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          <Chip label="الكل" active={category === 'all'} onClick={() => onCategoryChange('all')} />
          {categories.map((c) => (
            <Chip key={c} label={CATEGORY_LABEL[c]} active={category === c} onClick={() => onCategoryChange(c)} />
          ))}
        </div>
      )}

      {!loading && !error && (
        <p aria-live="polite" className="mt-3 text-sm text-app-muted">
          {visible.length} منتج
        </p>
      )}

      {/* One card per row on a phone, as in the app; two or three side by side on larger screens */}
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading &&
          [0, 1].map((i) => (
            <div key={i} className="overflow-hidden rounded-[20px] border border-app-border bg-white">
              <div className="aspect-[4/3] animate-pulse bg-app-nebula" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-app-divider" />
                <div className="h-5 w-1/3 animate-pulse rounded bg-app-divider" />
              </div>
            </div>
          ))}

        {!loading && error && (
          <div className="col-span-full py-12 text-center">
            <p className="font-bold text-app-text">تعذّر تحميل المنتجات</p>
            <p className="mt-1 text-sm text-app-muted">{error}</p>
            <button type="button" onClick={onReload} className="mt-4 rounded-full bg-app-ocean px-6 py-3 font-semibold text-white">
              إعادة المحاولة
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="col-span-full py-12 text-center">
            <p className="font-bold text-app-text">{query.trim() ? 'لا نتائج' : 'لا توجد منتجات في هذا التصنيف'}</p>
            <p className="mt-1 text-sm text-app-muted">
              {query.trim() ? `لا منتج يطابق «${query.trim()}»` : 'جرّب تصنيفاً آخر'}
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          visible.map((product) => (
            <CatalogueCard
              key={product.id}
              product={product}
              saved={isSaved(product.id)}
              wishlistPending={wishlistPending === product.id}
              onOpen={onOpen}
              onToggleWishlist={onToggleWishlist}
            />
          ))}
      </div>
    </div>
  );
}
