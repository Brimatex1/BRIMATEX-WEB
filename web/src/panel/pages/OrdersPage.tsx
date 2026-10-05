import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { panelApi, PanelError, type Channel, type OrderStatus, type OrdersPage as OrdersData, type OrdersQuery, type PanelMe, type PanelOrder, type Period } from '../api';
import { useQueryUpdater } from '../router';
import { PageBody, PageHeader } from '../Shell';
import { Button, CHANNEL_META, ErrorCard, Icon, Pill, Skeleton, STATUS_META, formatPhone, money, ordersCount } from '../ui';

const STATUS_CHIPS: (OrderStatus | 'all')[] = ['all', 'new', 'confirmed', 'preparing', 'out', 'delivered', 'cancelled'];
const CHANNEL_OPTIONS: { value: Channel | 'all'; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'أندرويد' },
  { value: 'app', label: 'التطبيق (كل المنصات)' },
  { value: 'web', label: 'الموقع' },
];
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: '7d', label: 'آخر 7 أيام' },
  { value: '30d', label: 'آخر 30 يوماً' },
  { value: 'all', label: 'الكل' },
];
const PER_PAGE = [8, 12, 20];

/**
 * When the order was placed, on Libya's clock whatever the device's - the
 * time Odoo shows as the order's date («5 أكتوبر · 11:33 ص»). The table used
 * to show only the delivery date the customer chose, which read as the
 * order's own time and never matched Odoo's.
 */
