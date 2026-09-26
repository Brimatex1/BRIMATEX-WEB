import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, MessageCircle, Package, RefreshCw } from 'lucide-react';

import { OrderTracker } from '@/components/OrderTracker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { stageOf, type Stage } from '@/lib/orderStatus';
import { openSupport } from '@/lib/support';
import { cn, formatPrice } from '@/lib/utils';
import type { OrderSummary, Product, User } from '@/types';

interface OrdersSectionProps {
  user: User | null;
  token: string | null;
  products: Product[];
  onGoToAuth: () => void;
  onContinueShopping: () => void;
}

// The page checks again on its own while open: the team moves orders in Odoo
// and the server picks the change up every few minutes.
const REFRESH_MS = 60_000;

const STAGE_BADGE: Record<Stage, { label: string; className: string }> = {
  review: { label: 'قيد المراجعة', className: 'bg-muted text-muted-foreground' },
  confirmed: { label: 'قيد التجهيز', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  shipping: { label: 'في الطريق', className: 'bg-primary/10 text-primary' },
  done: { label: 'وصل', className: 'bg-success/10 text-success' },
  cancelled: { label: 'ملغى', className: 'bg-destructive/10 text-destructive' },
};

function sinceText(at: number | null, now: number): string {
  if (!at) return '';
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'محدّث الآن';
  if (min === 1) return 'محدّث قبل دقيقة';
  if (min === 2) return 'محدّث قبل دقيقتين';
  return min <= 10 ? `محدّث قبل ${min} دقائق` : `محدّث قبل ${min} دقيقة`;
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
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const hasOrders = useRef(false);

  /** `quiet`: a background check - keeps what is shown, and says nothing if it fails. */
  const load = useCallback(
    async (quiet = false) => {
      if (!token) {
        setOrders([]);
        setLoading(false);
        return;
      }
      if (quiet) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await api.getOrders(token);
        setOrders(data.orders);
        hasOrders.current = data.orders.length > 0;
        setUpdatedAt(Date.now());
        setError(null);
      } catch (err) {
        if (!quiet || !hasOrders.current) setError(err instanceof Error ? err.message : 'تعذّر تحميل الطلبات');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Checks again every minute while the tab is in view, and on coming back to it.
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') void load(true);
    };
    const id = window.setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  if (!user) {
    return (
      <section className="container max-w-2xl animate-fade-up py-12">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <Package className="size-7" aria-hidden="true" />
            </div>
            <h1 className="mb-3 text-2xl font-bold tracking-tight">طلباتي</h1>
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
      <div className="flex flex-col gap-3 pb-6 pt-6 sm:flex-row sm:items-end sm:justify-between md:pt-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">طلباتي</h1>
          <p className="text-sm text-muted-foreground">
            تابع كل طلب خطوة بخطوة، من التجهيز حتى يوصلك.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {updatedAt && !loading && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={() => void load(true)}
              disabled={refreshing}
              aria-label="تحديث حالة الطلبات"
            >
              <RefreshCw className={cn(refreshing && 'animate-spin')} />
              {refreshing ? 'نحدّث…' : sinceText(updatedAt, now)}
            </Button>
          )}
          {/* A late or wrong delivery is the question here - the topic comes chosen */}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => openSupport({ topic: 'order' })}>
            <MessageCircle /> فيه مشكلة في طلب؟
          </Button>
        </div>
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
          {orders.map((order) => {
            const stage = stageOf(order);
            const badge = STAGE_BADGE[stage];
            const expanded = open[order.orderName] ?? false;
            const count = order.items.reduce((n, i) => n + i.quantity, 0);
            return (
              <Card key={order.orderName} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="tabular text-lg">{order.orderName}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(order.placedAt)}
                        {order.city ? ` · ${order.city}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge className={cn('border-transparent', badge.className)}>{badge.label}</Badge>
                      <strong className="font-heading text-lg tabular text-highlight">{formatPrice(order.total)} د.ل</strong>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-sm">
                  <OrderTracker order={order} />

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 font-medium text-foreground/80 hover:text-foreground"
                      onClick={() => setOpen((o) => ({ ...o, [order.orderName]: !expanded }))}
                      aria-expanded={expanded}
                    >
                      المنتجات ({count})
                      <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                    </button>
                    {/* A cancelled order already has its "contact us" in the tracker. */}
                    {stage !== 'cancelled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => openSupport({ topic: 'order', orderName: order.orderName })}
                      >
                        <MessageCircle /> اسألنا عن هذا الطلب
                      </Button>
                    )}
                  </div>

                  {expanded && (
                    <ul className="animate-fade-up space-y-1">
                      {order.items.map((item) => (
                        <li key={item.productId} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            {nameById.get(item.productId) ?? `منتج #${item.productId}`}
                          </span>
                          <span className="tabular shrink-0">× {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
