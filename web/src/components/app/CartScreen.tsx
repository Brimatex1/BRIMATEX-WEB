import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';

import { CheckoutForm } from '@/components/CheckoutForm';
import {
  AppCard,
  CircleIconButton,
  EmptyCircle,
  ProductImage,
  SectionHeader,
  Stepper,
  StickyBar,
  WishRow,
} from '@/components/app/ui';
import { trackInitiateCheckout, trackPurchase } from '@/lib/pixel';
import { formatPrice } from '@/lib/utils';
import type { CartLine, OrderResult, Product, User, Voucher } from '@/types';

interface CartScreenProps {
  lines: CartLine[];
  total: number;
  products: Product[];
  wishlistIds: number[];
  user: User | null;
  token: string | null;
  onSetQty: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  /** Usable vouchers, offered at checkout. */
  vouchers: Voucher[];
  onAdd: (product: Product) => void;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onContinueShopping: () => void;
  onViewOrders: () => void;
}

/**
 * The cart - the iOS app's cart screen (brimatex-ios/src/screens/
 * CartScreen.tsx): each line as a framed picture with a delete button, the
 * name, a quantity stepper and the line total; "from your wishlist" under
 * it; the total and "checkout" in a bar at the bottom.
 *
 * Checkout itself is the website's form (components/CheckoutForm.tsx), dressed
 * by the app skin - the ordering logic and validation stay in one place.
 * Purchase is tracked here, with the lines read before the cart is emptied.
 */
export function CartScreen({
  lines,
  total,
  products,
  wishlistIds,
  user,
  token,
  onSetQty,
  onRemove,
  onClear,
  vouchers,
  onAdd,
  onOpen,
  onToggleWishlist,
  onContinueShopping,
  onViewOrders,
}: CartScreenProps) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);

  // A line's id may be a size's id: its picture is the parent product's.
  const productFor = (id: number) =>
    products.find((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id));
  const count = lines.reduce((n, l) => n + l.qty, 0);

  const inCart = new Set(lines.map((l) => l.id));
  const fromWishlist = products
    .filter((p) => wishlistIds.includes(p.id) && !inCart.has(p.id) && !(p.variants ?? []).some((v) => inCart.has(v.id)))
    .slice(0, 6);

  function handleSuccess(order: OrderResult) {
    // Read before onClear() empties the cart - the Pixel needs the purchased items.
    trackPurchase(order, lines);
    setResult(order);
    setCheckingOut(false);
    onClear();
    window.scrollTo({ top: 0 });
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8 md:py-14">
        <AppCard className="text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-app-success-bg">
            <Check className="size-8 text-app-success" aria-hidden="true" />
          </span>
          <h2 className="text-2xl font-bold text-app-ocean">تم استلام طلبك</h2>
          <p className="mt-3 text-sm text-app-muted">
            رقم الطلب: <strong className="text-app-text">{result.orderName}</strong>
          </p>
          {result.invoiceName && (
            <p className="text-sm text-app-muted">
              رقم الفاتورة: <strong className="text-app-text">{result.invoiceName}</strong>
            </p>
          )}
          <p className="mt-4 text-[26px] font-bold text-app-ocean">{formatPrice(result.total)} د.ل</p>
          {Boolean(result.discount) && (
            <p className="text-sm text-app-success">وفّرت {formatPrice(result.discount!)} د.ل بالقسيمة</p>
          )}
          <p className="mt-3 text-sm text-app-muted">سنتواصل معك لتأكيد موعد التوصيل. الدفع عند الاستلام.</p>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                onContinueShopping();
              }}
              className="w-full rounded-full bg-app-ocean py-4 text-[17px] font-semibold text-white"
            >
              متابعة التسوّق
            </button>
            {user && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  onViewOrders();
                }}
                className="w-full rounded-full border-[1.5px] border-app-ocean py-3.5 text-[17px] font-semibold text-app-ocean"
              >
                عرض طلباتي
              </button>
            )}
          </div>
        </AppCard>
      </div>
    );
  }

  if (checkingOut) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-2 md:px-8 md:pt-8">
        <CheckoutForm
          lines={lines}
          user={user}
          token={token}
          onSuccess={handleSuccess}
          onCancel={() => setCheckingOut(false)}
          vouchers={vouchers}
        />
      </div>
    );
  }

  return (
    // Bottom padding keeps the last line clear of the fixed total bar (phones)
    <div className="mx-auto max-w-3xl px-5 pb-32 pt-4 md:px-8 md:pb-16 md:pt-10">
      <p className="mb-5 text-sm text-app-muted">{count > 0 ? `${count} قطعة · الدفع عند الاستلام` : ''}</p>

      {lines.length === 0 ? (
        <EmptyCircle text="سلّتك فارغة">
          <button
            type="button"
            onClick={onContinueShopping}
            className="mt-6 rounded-full bg-app-ocean px-8 py-3.5 text-[17px] font-semibold text-white"
          >
            تصفّح المنتجات
          </button>
        </EmptyCircle>
      ) : (
        lines.map((line) => {
          const product = productFor(line.id);
          return (
            <div key={line.id} className="mb-5 flex gap-4">
              <div className="relative w-[120px] shrink-0 rounded-[14px] bg-white p-[5px] shadow-app-raised">
                <button
                  type="button"
                  onClick={() => product && onOpen(product)}
                  aria-label={line.name}
                  className="block w-full"
                >
                  {product ? (
                    <ProductImage product={product} letterSize={44} className="aspect-square rounded-[10px]" />
                  ) : (
                    <span className="block aspect-square rounded-[10px] bg-app-nebula" />
                  )}
                </button>
                <CircleIconButton
                  Icon={Trash2}
                  label={`حذف ${line.name}`}
                  tone="danger"
                  onClick={() => onRemove(line.id)}
                  className="absolute bottom-3 start-3"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <p className="line-clamp-2 text-base leading-6 text-app-text">{line.name}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Stepper value={line.qty} onChange={(q) => onSetQty(line.id, q)} label={line.name} />
                  <p className="text-xl font-bold text-app-text">{formatPrice(line.price * line.qty)} د.ل</p>
                </div>
              </div>
            </div>
          );
        })
      )}

      {fromWishlist.length > 0 && (
        <section className="mt-4">
          <SectionHeader title="من مفضّلتك" />
          {fromWishlist.map((p) => (
            <WishRow
              key={p.id}
              product={p}
              onOpen={() => onOpen(p)}
              onRemove={() => onToggleWishlist(p)}
              onAdd={() => (p.variants?.length ? onOpen(p) : onAdd(p))}
            />
          ))}
        </section>
      )}

      <StickyBar>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-app-muted">الإجمالي</p>
            <p className="text-xl font-bold text-app-text">{formatPrice(total)} د.ل</p>
          </div>
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={() => {
              trackInitiateCheckout(lines, total);
              setCheckingOut(true);
              window.scrollTo({ top: 0 });
            }}
            className="max-w-[220px] flex-1 rounded-full bg-app-ocean py-4 text-[17px] font-semibold text-white disabled:opacity-45"
          >
            إتمام الطلب
          </button>
        </div>
      </StickyBar>
    </div>
  );
}