function placedText(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('ar-LY', { timeZone: 'Africa/Tripoli', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('ar-LY', { timeZone: 'Africa/Tripoli', hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** The list's state lives in the address, so a filtered view can be shared or reloaded. */
function readQuery(search: string): OrdersQuery {
  const p = new URLSearchParams(search);
  const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    status: pick(p.get('status'), STATUS_CHIPS, 'all'),
    channel: pick(p.get('channel'), CHANNEL_OPTIONS.map((o) => o.value), 'all'),
    city: p.get('city') ?? '',
    // «الكل» by default, newest first: «اليوم» hid the new orders still waiting from earlier days.
    period: pick(p.get('period'), PERIOD_OPTIONS.map((o) => o.value), 'all'),
    q: p.get('q') ?? '',
    page: Math.max(1, Number(p.get('page')) || 1),
    perPage: PER_PAGE.includes(Number(p.get('perPage'))) ? Number(p.get('perPage')) : 8,
  };
}

/**
 * الطلبات (AdminOrders): follow-up and quick confirmation. «تأكيد» confirms
 * the sale order in Odoo (and the customer gets «تم التأكيد»); everything else
 * is done in Odoo, one click away.
 */
export function OrdersPage({ me, token, search, onBadgeChange }: { me: PanelMe; token: string; search: string; onBadgeChange: (delta: number) => void }) {
  const query = useMemo(() => readQuery(search), [search]);
  const setQuery = useQueryUpdater();
  const [data, setData] = useState<OrdersData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    panelApi
      .orders(token, query)
      .then((d) => {
        setData(d);
        // Only new orders on this page can stay selected.
        setSelected((prev) => new Set(d.orders.filter((o) => o.status === 'new' && prev.has(o.orderName)).map((o) => o.orderName)));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, query]);
  useEffect(load, [load]);

  const newOnPage = data?.orders.filter((o) => o.status === 'new') ?? [];
  const allNewSelected = newOnPage.length > 0 && newOnPage.every((o) => selected.has(o.orderName));

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function confirmNow(names: string[]) {
    setBusy(true);
    const done: string[] = [];
    let failure: string | null = null;
    for (const name of names) {
      try {
        await panelApi.confirm(token, name);
        done.push(name);
      } catch (err) {
        failure = `${name}: ${err instanceof PanelError ? err.message : 'تعذّر التأكيد'}`;
        // The rest may still go through - one refusal (already confirmed elsewhere) is not a stop.
      }
    }
    setBusy(false);
    setConfirming(null);
    setSelected(new Set());
    if (done.length) {
      onBadgeChange(-done.length);
      toast.success(done.length === 1 ? `تم تأكيد الطلب ${done[0]}` : `تم تأكيد ${ordersCount(done.length)}`);
    }
    if (failure) toast.error(failure);
    load();
  }

  const from = data && data.total ? (data.page - 1) * data.perPage + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.perPage) : 0;

  return (
    <>
      <PageHeader
        section="orders"
        me={me}
        search={{ value: query.q, onSubmit: (q) => setQuery({ q, page: null, period: null }) }}
        action={
          me.canConfirm ? (
            <Button size="sm" disabled={selected.size === 0 || busy} onClick={() => setConfirming([...selected])}>
              <Icon name="check" size={18} />
              تأكيد المحدد{selected.size ? ` (${selected.size})` : ''}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <div className="flex items-start gap-2.5 rounded-xl bg-[#EEF0FA] px-3.5 py-3 text-[13.5px] leading-relaxed text-dark-ocean">
          <Icon name="warning" size={18} className="mt-0.5" />
          <span>الطلب يُعالَج في أودو (المبيعات ← التسليم). هذه الصفحة للمتابعة وتأكيد الطلبات الجديدة بسرعة. «تأكيد» هنا يؤكد أمر البيع في أودو ويرسل إشعار «تم التأكيد» للعميل.</span>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="الحالة">
            {STATUS_CHIPS.map((s) => {
              const active = query.status === s;
              const count = data?.counts[s];
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setQuery({ status: s === 'all' ? null : s, page: null })}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors',
                    active ? 'bg-dark-ocean text-white' : 'bg-white text-[#16161F] shadow-[inset_0_0_0_1px_#E4E6EE] hover:bg-[#F5F6FA]'
                  )}
                >
                  {s === 'all' ? 'الكل' : STATUS_META[s].label}
                  <span className="opacity-70">{count ?? '–'}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2.5 xl:flex xl:items-end">
            <Filter label="القناة" value={query.channel} onChange={(v) => setQuery({ channel: v === 'all' ? null : v, page: null })} options={CHANNEL_OPTIONS} />
            <Filter
              label="المدينة"
              value={query.city || 'all'}
              onChange={(v) => setQuery({ city: v === 'all' ? null : v, page: null })}
              options={[{ value: 'all', label: 'الكل' }, ...(data?.cities ?? (query.city ? [query.city] : [])).map((c) => ({ value: c, label: c }))]}
            />
            <Filter label="الفترة" value={query.period} onChange={(v) => setQuery({ period: v === 'all' ? null : v, page: null })} options={PERIOD_OPTIONS} />
          </div>
        </div>

        {error ? <ErrorCard message={error} onRetry={load} /> : null}

        <div className={cn('rounded-2xl border border-[#E4E6EE] bg-white p-3 transition-opacity', loading && data ? 'opacity-60' : '')} aria-busy={loading}>
          {/* Wide screens: the table. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-right">
              <thead>
                <tr>
                  {me.canConfirm ? (
                    <th className="w-8 px-2 pb-3">
                      <input
                        type="checkbox"
                        aria-label="تحديد كل الطلبات الجديدة"
                        className="size-4 accent-dark-ocean"
                        disabled={newOnPage.length === 0}
                        checked={allNewSelected}
                        onChange={() => setSelected(allNewSelected ? new Set() : new Set(newOnPage.map((o) => o.orderName)))}
                      />
                    </th>
                  ) : null}
                  {['رقم الطلب ووقته', 'العميل', 'القناة', 'المدينة', 'المنتجات', 'الإجمالي', 'الدفع', 'الحالة', 'موعد التوصيل', ''].map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-3 pb-3 text-[12.5px] font-semibold text-[#5F6373]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data && !loading && data.orders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="border-t border-[#E4E6EE] px-3 py-10 text-center text-sm text-[#5F6373]">
                      لا طلبات تطابق هذه المرشّحات.
                    </td>
                  </tr>
                ) : null}
                {!data
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={11} className="border-t border-[#E4E6EE] p-3">
                          <Skeleton className="h-8 w-full" />
                        </td>
                      </tr>
                    ))
                  : data.orders.map((o) => (
                      <tr key={o.orderName} className={cn('text-sm', selected.has(o.orderName) && 'bg-[#F7F8FC]')}>
                        {me.canConfirm ? (
                          <td className="border-t border-[#E4E6EE] px-2 py-3">
                            {o.status === 'new' ? (
                              <input
                                type="checkbox"
                                aria-label={`تحديد ${o.orderName}`}
                                className="size-4 accent-dark-ocean"
                                checked={selected.has(o.orderName)}
                                onChange={() => toggle(o.orderName)}
                              />
                            ) : null}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap border-t border-[#E4E6EE] p-3">
                          <b>#{o.orderName}</b>
                          {o.placedAt ? <span className="block text-[12px] text-[#5F6373]">{placedText(o.placedAt)}</span> : null}
                        </td>
                        <td className="border-t border-[#E4E6EE] p-3">
                          <span className="flex flex-col">
                            <span className="whitespace-nowrap">{o.customer.name || '—'}</span>
                            <bdi dir="ltr" className="whitespace-nowrap text-right text-[12.5px] text-[#5F6373]">
                              {formatPhone(o.customer.phone)}
                            </bdi>
                          </span>
                        </td>
                        <td className="border-t border-[#E4E6EE] p-3">
                          <Pill tone="grey">{CHANNEL_META[o.channel].pill}</Pill>
                        </td>
                        <td className="whitespace-nowrap border-t border-[#E4E6EE] p-3">{o.city || '—'}</td>
                        <td className="min-w-[150px] max-w-[260px] border-t border-[#E4E6EE] p-3">{o.products || '—'}</td>
                        <td className="whitespace-nowrap border-t border-[#E4E6EE] p-3">
                          <b>{money(o.total)}</b>
                        </td>
                        <td className="border-t border-[#E4E6EE] p-3">
                          <Payment order={o} />
                        </td>
                        <td className="border-t border-[#E4E6EE] p-3">
                          <Pill tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Pill>
                        </td>
                        <td className="whitespace-nowrap border-t border-[#E4E6EE] p-3 text-[13px]">{o.delivery || '—'}</td>
                        <td className="border-t border-[#E4E6EE] p-3">
                          <RowActions order={o} canConfirm={me.canConfirm} busy={busy} onConfirm={() => setConfirming([o.orderName])} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per order. */}
          <ul className="flex flex-col lg:hidden">
            {!data ? (
              Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="border-t border-[#E4E6EE] p-3 first:border-t-0">
                  <Skeleton className="h-16 w-full" />
                </li>
              ))
            ) : data.orders.length === 0 && !loading ? (
              <li className="px-3 py-10 text-center text-sm text-[#5F6373]">لا طلبات تطابق هذه المرشّحات.</li>
            ) : (
              data.orders.map((o) => (
                <li key={o.orderName} className="flex flex-col gap-2 border-t border-[#E4E6EE] p-3 text-sm first:border-t-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {me.canConfirm && o.status === 'new' ? (
                        <input
                          type="checkbox"
                          aria-label={`تحديد ${o.orderName}`}
                          className="size-4 accent-dark-ocean"
                          checked={selected.has(o.orderName)}
                          onChange={() => toggle(o.orderName)}
                        />
                      ) : null}
                      <b>#{o.orderName}</b>
                      {o.placedAt ? <span className="text-[12px] text-[#5F6373]">{placedText(o.placedAt)}</span> : null}
                    </span>
                    <Pill tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Pill>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex flex-col">
                      <span>{o.customer.name || '—'}</span>
                      <bdi dir="ltr" className="whitespace-nowrap text-right text-[12.5px] text-[#5F6373]">
                        {formatPhone(o.customer.phone)}
                      </bdi>
                    </span>
                    <span className="flex items-center gap-2">
                      <Pill tone="grey">{CHANNEL_META[o.channel].pill}</Pill>
                      <span className="text-[#5F6373]">{o.city}</span>
                    </span>
                  </div>
                  <p className="text-[13.5px]">{o.products}</p>
                  <div className="flex items-center justify-between gap-2 text-[13px] text-[#5F6373]">
                    <span>التوصيل: {o.delivery || '—'}</span>
                    <b className="text-[14px] text-[#16161F]">{money(o.total)}</b>
                  </div>
                  <RowActions order={o} canConfirm={me.canConfirm} busy={busy} onConfirm={() => setConfirming([o.orderName])} />
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-[#5F6373]">
          <span className="flex items-center gap-3">
            {data ? (data.total ? `عرض ${from}–${to} من ${data.total}` : 'لا طلبات') : ' '}
            <label className="flex items-center gap-1.5">
              <span>لكل صفحة</span>
              <select
                value={query.perPage}
                onChange={(e) => setQuery({ perPage: e.target.value === '8' ? null : e.target.value, page: null })}
                className="h-8 rounded-lg bg-white px-2 text-[13px] text-[#16161F] shadow-[inset_0_0_0_1px_#E4E6EE]"
              >
                {PER_PAGE.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data || data.page <= 1} onClick={() => setQuery({ page: data && data.page > 2 ? data.page - 1 : null })}>
              السابق
            </Button>
            <Button variant="outline" size="sm" disabled={!data || data.page >= data.pages} onClick={() => setQuery({ page: (data?.page ?? 1) + 1 })}>
              التالي
            </Button>
          </span>
        </div>
      </PageBody>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
        <DialogContent dir="rtl" className="max-w-md bg-white font-sans text-[#16161F]">
          <DialogTitle className="font-display text-xl font-bold">
            {confirming && confirming.length > 1 ? `تأكيد ${ordersCount(confirming.length)}؟` : `تأكيد الطلب #${confirming?.[0] ?? ''}؟`}
          </DialogTitle>
          <DialogDescription className="text-[14.5px] leading-relaxed text-[#5F6373]">
            {confirming && confirming.length > 1 ? 'تُؤكَّد أوامر البيع في أودو، ويصل كلَّ عميل إشعار «تم التأكيد».' : 'يُؤكَّد أمر البيع في أودو، ويصل العميلَ إشعار «تم التأكيد».'}
          </DialogDescription>
          <DialogFooter className="gap-2 sm:justify-start sm:gap-2">
            <Button disabled={busy} onClick={() => confirming && void confirmNow(confirming)}>
              <Icon name="check" size={18} />
              {busy ? 'جارٍ التأكيد…' : 'تأكيد'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Filter<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 xl:w-[170px]">
      <span className="text-[13px] font-semibold text-[#5F6373]">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-[42px] rounded-[10px] border-0 bg-white px-3 text-[14.5px] text-[#16161F] shadow-[inset_0_0_0_1px_#E4E6EE]" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-white font-sans text-[#16161F]">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/** Everything is paid on delivery; the app's orders say how (نقداً، بطاقة مصرفية، حوالة مصرفية). */
function Payment({ order }: { order: PanelOrder }) {
  return (
    <span className="whitespace-nowrap text-[13px] text-[#5F6373]" title="الدفع عند الاستلام">
      {order.payment ?? 'عند الاستلام'}
    </span>
  );
}

function RowActions({ order, canConfirm, busy, onConfirm }: { order: PanelOrder; canConfirm: boolean; busy: boolean; onConfirm: () => void }) {
  if (!(canConfirm && order.status === 'new') && !order.odooLink) return null;
  return (
    <span className="flex items-center gap-3 whitespace-nowrap">
      {canConfirm && order.status === 'new' ? (
        <Button size="sm" className="h-8 px-3 text-[13px]" disabled={busy} onClick={onConfirm}>
          تأكيد
        </Button>
      ) : null}
      {order.odooLink ? (
        <a href={order.odooLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-dark-ocean underline">
          <Icon name="external" size={15} />
          أودو
        </a>
      ) : null}
    </span>
  );
}
