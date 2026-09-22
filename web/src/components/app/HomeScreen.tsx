import { useMemo, useState } from 'react';

import { Catalogue } from '@/components/app/Catalogue';
import { ArrowButton, NewItemCard, ProductImage, SectionHeader } from '@/components/app/ui';
import { QUESTIONS } from '@/lib/mattressQuiz';
import { openSupport } from '@/lib/support';
import { cn } from '@/lib/utils';
import type { Category, Product, SectionId, User } from '@/types';

interface MobileHomeProps {
  user: User | null;
  products: Product[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  isSaved: (productId: number) => boolean;
  wishlistPending: number | null;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onNavigate: (section: SectionId) => void;
}

const CATEGORY_LABEL: Record<Category, string> = {
  mattress: 'مراتب',
  pillow: 'وسائد',
  bedding: 'مفروشات',
};

/**
 * Home - the iOS app's home screen (brimatex-ios/src/screens/
 * HomeScreen.tsx), section for section: the account photo and "my activity",
 * the greeting, the announcement and quiz cards, new arrivals, categories, and
 * the whole catalogue with search and chips.
 *
 * Left out, because the website has no such data: the app's vouchers,
 * warranty scanner and settings icons, points, and "recently viewed".
 */
export function HomeScreen({
  user,
  products,
  loading,
  error,
  onReload,
  isSaved,
  wishlistPending,
  onOpen,
  onToggleWishlist,
  onNavigate,
}: MobileHomeProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');

  const firstName = user?.name?.trim().split(/\s+/)[0];
  // The newest products: the catalogue's order is Odoo's, highest ids last.
  const newest = useMemo(() => [...products].sort((a, b) => b.id - a.id).slice(0, 8), [products]);
  const categories = useMemo(
    () =>
      (Object.keys(CATEGORY_LABEL) as Category[])
        .map((c) => ({ key: c, items: products.filter((p) => p.category === c) }))
        .filter((c) => c.items.length > 0),
    [products]
  );

  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-3 md:px-8 md:pb-16 md:pt-10">
      {/* ── Header: photo and "my activity" ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigate('auth')}
          aria-label="الحساب"
          className="grid size-[52px] shrink-0 place-items-center rounded-full border-2 border-app-tint bg-app-tint-soft text-xl font-bold text-app-ocean"
        >
          {firstName?.charAt(0) ?? '؟'}
        </button>
        <button
          type="button"
          onClick={() => onNavigate(user ? 'orders' : 'auth')}
          className="rounded-full bg-app-ocean px-7 py-3 text-[17px] font-semibold text-white active:opacity-85"
        >
          نشاطي
        </button>
      </div>

      <p className="mt-5 text-[34px] font-bold leading-tight text-app-text md:text-[44px]">
        {firstName ? `مرحباً، ${firstName}!` : 'مرحباً بك!'}
      </p>

      {/* Side by side on larger screens, stacked on a phone as in the app */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
      {/* ── Announcement ── */}
      <div className="flex items-center gap-4 rounded-[20px] bg-app-tint-soft p-5">
        <div className="flex-1">
          <p className="text-[17px] font-bold text-app-text">إعلان</p>
          <p className="mt-1 text-sm leading-[21px] text-app-text">
            الدفع عند الاستلام وتجربة 30 ليلة على كل المراتب. عندك سؤال؟ اكتب لخدمة العملاء وسنتصل بك.
          </p>
        </div>
        <ArrowButton size={40} label="تواصل مع خدمة العملاء" onClick={() => openSupport()} />
      </div>

      {/* ── Mattress quiz - same shape as the card above ── */}
      <button
        type="button"
        onClick={() => onNavigate('quiz')}
        className="flex w-full items-center gap-4 rounded-[20px] bg-app-tint-soft p-5 text-start active:opacity-85"
      >
        <span className="flex-1">
          <span className="block text-[17px] font-bold text-app-text">شن المرتبة المناسبة ليك؟</span>
          <span className="mt-1 block text-sm leading-[21px] text-app-text">
            {QUESTIONS.length} أسئلة بسيطة ونقترح عليك الأقرب لنومك.
          </span>
        </span>
        <ArrowButton size={44} label="ابدأ الاختبار" />
      </button>
      </div>

      {/* ── New arrivals ── */}
      {newest.length > 0 && (
        <section className="mt-7">
          <SectionHeader title="وصل حديثاً" />
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 py-2 md:-mx-8 md:gap-4 md:px-8">
            {newest.map((p) => (
              <NewItemCard key={p.id} product={p} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {/* ── Categories: tapping one filters the catalogue below ── */}
      {categories.length > 0 && (
        <section className="mt-7">
          <SectionHeader title="التصنيفات" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {categories.map(({ key, items }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(category === key ? 'all' : key)}
                aria-pressed={category === key}
                className={cn(
                  'rounded-[20px] border-[1.5px] bg-white p-2 text-start',
                  category === key ? 'border-app-ocean' : 'border-app-border'
                )}
              >
                <span className="grid grid-cols-2 gap-1.5">
                  {[0, 1, 2, 3].map((i) =>
                    items[i] ? (
                      <ProductImage key={i} product={items[i]} letterSize={22} className="aspect-square rounded-[10px]" />
                    ) : (
                      <span key={i} className="aspect-square rounded-[10px] bg-app-nebula" />
                    )
                  )}
                </span>
                <span className="flex items-center justify-between px-1 pb-1 pt-3">
                  <span className="text-[17px] font-bold text-app-text">{CATEGORY_LABEL[key]}</span>
                  <span className="rounded-full bg-app-tint-soft px-3 py-1 text-sm font-bold text-app-text">{items.length}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── The whole catalogue ── */}
      <section className="mt-7">
        <SectionHeader title="كل المنتجات" />
        <Catalogue
          products={products}
          loading={loading}
          error={error}
          onReload={onReload}
          query={query}
          onQueryChange={setQuery}
          category={category}
          onCategoryChange={setCategory}
          isSaved={isSaved}
          wishlistPending={wishlistPending}
          onOpen={onOpen}
          onToggleWishlist={onToggleWishlist}
        />
      </section>
    </div>
  );
}
