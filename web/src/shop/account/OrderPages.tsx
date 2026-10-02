import { useState } from 'react';
import { Package, Phone } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/orderStatus';
import { cn } from '@/lib/utils';
import type { OrderSummary } from '@/types';

import { displayName, lineParts } from '../catalog';
import { useTitle } from '../hooks';
import { photoOf } from '../ProductCard';
import { Link, useRouter } from '../router';
import { lineItem, useShop } from '../state';
import { EmptyState, Price, SizeText, StatusDot, Skeleton } from '../ui';
import { canCancel, currentStep, isCancelled, isPast, statusLine, timeline } from '../orders';
import { AccountLayout, useMyOrders } from './AccountLayout';

/** «بالانس 180×200 + كلاسيك» */
function itemsLine(order: OrderSummary, find: ReturnType<typeof useShop>['find']) {
  const parts = order.items.map((i) => {
    const { product, variant } = lineItem(find, i.productId);
    return { name: product ? displayName(product) : `#${i.productId}`, size: lineParts(variant).size };
  });
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? ' + ' : ''}
          {p.name}
          {i === 0 && p.size ? (
            <>
              {' '}
              <SizeText>{p.size}</SizeText>
            </>
          ) : null}
        </span>
      ))}
    </>
  );
}

/** When: the checkout's day and period, else the day it was placed. */
function whenText(order: OrderSummary): string {
  if (isCancelled(order)) return formatDay(order.placedAt) ?? '';
  if (currentStep(order) === 4) return formatDay(order.paidAt ?? order.shippedAt ?? order.placedAt) ?? '';
  return order.deliveryText ?? formatDay(order.placedAt) ?? '';
}

