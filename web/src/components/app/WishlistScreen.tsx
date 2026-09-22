import { Heart } from 'lucide-react';

import { EmptyCircle, SectionHeader, WishRow } from '@/components/app/ui';
import type { Product, User } from '@/types';

interface WishlistScreenProps {
  user: User | null;
  products: Product[];
  savedIds: number[];
  onAdd: (product: Product) => void;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onGoToAuth: () => void;
  onContinueShopping: () => void;
}

/**
 * The wishlist - the iOS app's wishlist screen: one row per saved
 * product (WishRow), each with delete and "add to cart"; "you may like" below.
 *
 * The website keeps the wishlist on the account, so a signed-out visitor is
 * asked to sign in first - the app keeps it on the device instead.
 */
export function WishlistScreen({
  user,
  products,
  savedIds,
  onAdd,
  onOpen,
  onToggleWishlist,
  onGoToAuth,
  onContinueShopping,
}: WishlistScreenProps) {
  const saved = products.filter((p) => savedIds.includes(p.id));
  const suggested = products.filter((p) => !savedIds.includes(p.id)).slice(0, 4);
  // A product with sizes needs its page to pick one first, as in the app.
  const add = (p: Product) => (p.variants?.length ? onOpen(p) : onAdd(p));

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 pt-4 md:pt-10">
        <EmptyCircle Icon={Heart} text="سجّل الدخول لتحفظ منتجاتك المفضّلة وتجدها في كل مرة">
          <button
            type="button"
            onClick={onGoToAuth}
            className="mt-6 rounded-full bg-app-ocean px-8 py-3.5 text-[17px] font-semibold text-white"
          >
            تسجيل الدخول
          </button>
        </EmptyCircle>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-10 pt-4 md:px-8 md:pb-16 md:pt-10">
      {saved.length === 0 ? (
        <EmptyCircle Icon={Heart} text="لا منتجات في مفضّلتك بعد — اضغط القلب على أي منتج">
          <button
            type="button"
            onClick={onContinueShopping}
            className="mt-6 rounded-full bg-app-ocean px-8 py-3.5 text-[17px] font-semibold text-white"
          >
            تصفّح المنتجات
          </button>
        </EmptyCircle>
      ) : (
        saved.map((p) => (
          <WishRow key={p.id} product={p} onOpen={() => onOpen(p)} onRemove={() => onToggleWishlist(p)} onAdd={() => add(p)} />
        ))
      )}

      {suggested.length > 0 && (
        <section className="mt-6">
          <SectionHeader title="قد يعجبك" action="عرض الكل" onAction={onContinueShopping} />
          {suggested.map((p) => (
            <WishRow key={p.id} product={p} onOpen={() => onOpen(p)} onAdd={() => add(p)} />
          ))}
        </section>
      )}
    </div>
  );
}
