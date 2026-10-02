import { CreditCard, ShoppingBasket, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { describe, displayName } from '../catalog';
import { LinePartsText } from '../CartDrawer';
import { useTitle } from '../hooks';
import { photoOf, ProductCard } from '../ProductCard';
import { readViewed } from '../recent';
import { Link, useRouter } from '../router';
import { lineItem, useShop } from '../state';
import { Container, EmptyState, Price, QuantityStepper } from '../ui';

/** «المنتجات (3)» and the rest of the summary - shared with checkout. */
export function SummaryRow({ label, value, strong = false }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'flex items-center justify-between border-t border-border pt-4 text-base font-bold' : 'flex items-center justify-between text-[15px]'}>
      <span>{label}</span>
      <span className={strong ? '' : 'tabular-nums'}>{value}</span>
    </div>
  );
}

/**
 * السلة (handoff WebCart, WebCartEmpty; phones MCart): each line with its
 * size and height, quantity, «حذف» and «نقل إلى المفضّلة», then the summary
 * and «إتمام الطلب» - a guest is asked to sign in there, the cart kept.
 */
export function CartPage() {
  const shop = useShop();
  const { go } = useRouter();
  useTitle('السلة');
  const lines = shop.cart.lines.map((l) => ({ line: l, ...lineItem(shop.find, l.id) }));
  const user = shop.auth.user;

  const checkout = () => shop.requireLogin('checkout', () => go({ name: 'checkout' }));

  if (shop.cart.lines.length === 0) {
    const viewed = readViewed()
      .map((id) => shop.products.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 4);
    return (
      <Container className="pb-16">
        <h1 className="pt-8 font-display text-[28px] font-bold lg:text-[40px]">السلة</h1>
        <EmptyState
          icon={<ShoppingBasket />}
          title="سلتك فارغة"
          body={user ? 'تصفّح مراتبنا وأضف ما يناسبك.' : 'لديك حساب؟ سجّل دخولك لعرض المراتب التي أضفتها من جهاز آخر.'}
          action="تسوّق المراتب"
          onAction={() => go({ name: 'category', tier: null })}
        />
        {!user ? (
          <div className="-mt-10 mb-8 flex justify-center">
            <button type="button" className="text-sm font-bold underline underline-offset-4" onClick={() => shop.requireLogin('account')}>
              تسجيل الدخول
            </button>
          </div>
        ) : null}
        {viewed.length ? (
          <>
            <h2 className="mb-5 text-[21px] font-bold lg:text-[28px]">شاهدتها مؤخراً</h2>
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
              {viewed.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </>
        ) : null}
      </Container>
    );
  }

  return (
    <Container className="pb-28 lg:pb-16">
      <h1 className="pb-6 pt-8 font-display text-[28px] font-bold lg:text-[40px]">السلة</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:gap-12">
        <div className="flex flex-col">
          {!user ? (
            <div className="mb-4 flex items-start gap-3 bg-image-bg p-4 text-[15px]">
              <UserRound className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>أضفت المنتجات كزائر. سنطلب منك تسجيل الدخول برقم هاتفك عند إتمام الطلب، وتبقى السلة كما هي.</span>
            </div>
          ) : null}
          {lines.map(({ line, product, variant }) => (
            <div key={line.id} className="flex gap-4 border-b border-border py-5">
              {product ? (
                <Link to={{ name: 'product', id: product.id }} className="shrink-0">
                  <img src={photoOf(product)} alt="" className="size-24 bg-image-bg object-cover lg:size-32" />
                </Link>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                  <b className="text-base">{product ? displayName(product) : line.name}</b>
                  <Price amount={line.price * line.qty} size="row" className="text-lg" />
                </div>
                <span className="text-[13px] text-muted-foreground">{product ? describe(product, variant).split('،')[0] : ''}</span>
                <LinePartsText variant={variant} />
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <QuantityStepper value={line.qty} onChange={(q) => shop.cart.setQty(line.id, q)} label={product ? displayName(product) : line.name} />
                  <button type="button" className="text-sm font-bold underline underline-offset-4" onClick={() => shop.cart.remove(line.id)}>
                    حذف
                  </button>
                  {product ? (
                    <button
                      type="button"
                      className="text-sm font-bold underline underline-offset-4"
                      onClick={() =>
                        shop.requireLogin('favorites', () => {
                          if (!shop.wishlist.has(product.id)) shop.toggleFavorite(product);
                          shop.cart.remove(line.id);
                        })
                      }
                    >
                      نقل إلى المفضّلة
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="flex h-fit flex-col gap-3 rounded-lg border border-border p-6 lg:sticky lg:top-40">
          <b className="text-lg">ملخّص الطلب</b>
          <SummaryRow label={`المنتجات (${shop.cart.count})`} value={<Price amount={shop.cart.total} size="row" />} />
          <SummaryRow label="التوصيل" value={<span className="text-muted-foreground">يُحدَّد بالعنوان</span>} />
          <SummaryRow strong label="الإجمالي" value={<Price amount={shop.cart.total} />} />
          <Button size="store" className="mt-2 hidden lg:inline-flex" onClick={checkout}>
            إتمام الطلب
          </Button>
          <span className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden />
            الدفع عند الاستلام: نقداً أو بطاقة مصرفية أو حوالة مصرفية.
          </span>
        </aside>
      </div>

      {/* Phones: «إتمام الطلب» stays at hand (MCart). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <Button size="store" className="w-full" onClick={checkout}>
          إتمام الطلب
        </Button>
      </div>
    </Container>
  );
}
