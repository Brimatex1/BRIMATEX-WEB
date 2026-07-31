import { useState } from 'react';
import { Check, Minus, Plus, Trash2 } from 'lucide-react';

import { CheckoutForm } from '@/components/CheckoutForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';
import type { CartLine, OrderResult, User } from '@/types';

interface CartSectionProps {
  lines: CartLine[];
  total: number;
  user: User | null;
  token: string | null;
  onSetQty: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  onContinueShopping: () => void;
  onViewOrders: () => void;
}

export function CartSection({
  lines,
  total,
  user,
  token,
  onSetQty,
  onRemove,
  onClear,
  onContinueShopping,
  onViewOrders,
}: CartSectionProps) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);

  function handleSuccess(order: OrderResult) {
    setResult(order);
    setCheckingOut(false);
    onClear();
  }

  if (result) {
    return (
      <section className="container max-w-3xl animate-fade-up">
        <Card className="mt-12 border-success/40">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-success/10 text-success">
              <Check className="size-7" aria-hidden="true" />
            </div>
            <h2 className="mb-4 font-heading text-3xl font-semibold text-primary">
              تم استلام طلبك
            </h2>
            <p className="text-sm text-muted-foreground">
              رقم الطلب: <strong className="tabular text-foreground">{result.orderName}</strong>
            </p>
            {result.invoiceName && (
              <p className="text-sm text-muted-foreground">
                رقم الفاتورة:{' '}
                <strong className="tabular text-foreground">{result.invoiceName}</strong>
              </p>
            )}
            <p className="mt-4 text-lg">
              الإجمالي:{' '}
              <strong className="font-heading text-2xl tabular text-accent">
                {formatPrice(result.total)} ر.س
              </strong>
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              سنتواصل معك لتأكيد موعد التوصيل. الدفع عند الاستلام.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => {
                  setResult(null);
                  onContinueShopping();
                }}
              >
                متابعة التسوّق
              </Button>
              {user && (
                <Button
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
      </section>
    );
  }

  return (
    <section className="container max-w-3xl animate-fade-up">
      <div className="pt-12 pb-6">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-primary">
          سلة المشتريات
        </h1>
        <p className="mt-3 text-muted-foreground">
          راجع اختياراتك ثم أكمل الطلب — الدفع عند الاستلام.
        </p>
      </div>

      {lines.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="mb-6 text-muted-foreground">السلة فارغة — اختر منتجاتك من المتجر</p>
            <Button onClick={onContinueShopping}>تصفّح المنتجات</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{line.name}</p>
                      <p className="text-sm tabular text-muted-foreground">
                        {formatPrice(line.price)} ر.س للقطعة
                      </p>
                    </div>

                    <div className="inline-flex items-center gap-1 rounded-full border p-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        onClick={() => onSetQty(line.id, line.qty - 1)}
                        disabled={line.qty <= 1}
                        aria-label={`إنقاص كمية ${line.name}`}
                      >
                        <Minus aria-hidden="true" />
                      </Button>
                      <span className="min-w-8 text-center font-semibold tabular">{line.qty}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        onClick={() => onSetQty(line.id, line.qty + 1)}
                        aria-label={`زيادة كمية ${line.name}`}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </div>

                    <p className="min-w-24 text-start font-semibold tabular sm:text-end">
                      {formatPrice(line.price * line.qty)} ر.س
                    </p>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemove(line.id)}
                      aria-label={`حذف ${line.name}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="mb-6 flex items-baseline justify-between">
                <span>الإجمالي</span>
                <strong className="font-heading text-3xl font-semibold tabular">
                  {formatPrice(total)} ر.س
                </strong>
              </div>

              {!checkingOut && (
                <>
                  <Button className="w-full" onClick={() => setCheckingOut(true)}>
                    متابعة إتمام الطلب
                  </Button>
                  <Button variant="ghost" className="mt-2 w-full" onClick={onContinueShopping}>
                    متابعة التسوّق
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {checkingOut && (
            <CheckoutForm
              lines={lines}
              user={user}
              token={token}
              onSuccess={handleSuccess}
              onCancel={() => setCheckingOut(false)}
            />
          )}
        </>
      )}
    </section>
  );
}