function OrderCard({ order, onCancel }: { order: OrderSummary; onCancel: (o: OrderSummary) => void }) {
  const shop = useShop();
  const { go } = useRouter();
  const status = statusLine(order);
  const first = lineItem(shop.find, order.items[0]?.productId ?? 0).product;
  const step = currentStep(order);
  const [busy, setBusy] = useState(false);

  async function openInvoice() {
    if (!shop.auth.token) return;
    setBusy(true);
    try {
      const { url } = await api.invoiceUrl(shop.auth.token, order.orderName);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'الفاتورة غير متاحة بعد');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border py-5 sm:flex-row sm:items-center">
      {first ? <img src={photoOf(first)} alt="" className="size-20 shrink-0 bg-image-bg object-cover" /> : <span className="size-20 shrink-0 bg-image-bg" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <StatusDot tone={status.tone}>{status.label}</StatusDot>
        <b className="text-base">
          طلب رقم <bdi dir="ltr">{order.orderName}</bdi>
        </b>
        <span className="text-sm text-muted-foreground">
          {itemsLine(order, shop.find)} · {whenText(order)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {isCancelled(order) ? null : step === 4 ? (
          <>
            {order.items[0] ? (
              <Button size="sm" className="h-10 px-5" onClick={() => go({ name: 'reviewWrite', productId: lineItem(shop.find, order.items[0].productId).product?.id ?? order.items[0].productId, orderName: order.orderName })}>
                قيّم المرتبة
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="h-10 px-5" loading={busy} onClick={() => void openInvoice()}>
              الفاتورة
            </Button>
          </>
        ) : step === 3 ? (
          <>
            <Button asChild size="sm" className="h-10 px-5">
              <Link to={{ name: 'order', orderName: order.orderName }}>تتبّع الطلب</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-10 px-5">
              <Link to={{ name: 'issue', orderName: order.orderName }}>أبلغ عن مشكلة</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild size="sm" className="h-10 px-5">
              <Link to={{ name: 'order', orderName: order.orderName }}>تفاصيل الطلب</Link>
            </Button>
            {canCancel(order) ? (
              <Button variant="outline" size="sm" className="h-10 border-destructive px-5 text-destructive hover:bg-destructive/10" onClick={() => onCancel(order)}>
                إلغاء الطلب
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

const REASONS = ['غيّرت رأيي', 'اخترت مقاساً غير مناسب', 'موعد التوصيل لا يناسبني', 'طلبت بالخطأ', 'سبب آخر'];

/** إلغاء الطلب (handoff WebCancel): a reason, the pay-on-delivery note, «تأكيد الإلغاء» in red, «تراجع». */
export function CancelDialog({ order, onClose, onDone }: { order: OrderSummary | null; onClose: () => void; onDone: () => void }) {
  const shop = useShop();
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    if (!order || !reason || !shop.auth.token) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelOrder(shop.auth.token, order.orderName, reason);
      toast.success(`أُلغي الطلب ${order.orderName}`);
      setReason(null);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إلغاء الطلب');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent role="alertdialog" className="max-w-md">
        <DialogTitle className="text-xl font-bold">إلغاء الطلب</DialogTitle>
        {order ? (
          <DialogDescription className="text-[15px]">
            طلب <bdi dir="ltr">#{order.orderName}</bdi> · {statusLine(order).label} · <Price amount={order.total} size="row" />
          </DialogDescription>
        ) : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-bold">ما سبب الإلغاء؟</legend>
          {REASONS.map((r) => (
            <label key={r} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-[15px]', reason === r ? 'border-2 border-foreground p-[11px]' : 'border-border')}>
              <input type="radio" name="cancel-reason" className="size-5 accent-foreground" checked={reason === r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </fieldset>
        <p className="rounded-lg bg-image-bg p-3 text-sm text-muted-foreground">الدفع يتم عند الاستلام، فلا توجد مبالغ للاسترداد. يمكن إلغاء الطلب حتى خروجه للتوصيل.</p>
        <Link to={{ name: 'help' }} className="text-sm font-bold text-brand-text underline underline-offset-4" onClick={onClose}>
          تريد تغيير المقاس بدل الإلغاء؟
        </Link>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button variant="destructive" size="store" className="flex-1" disabled={!reason} loading={busy} onClick={() => void confirm()}>
            تأكيد الإلغاء
          </Button>
          <Button variant="outline" size="store" className="flex-1" onClick={onClose}>
            تراجع
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** طلباتي (handoff WebAccount): الحالية / السابقة, each order with its status, items, appointment and actions. */
export function OrdersPage() {
  useTitle('طلباتي');
  const { orders, error, reload } = useMyOrders();
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const [cancelling, setCancelling] = useState<OrderSummary | null>(null);
  const { go } = useRouter();
  const list = (orders ?? []).filter((o) => (tab === 'past' ? isPast(o) : !isPast(o)));

  return (
    <AccountLayout section="orders">
      <h1 className="pb-5 font-display text-[28px] font-bold lg:text-[36px]">طلباتي</h1>
      <div role="tablist" aria-label="الطلبات" className="mb-2 inline-flex gap-1 rounded-full bg-image-bg p-1">
        {(['current', 'past'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('h-10 rounded-full px-6 text-[15px] font-bold', tab === t ? 'bg-foreground text-background' : 'hover:bg-background')}>
            {t === 'current' ? 'الحالية' : 'السابقة'}
          </button>
        ))}
      </div>
      {orders === null ? (
        <div className="flex flex-col gap-4 pt-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : error && !orders.length ? (
        <EmptyState icon={<Package />} title="تعذّر تحميل الطلبات" body={error} action="إعادة المحاولة" onAction={() => void reload()} />
      ) : list.length ? (
        list.map((o) => <OrderCard key={o.orderName} order={o} onCancel={setCancelling} />)
      ) : (
        <EmptyState
          icon={<Package />}
          title={tab === 'current' ? 'لا توجد طلبات حالية' : 'لا توجد طلبات سابقة'}
          body={tab === 'current' ? 'عندما تطلب مرتبة ستتابع حالتها من هنا خطوة بخطوة.' : 'الطلبات المسلّمة والملغاة تظهر هنا.'}
          action="تسوّق المراتب"
          onAction={() => go({ name: 'category', tier: null })}
        />
      )}
      <CancelDialog order={cancelling} onClose={() => setCancelling(null)} onDone={() => void reload()} />
    </AccountLayout>
  );
}

/** تفاصيل الطلب (handoff WebOrder): status, actions, the five steps, products, delivery and payment, contact. */
export function OrderPage({ orderName }: { orderName: string }) {
  const shop = useShop();
  useTitle(`طلب ${orderName}`);
  const { orders, reload } = useMyOrders();
  const [cancelling, setCancelling] = useState<OrderSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const order = orders?.find((o) => o.orderName === orderName) ?? null;

  async function openInvoice() {
    if (!shop.auth.token || !order) return;
    setBusy(true);
    try {
      const { url } = await api.invoiceUrl(shop.auth.token, order.orderName);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'الفاتورة غير متاحة بعد');
    } finally {
      setBusy(false);
    }
  }

  const crumbs = [{ label: 'طلباتي', to: { name: 'account' as const, section: 'orders' as const } }, { label: `طلب #${orderName}` }];
  if (!order) {
    return (
      <AccountLayout section="orders" crumbs={crumbs}>
        {orders === null ? <Skeleton className="h-64" /> : <EmptyState icon={<Package />} title="لم نجد هذا الطلب في حسابك" />}
      </AccountLayout>
    );
  }
  const status = statusLine(order);
  const step = currentStep(order);
  const steps = timeline(order);

  return (
    <AccountLayout section="orders" crumbs={crumbs}>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-bold lg:text-[36px]">
            طلب <bdi dir="ltr">#{order.orderName}</bdi>
          </h1>
          <StatusDot tone={status.tone}>
            {status.label}
            {order.deliveryText && step < 4 && !isCancelled(order) ? ` · ${order.deliveryText}` : ''}
          </StatusDot>
        </div>
        <div className="flex flex-wrap gap-2">
          {isCancelled(order) ? null : canCancel(order) ? (
            <Button variant="outline" size="sm" className="h-10 border-destructive px-5 text-destructive hover:bg-destructive/10" onClick={() => setCancelling(order)}>
              إلغاء الطلب
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="h-10 px-5">
              <Link to={{ name: 'issue', orderName: order.orderName }}>أبلغ عن مشكلة</Link>
            </Button>
          )}
          {step >= 3 && !isCancelled(order) ? (
            <Button variant="outline" size="sm" className="h-10 px-5" loading={busy} onClick={() => void openInvoice()}>
              الفاتورة (PDF)
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-10 xl:grid-cols-[1fr_1fr]">
        {!isCancelled(order) ? (
          <section className="flex flex-col gap-4">
            <b className="text-lg">حالة الطلب</b>
            <ol className="flex flex-col">
              {steps.map((s, i) => (
                <li key={s.key} className="flex gap-4">
                  <span className="flex flex-col items-center">
                    <span
                      className={cn(
                        'mt-1 grid size-4 shrink-0 place-items-center rounded-full',
                        s.state === 'done' ? 'bg-success' : s.state === 'current' ? 'bg-info ring-4 ring-info/25' : 'border-2 border-border bg-background'
                      )}
                      aria-hidden
                    />
                    {i < steps.length - 1 ? <span className={cn('w-0.5 flex-1', s.state === 'done' ? 'bg-success' : 'bg-border')} aria-hidden /> : null}
                  </span>
                  <span className="flex flex-col pb-6">
                    <b className={cn('text-[15px]', s.state === 'upcoming' && 'text-muted-foreground')}>{s.label}</b>
                    {s.detail ? <span className="text-[13px] text-muted-foreground">{s.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
            {!canCancel(order) && step >= 3 ? <span className="text-sm text-muted-foreground">لا يمكن إلغاء الطلب بعد خروجه للتوصيل.</span> : null}
          </section>
        ) : null}

        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <b className="text-lg">المنتجات</b>
            {order.items.map((it) => {
              const { product, variant } = lineItem(shop.find, it.productId);
              const parts = lineParts(variant);
              return (
                <div key={it.productId} className="flex items-center gap-3">
                  {product ? <img src={photoOf(product)} alt="" className="size-16 shrink-0 bg-image-bg object-cover" /> : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="text-[15px]">{product ? displayName(product) : `#${it.productId}`}</b>
                    <span className="text-[13px] text-muted-foreground">
                      {parts.size ? (
                        <>
                          <SizeText>{parts.size}</SizeText> سم ·{' '}
                        </>
                      ) : null}
                      {parts.height ? `ارتفاع ${parts.height} سم · ` : ''}الكمية {it.quantity}
                    </span>
                  </span>
                  {variant ? <Price amount={variant.price * it.quantity} size="row" /> : null}
                </div>
              );
            })}
          </section>
          <section className="flex flex-col gap-2.5 rounded-lg border border-border p-5 text-[15px]">
            <b className="text-lg">التوصيل والدفع</b>
            <Row label="العنوان" value={order.method === 'pickup' ? 'صالة العرض · حي الأندلس' : `${order.city} · ${order.address.split('،')[0]}`} />
            {order.deliveryText ? <Row label="الموعد" value={order.deliveryText} /> : null}
            <Row label="الدفع" value={order.paymentText ? `${order.paymentText} عند الاستلام` : 'عند الاستلام'} />
            <div className="flex items-center justify-between border-t border-border pt-3 font-bold">
              <span>الإجمالي</span>
              <Price amount={order.total} />
            </div>
          </section>
          <div className="flex items-center justify-between gap-4 bg-image-bg p-4">
            <span className="text-[15px]">سؤال عن طلبك؟</span>
            <Button asChild variant="outline" size="sm" className="h-10 gap-2 px-5">
              <Link to={{ name: 'help' }}>
                <Phone className="size-4" />
                اتصل بنا
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <CancelDialog order={cancelling} onClose={() => setCancelling(null)} onDone={() => void reload()} />
    </AccountLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end">{value}</span>
    </div>
  );
}
