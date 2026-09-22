import { useEffect, useState } from 'react';
import { BadgeCheck, Check } from 'lucide-react';

import { AppCard, HeartButton, NewItemCard, Pill, ProductImage, SectionTitle } from '@/components/mobile/ui';
import { iconSrc, resolveFeatureIcons } from '@/lib/icons';
import { openSupport } from '@/lib/support';
import { cn, formatPrice, isComingSoon } from '@/lib/utils';
import type { Product } from '@/types';

interface MobileProductProps {
  product: Product;
  related: Product[];
  justAddedId: number | null;
  saved: boolean;
  wishlistPending: boolean;
  onAdd: (product: Product) => void;
  /** "Buy now": add, then straight to the cart. */
  onBuyNow: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
}

/** "Why Brimatex" - the app's product screen lists the same three promises. */
const TRUST = [
  { title: 'الدفع عند الاستلام', body: 'لا تدفع شيئاً قبل أن تستلم.' },
  { title: 'تجربة 30 ليلة', body: 'جرّبها في بيتك، وأرجعها إن لم تناسبك.' },
  { title: 'توصيل مجاني', body: 'إلى باب منزلك دون رسوم إضافية.' },
];

/**
 * The product page on a phone - the iOS app's product screen (brimatex-ios/
 * src/screens/ProductScreen.tsx): the picture with its heart, then one card
 * each for the name and price, the size, the description, the specs, "why
 * Brimatex" and "have a question?", then "you may like"; and at the bottom
 * the app's buy bar - "buy now", "add to cart", and the heart.
 */
