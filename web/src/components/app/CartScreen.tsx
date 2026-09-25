import { useState } from 'react';
import { Check, HandCoins, MessageCircle, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from 'lucide-react';

import { CheckoutForm } from '@/components/CheckoutForm';
import { findProduct, ProductImage, productLinkClick } from '@/components/store/ProductCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { trackInitiateCheckout, trackPurchase } from '@/lib/pixel';
import { openSupport } from '@/lib/support';
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

const PROMISES = [
  { Icon: HandCoins, text: 'الدفع عند الاستلام' },
  { Icon: Truck, text: 'توصيل مجاني لباب بيتك' },
  { Icon: ShieldCheck, text: 'ضمان حتى 10 سنوات لبعض المنتجات' },
];

/**
 * The cart page: the lines beside an order summary, then checkout.
 *
 * Checkout itself is components/CheckoutForm.tsx - the ordering logic and
 * validation stay in one place. Purchase is tracked here, with the lines read
 * before the cart is emptied.
 */
/** A question before ordering - the size, delivery - is the moment a customer might leave instead. */
function AskBeforeOrdering() {
  return (
    <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={() => openSupport({ topic: 'product' })}>
      <MessageCircle /> عندك سؤال قبل ما تطلب؟ تواصل معنا
    </Button>
  );
}

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

  function checkout() {
    trackInitiateCheckout(lines, total);
    setCheckingOut(true);
    window.scrollTo({ top: 0 });
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 md:py-16">
        <Card className="text-center">
          <CardContent className="space-y-4 p-8">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-success/10">
              <Check className="size-8 text-success" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">تم استلام طلبك</h1>
              <p className="text-sm text-muted-foreground">سنتواصل معك لتأكيد موعد التوصيل. الدفع عند الاستلام.</p>
            </div>
            <div className="space-y-1 rounded-lg bg-muted/60 p-4 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">رقم الطلب</span>
                <strong>{result.orderName}</strong>
              </p>
              {result.invoiceName && (
                <p className="flex justify-between">
                  <span className="text-muted-foreground">رقم الفاتورة</span>
                  <strong>{result.invoiceName}</strong>
                </p>
              )}
              <Separator className="my-2" />
              <p className="flex justify-between text-base">
                <span className="text-muted-foreground">المبلغ عند الاستلام</span>
                <strong className="text-primary">{formatPrice(result.total)} د.ل</strong>
              </p>
            </div>
            {Boolean(result.discount) && <p className="text-sm text-success">وفّرت {formatPrice(result.discount!)} د.ل بالقسيمة</p>}
            <Button
              variant="link"
              className="h-auto gap-1.5 p-0"
              onClick={() => openSupport({ topic: 'order', orderName: result.orderName ?? '' })}
            >
              <MessageCircle /> تبي تعدّل حاجة في طلبك؟ تواصل معنا
            </Button>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                size="lg"
                onClick={() => {
                  setResult(null);
                  onContinueShopping();
                }}
              >
                متابعة التسوّق
              </Button>
              {user && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    onViewOrders();
                  }}
                >
                  عرض طلباتي
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (checkingOut) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
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

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center md:py-24">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-muted">
          <ShoppingBag className="size-9 text-muted-foreground" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">سلّتك فارغة</h1>
        <p className="mt-2 text-muted-foreground">اختار مرتبتك، وادفع لما توصلك.</p>
        <Button size="lg" className="mt-6" onClick={onContinueShopping}>
          تصفّح المراتب
        </Button>
      </div>
    );
  }

  return (
    // Phones: bottom padding keeps the last line clear of the fixed total bar
    <div className="mx-auto max-w-7xl px-4 pb-32 pt-6 md:px-6 md:pb-16 md:pt-10">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">سلة المشتريات</h1>
        <p className="text-sm text-muted-foreground">{count} قطعة · الدفع عند الاستلام</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <Card>
            <ul className="divide-y">
              {lines.map((line) => {
                const product = findProduct(products, line.id);
                return (
                  <li key={line.id} className="flex gap-4 p-4">
                    {product ? (
                      <a
                        href={`/product/${product.id}`}
                        onClick={(e) => productLinkClick(e, () => onOpen(product))}
                        aria-label={line.name}
                        className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ProductImage product={product} className="size-24 rounded-md border" />
                      </a>
                    ) : (
                      <span className="size-24 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-medium leading-6">{line.name}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{formatPrice(line.price)} د.ل للقطعة</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemove(line.id)}
                          aria-label={`حذف ${line.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-md border">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-e-none"
                            onClick={() => onSetQty(line.id, line.qty + 1)}
                            aria-label={`زيادة كمية ${line.name}`}
                          >
                            <Plus />
                          </Button>
                          <span className="min-w-9 text-center text-sm tabular-nums" aria-live="polite">
                            {line.qty}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-s-none"
                            disabled={line.qty <= 1}
                            onClick={() => onSetQty(line.id, line.qty - 1)}
                            aria-label={`إنقاص كمية ${line.name}`}
                          >
                            <Minus />
                          </Button>
                        </div>
                        <p className="font-bold">{formatPrice(line.price * line.qty)} د.ل</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Phones and tablets: here, as the summary with its own link is hidden */}
          <div className="lg:hidden">
            <AskBeforeOrdering />
          </div>

          {fromWishlist.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-bold">من مفضّلتك</h2>
              <Card>
                <ul className="divide-y">
                  {fromWishlist.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 p-3">
                      <ProductImage product={p} className="size-14 shrink-0 rounded-md border" />
                      <a
                        href={`/product/${p.id}`}
                        onClick={(e) => productLinkClick(e, () => onOpen(p))}
                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {p.name}
                      </a>
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onToggleWishlist(p)}>
                        إزالة
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => (p.variants?.length ? onOpen(p) : onAdd(p))}>
                        {p.variants?.length ? 'اختر المقاس' : 'أضف للسلة'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>

        {/* ── The summary: beside the lines on large screens ── */}
        <aside className="hidden lg:block">
          <Card className="sticky top-32">
            <CardHeader>
              <CardTitle className="text-lg">ملخص الطلب</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">المجموع ({count} قطعة)</span>
                  <span>{formatPrice(total)} د.ل</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">التوصيل</span>
                  <span className="text-success">مجاني</span>
                </p>
              </div>
              <Separator />
              <p className="flex justify-between text-base font-bold">
                <span>الإجمالي</span>
                <span>{formatPrice(total)} د.ل</span>
              </p>
              <Button size="lg" className="w-full" onClick={checkout}>
                إتمام الطلب
              </Button>
              <ul className="space-y-2 pt-2">
                {PROMISES.map(({ Icon, text }) => (
                  <li key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
              <Separator />
              <AskBeforeOrdering />
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* ── Phones and tablets: the total and checkout in a bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">الإجمالي · توصيل مجاني</p>
            <p className="text-lg font-bold">{formatPrice(total)} د.ل</p>
          </div>
          <Button size="lg" className="flex-1 sm:max-w-[240px]" onClick={checkout}>
            إتمام الطلب
          </Button>
        </div>
      </div>
    </div>
  );
}
