import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Heart, LogIn, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';

import { ProductCard } from '@/components/store/ProductCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Product, User } from '@/types';

interface WishlistScreenProps {
  user: User | null;
  products: Product[];
  savedIds: number[];
  onAdd: (product: Product) => void;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  /** The product whose heart is being saved or removed right now - its heart waits. */
  wishlistPending?: number | null;
  onGoToAuth: () => void;
  onContinueShopping: () => void;
}

/**
 * The wishlist: the saved products in the shop's grid, each card's heart
 * removing it, with "add to cart" under each; "you may like" below.
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
  wishlistPending = null,
  onGoToAuth,
  onContinueShopping,
}: WishlistScreenProps) {
  const saved = products.filter((p) => savedIds.includes(p.id));
  const suggested = products.filter((p) => !savedIds.includes(p.id)).slice(0, 4);
  // A product with sizes needs its page to pick one first, as in the app.
  const add = (p: Product) => (p.variants?.length ? onOpen(p) : onAdd(p));

  // A card and, outside it, its "add to cart" - the card's link covers the whole card.
  const cell = (p: Product, isSaved: boolean) => (
    <div key={p.id} className="flex flex-col gap-2">
      <ProductCard
        product={p}
        saved={isSaved}
        wishlistPending={wishlistPending === p.id}
        onOpen={onOpen}
        onToggleWishlist={onToggleWishlist}
      />
      <Button variant="outline" size="sm" onClick={() => add(p)} className="w-full">
        <ShoppingBag /> {p.variants?.length ? 'اختر المقاس' : 'أضف للسلة'}
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">المفضّلة</h1>

      {!user ? (
        <EmptyState Icon={LogIn} title="سجّل الدخول أولاً" text="سجّل الدخول لتحفظ منتجاتك المفضّلة وتجدها في كل مرة">
          <Button onClick={onGoToAuth}>تسجيل الدخول</Button>
        </EmptyState>
      ) : (
        <>
          {saved.length === 0 ? (
            <EmptyState Icon={Heart} title="مفضّلتك فارغة" text="لا منتجات في مفضّلتك بعد — اضغط القلب على أي منتج">
              <Button onClick={onContinueShopping}>تصفّح المنتجات</Button>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{saved.map((p) => cell(p, true))}</div>
          )}

          {suggested.length > 0 && (
            <section className="mt-12">
              <div className="mb-5 flex items-end justify-between gap-4">
                <h2 className="text-xl font-bold tracking-tight md:text-2xl">قد يعجبك</h2>
                <Button variant="ghost" size="sm" onClick={onContinueShopping} className="gap-1 text-primary">
                  عرض الكل
                  <ArrowLeft />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{suggested.map((p) => cell(p, false))}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ Icon, title, text, children }: { Icon: LucideIcon; title: string; text: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center md:p-12">
      <span className="grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      <div className="mt-2">{children}</div>
    </Card>
  );
}
