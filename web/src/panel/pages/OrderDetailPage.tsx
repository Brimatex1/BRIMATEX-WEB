import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { panelApi, PanelError, type PanelMe, type PanelOrderDetail } from '../api';
import { PageBody } from '../Shell';
import { customerHref, Link, sectionHref } from '../router';
import { Button, buttonClass, Card, CardHead, CHANNEL_META, ErrorCard, formatPhone, Icon, money, Pill, Skeleton, STATUS_META, Thumb } from '../ui';

/** «5 أكتوبر 2026 · 11:33 ص» on Libya's clock - the time Odoo shows. */
export function libyaMoment(iso: string | null | undefined, withYear = false): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('ar-LY', { timeZone: 'Africa/Tripoli', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) });
  const time = d.toLocaleTimeString('ar-LY', { timeZone: 'Africa/Tripoli', hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** WhatsApp's address for a Libyan phone (0912345678 → 218912345678). */
export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return `https://wa.me/218${digits.slice(-9)}`;
}

/** The stages, top to bottom: a dot per stage, filled when done, ringed when current. */
function Timeline({ steps }: { steps: PanelOrderDetail['timeline'] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const cancelled = s.key === 'cancelled';
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? <span aria-hidden className={cn('absolute start-[11px] top-6 h-[calc(100%-20px)] w-0.5', s.state === 'done' ? 'bg-dark-ocean' : 'bg-[#E4E6EE]')} /> : null}
            <span
              aria-hidden
              className={cn(
                'relative grid size-6 shrink-0 place-items-center rounded-full',
                cancelled ? 'bg-[#A12020] text-white' : s.state === 'done' ? 'bg-dark-ocean text-white' : s.state === 'current' ? 'bg-white ring-2 ring-dark-ocean' : 'bg-[#F4F4F6] ring-1 ring-[#E4E6EE]'
              )}
            >
              {s.state === 'done' ? <Icon name="check" size={14} /> : cancelled ? <Icon name="close" size={14} /> : null}
            </span>
            <span className="flex flex-col">
              <span className={cn('text-[14.5px]', s.state === 'todo' ? 'text-[#8A8D9A]' : 'font-semibold text-[#16161F]', cancelled && 'text-[#A12020]')}>
                {s.label}
                {s.state === 'current' && !cancelled ? <span className="ms-2 text-[12px] font-semibold text-dark-ocean">← المرحلة الحالية</span> : null}
              </span>
              {s.at ? <span className="text-[12.5px] text-[#5F6373]">{libyaMoment(s.at, true)}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-[#E4E6EE] py-2.5 text-[14px] first:border-t-0 first:pt-0">
      <span className="shrink-0 text-[#5F6373]">{label}</span>
      <span className="text-end">{children}</span>
    </div>
  );
}

/**
 * One order (/admin/orders/:name): where it has reached, what is in it, where
 * it goes and who ordered it - with «تأكيد» while it is new, Odoo one click
 * away, and the customer's own page.
 */
export function OrderDetailPage({ me, token, name, onBadgeChange }: { me: PanelMe; token: string; name: string; onBadgeChange: (delta: number) => void }) {
  const [order, setOrder] = useState<PanelOrderDetail | null>(null);
  const [canConfirm, setCanConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    panelApi
      .order(token, name)
      .then((d) => {
        setOrder(d.order);
        setCanConfirm(d.canConfirm);
      })
      .catch((err: Error) => setError(err.message));
  }, [token, name]);
  useEffect(load, [load]);
  useEffect(() => {
    document.title = `الطلب ${name} · إدارة بريماتكس`;
  }, [name]);

  async function confirm() {
    setBusy(true);
    try {
      await panelApi.confirm(token, name);
      onBadgeChange(-1);
      toast.success(`تم تأكيد الطلب ${name}`);
      load();
    } catch (err) {
      toast.error(err instanceof PanelError ? err.message : 'تعذّر التأكيد');
    } finally {
      setBusy(false);
    }
  }

  const wa = order ? whatsappHref(order.customer.phone) : null;
  const subtotal = order ? order.items.reduce((s, i) => s + (i.lineTotal ?? 0), 0) : 0;

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-[#E4E6EE] bg-white px-4 py-4 sm:px-8 lg:h-[76px] lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:py-0">
        <div className="flex flex-col gap-0.5">
          <Link href={sectionHref('orders')} className="text-[13px] font-semibold text-[#5F6373] no-underline hover:text-dark-ocean">
            → الطلبات
          </Link>
          <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-display text-[22px] font-bold">
            الطلب #{name}
            {order ? <Pill tone={STATUS_META[order.status].tone}>{STATUS_META[order.status].label}</Pill> : null}
          </h1>
        </div>
        {order ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {order.odooLink ? (
              <a href={order.odooLink} target="_blank" rel="noreferrer" className={buttonClass('outline')}>
                <Icon name="external" size={18} /> فتح في أودو
              </a>
            ) : null}
            {canConfirm && me.canConfirm && order.status === 'new' ? (
              <Button onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
                <Icon name="check" size={18} /> تأكيد الطلب
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <PageBody>
        {error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : !order ? (
          <div className="grid gap-[22px] lg:grid-cols-[1fr_360px]">
            <Skeleton className="h-[360px]" />
            <Skeleton className="h-[360px]" />
          </div>
        ) : (
          <div className="grid items-start gap-[22px] lg:grid-cols-[1fr_360px]">
            <div className="flex min-w-0 flex-col gap-[22px]">
              <Card>
                <CardHead title="المنتجات" aside={<span className="text-[13px] text-[#5F6373]">{CHANNEL_META[order.channel].row}</span>} />
                <ul className="m-0 flex list-none flex-col p-0">
                  {order.items.map((i, n) => (
                    <li key={`${i.productId}-${n}`} className="flex items-center gap-3 border-t border-[#E4E6EE] py-3 first:border-t-0 first:pt-0">
                      <Thumb src={i.image} size={56} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <b className="text-[14.5px]">{i.name}</b>
                        <span className="text-[13px] text-[#5F6373]">
                          {[i.size, `الكمية ${i.quantity}`, i.unitPrice != null ? `${money(i.unitPrice)} للقطعة` : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {i.lineTotal != null ? <b className="whitespace-nowrap text-[14.5px]">{money(i.lineTotal)}</b> : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-col border-t border-[#E4E6EE] pt-3">
                  {subtotal && Math.abs(subtotal - order.total) > 0.5 ? <Row label="مجموع المنتجات">{money(subtotal)}</Row> : null}
                  <Row label="التوصيل">مجاني</Row>
                  <Row label="الإجمالي">
                    <b className="text-[16px]">{money(order.total)}</b>
                  </Row>
                  <Row label="الدفع">{order.payment ? `عند الاستلام — ${order.payment}` : 'عند الاستلام'}</Row>
                </div>
              </Card>

              <Card>
                <CardHead title={order.pickup ? 'الاستلام' : 'التوصيل'} />
                <div className="flex flex-col">
                  <Row label={order.pickup ? 'الطريقة' : 'الموعد'}>{order.pickup ? 'استلام من صالة العرض' : order.delivery || '—'}</Row>
                  {!order.pickup ? <Row label="المدينة">{order.city || '—'}</Row> : null}
                  {!order.pickup ? <Row label="العنوان">{order.address || '—'}</Row> : null}
                </div>
                {order.notes.length ? (
                  <div className="mt-3 rounded-xl bg-[#F5F6FA] p-3.5 text-[13.5px] leading-relaxed">
                    <b className="mb-1 block text-[13px] text-[#5F6373]">ملاحظات الطلب</b>
                    {order.notes.map((l) => (
                      <p key={l} className="m-0">
                        {l}
                      </p>
                    ))}
                  </div>
                ) : null}
              </Card>
            </div>

            <div className="flex flex-col gap-[22px]">
              <Card>
                <CardHead title="مراحل الطلب" />
                <Timeline steps={order.timeline} />
                <p className="mb-0 mt-4 text-[12.5px] leading-relaxed text-[#5F6373]">
                  وقت الطلب هو وقت وصوله إلينا. أودو يغيّر «تاريخ الطلب» إلى وقت التأكيد عند تأكيده — وهو وقت «تم التأكيد» هنا.
                </p>
              </Card>

              <Card>
                <CardHead
                  title="العميل"
                  aside={
                    order.customerKey ? (
                      <Link href={customerHref(order.customerKey)} className="text-[13.5px] font-semibold text-dark-ocean no-underline hover:underline">
                        صفحة العميل ←
                      </Link>
                    ) : null
                  }
                />
                <div className="flex flex-col gap-1">
                  <b className="text-[15px]">{order.customer.name || '—'}</b>
                  <bdi dir="ltr" className="text-end text-[14px] text-[#5F6373]">
                    {formatPhone(order.customer.phone)}
                  </bdi>
                  <span className="text-[13.5px] text-[#5F6373]">{order.customerKey?.startsWith('u:') ? 'له حساب في الموقع أو التطبيق' : 'طلب بدون حساب'}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`tel:${order.customer.phone}`} className={buttonClass('outline', 'sm')}>
                    <Icon name="phone" size={16} /> اتصال
                  </a>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noreferrer" className={buttonClass('outline', 'sm')}>
                      <Icon name="chat" size={16} /> واتساب
                    </a>
                  ) : null}
                </div>
              </Card>

              <Card className="text-[13.5px]">
                <Row label="رقم الطلب">#{order.orderName}</Row>
                {order.invoiceName ? <Row label="الفاتورة">{order.invoiceName}</Row> : null}
                <Row label="وقت الطلب">{libyaMoment(order.placedAt, true) || '—'}</Row>
              </Card>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
