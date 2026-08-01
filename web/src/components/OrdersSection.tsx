import { useCallback, useEffect, useState } from 'react';
import { Package } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import type { OrderSummary, Product, User } from '@/types';

interface OrdersSectionProps {
  user: User | null;
  token: string | null;
  products: Product[];
  onGoToAuth: () => void;
  onContinueShopping: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function OrdersSection({
  user,
  token,
  products,
  onGoToAuth,
  onContinueShopping,
}: OrdersSectionProps) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOrders(token);
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <section className="container max-w-2xl animate-fade-up py-12">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <Package className="size-7" aria-hidden="true" />
            </div>
            <h1 className="mb-3 font-heading text-2xl font-semibold text-primary">طلباتي</h1>
            <p className="mb-6 text-muted-foreground">
              سجّل الدخول لمتابعة طلباتك وفواتيرك.
            </p>
            <Button onClick={onGoToAuth}>تسجيل الدخول</Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return (
    <section className="container max-w-3xl animate-fade-up">
      <div className="pt-12 pb-6">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-primary">طلباتي</h1>
        <p className="mt-3 text-muted-foreground">
          الطلبات التي أنشأتها وأنت مسجّل الدخول تظهر هنا مع حالة الفاتورة.
        </p>
      </div>

      {loading && (
        <div className="space-y-4 pb-12">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="gap-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="py-16 text-center">
          <p className="mb-4 text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="mb-6 text-muted-foreground">لا توجد طلبات بعد.</p>
            <Button onClick={onContinueShopping}>تصفّح المنتجات</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="space-y-4 pb-12">
          {orders.map((order) => (
            <Card key={order.orderName}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="tabular text-lg">{order.orderName}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(order.placedAt)}
                    </p>
                  </div>
                  <Badge variant={order.paymentStatus === 'paid' ? 'success' : 'secondary'}>
                    {order.paymentStatus === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1">
                  {order.items.map((item) => (
                    <li key={item.productId} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {nameById.get(item.productId) ?? `منتج #${item.productId}`}
                      </span>
                      <span className="tabular shrink-0">× {item.quantity}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-muted-foreground">الإجمالي</span>
                  <strong className="font-heading text-xl tabular text-accent">
                    {formatPrice(order.total)} د.ل
                  </strong>
                </div>

                <dl className="grid gap-1 border-t pt-3 text-muted-foreground sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt>رقم الفاتورة:</dt>
                    <dd className="tabular text-foreground">{order.invoiceName}</dd>
                  </div>
                  {order.city && (
                    <div className="flex gap-2">
                      <dt>المدينة:</dt>
                      <dd className="text-foreground">{order.city}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