export function MobileProduct({
  product,
  related,
  justAddedId,
  saved,
  wishlistPending,
  onAdd,
  onBuyNow,
  onToggleWishlist,
  onOpenProduct,
}: MobileProductProps) {
  // The picked size, as on the desktop page (components/ProductDetail.tsx):
  // what goes in the cart is the chosen variant's id, price and stock.
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants?.[0]?.id ?? product.id);
  useEffect(() => {
    setSelectedVariantId(product.variants?.[0]?.id ?? product.id);
  }, [product.id, product.variants]);

  const variants = product.variants ?? [];
  const selected = variants.find((v) => v.id === selectedVariantId);
  const price = selected?.price ?? product.price;
  const inStock = (selected ? selected.inStock !== false : product.inStock !== false) && !isComingSoon(product.category);
  const stock = selected?.stock ?? product.stock;
  const sku = selected?.sku || product.sku;
  const justAdded = justAddedId === selectedVariantId;
  const cartProduct: Product = selected
    ? { ...product, id: selected.id, price: selected.price, sku: selected.sku, stock: selected.stock, inStock: selected.inStock }
    : product;
  const features = resolveFeatureIcons(product.iconFeatures);

  function ask() {
    const size = selected?.label ? ` (المقاس: ${selected.label})` : '';
    openSupport({ message: `عندي سؤال عن ${product.name}${size}: ` });
  }

  return (
    // Bottom padding keeps the last card clear of the fixed buy bar
    <div className="px-4 pb-32 pt-4">
      <div className="relative mb-4 overflow-hidden rounded-[20px]">
        <ProductImage product={product} letterSize={88} className="aspect-[4/3]" />
        <HeartButton
          saved={saved}
          disabled={wishlistPending}
          size={42}
          onClick={() => onToggleWishlist(product)}
          className="absolute top-3 end-3"
        />
      </div>

      <AppCard className="mb-4">
        <h1 className="text-xl font-bold leading-[30px] text-app-ocean">{product.name}</h1>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[26px] font-bold text-app-ocean">{formatPrice(price)} د.ل</p>
          {inStock ? (
            <Pill tone="success">{stock && stock > 0 ? `متوفّر · ${stock}` : 'متوفّر'}</Pill>
          ) : (
            <Pill tone="danger">نفد المخزون</Pill>
          )}
        </div>
        {sku && <p className="mt-2 text-xs text-app-muted">رمز المنتج: {sku}</p>}
      </AppCard>

      {variants.length > 1 && (
        <AppCard className="mb-4">
          <SectionTitle hint="اختر المقاس المناسب لسريرك">المقاس</SectionTitle>
          <div role="radiogroup" aria-label="المقاس" className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const active = v.id === selectedVariantId;
              const out = v.inStock === false;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={out}
                  onClick={() => setSelectedVariantId(v.id)}
                  className={cn(
                    'min-w-[92px] rounded-[14px] border-[1.5px] px-4 py-3 text-sm font-semibold',
                    active ? 'border-app-ocean bg-app-ocean text-white' : 'border-app-border bg-[#fafbfa] text-app-text',
                    out && 'opacity-35'
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </AppCard>
      )}

      {product.description && (
        <AppCard className="mb-4">
          <SectionTitle>الوصف</SectionTitle>
          <p className="text-base leading-[26px] text-app-text">{product.description}</p>
        </AppCard>
      )}

      {features.length > 0 && (
        <AppCard className="mb-4">
          <SectionTitle>المواصفات</SectionTitle>
          <div className="grid grid-cols-3">
            {features.map((f) => (
              <div key={f.key} className="flex flex-col items-center px-1 py-3 text-center">
                <img src={iconSrc(f.file)} alt="" className="size-12 object-contain" />
                <span className="mt-2 line-clamp-2 text-xs leading-[17px] text-app-text">{f.label}</span>
              </div>
            ))}
          </div>
        </AppCard>
      )}

      <AppCard className="mb-4">
        <SectionTitle>لماذا بريماتكس</SectionTitle>
        {TRUST.map((t, i) => (
          <div key={t.title} className={cn('flex items-center gap-3 py-3', i > 0 && 'border-t border-app-divider')}>
            <div className="flex-1">
              <p className="text-base font-semibold text-app-text">{t.title}</p>
              <p className="mt-0.5 text-sm text-app-muted">{t.body}</p>
            </div>
            <span className="grid size-[26px] place-items-center rounded-full bg-app-success-bg">
              <Check className="size-[15px] text-app-success" aria-hidden="true" />
            </span>
          </div>
        ))}
      </AppCard>

      <AppCard className="mb-4">
        <SectionTitle hint="اكتب لنا وسيتصل بك فريق خدمة العملاء">عندك سؤال؟</SectionTitle>
        <button type="button" onClick={ask} className="w-full rounded-full py-3.5 text-[17px] font-semibold text-app-ocean active:bg-app-tint-soft">
          اسأل عن هذا المنتج
        </button>
      </AppCard>

      {related.length > 0 && (
        <section className="mb-4">
          <SectionTitle>قد يعجبك</SectionTitle>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 py-2">
            {related.slice(0, 10).map((p) => (
              <NewItemCard key={p.id} product={p} onOpen={onOpenProduct} />
            ))}
          </div>
        </section>
      )}

      {/* ── The app's buy bar: "buy now", "add to cart", heart - above the tab bar ── */}
      <div className="fixed inset-x-0 z-20 border-t border-app-border bg-white px-4 pb-3 pt-3 shadow-app-bar bottom-[calc(72px+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onBuyNow(cartProduct)}
            disabled={!inStock}
            className="flex-1 rounded-full bg-app-sun py-4 text-[17px] font-semibold text-app-ocean disabled:opacity-45"
          >
            {inStock ? 'اشترِ الآن' : 'نفد المخزون'}
          </button>
          <button
            type="button"
            onClick={() => onAdd(cartProduct)}
            disabled={!inStock || justAdded}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-app-ocean py-4 text-[17px] font-semibold text-white disabled:opacity-45"
          >
            {justAdded ? (
              <>
                <BadgeCheck className="size-5" aria-hidden="true" />
                تمت الإضافة
              </>
            ) : (
              'أضف للسلة'
            )}
          </button>
          <span className="grid size-14 shrink-0 place-items-center rounded-[14px] bg-app-input">
            <HeartButton
              saved={saved}
              disabled={wishlistPending}
              size={44}
              onClick={() => onToggleWishlist(product)}
              className="shadow-none"
            />
          </span>
        </div>
      </div>
    </div>
  );
}
