import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

import { panelApi, type Overview, type PanelMe } from '../api';
import { Link, sectionHref } from '../router';
import { PageBody, PageHeader } from '../Shell';
import { Card, CardHead, CHANNEL_META, ErrorCard, Icon, Pill, Skeleton, buttonClass, counted, money, ordersCount, since, toneClass, type IconName, type Tone } from '../ui';

/** نظرة عامة (AdminHome): today in four numbers, the week by channel, what needs attention, what customers see. */
export function OverviewPage({ me, token }: { me: PanelMe; token: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    panelApi
      .overview(token)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [token]);
  useEffect(load, [load]);

  const can = (s: PanelMe['sections'][number]) => me.sections.includes(s);

  return (
    <>
      <PageHeader
        section="overview"
        me={me}
        action={
          can('push') ? (
            <Link href={sectionHref('push')} className={cn(buttonClass('primary', 'sm'), 'no-underline')}>
              <Icon name="plus" size={18} />
              إشعار جديد
            </Link>
          ) : null
        }
      />
      <PageBody>
        {error ? <ErrorCard message={error} onRetry={load} /> : null}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat label="طلبات اليوم" icon="box" value={data?.today.orders} note="من التطبيق والموقع" />
          <Stat
            label="بانتظار التأكيد"
            icon="clock"
            value={data?.pending.count}
            note={data ? (data.pending.oldestAt ? `أقدمها منذ ${since(data.pending.oldestAt)}` : 'لا طلبات تنتظر') : undefined}
          />
          <Stat label="خرجت للتوصيل" icon="truck" value={data?.outForDelivery} note="متابعة مباشرة مفعّلة" />
          <Stat label="مبيعات اليوم" icon="star" value={data ? money(data.today.sales) : undefined} note="الدفع عند الاستلام" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <Card>
            <CardHead title="الطلبات حسب القناة · آخر 7 أيام" aside={<Pill tone="ocean">من أودو</Pill>} />
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-right">
                <thead>
                  <tr>
                    {['القناة', 'الطلبات', 'المبيعات', 'نسبة الإلغاء'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 pb-3 text-[12.5px] sm:px-3 font-semibold text-[#5F6373]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data
                    ? data.channels.map((c) => (
                        <tr key={c.key} className="text-sm">
                          <td className="whitespace-nowrap border-t border-[#E4E6EE] px-2 py-3 sm:px-3">
                            <span className="flex items-center gap-2">
                              <Icon name={CHANNEL_META[c.key].icon} size={18} />
                              {CHANNEL_META[c.key].row}
                            </span>
                          </td>
                          <td className="border-t border-[#E4E6EE] px-2 py-3 sm:px-3">{c.orders}</td>
                          <td className="whitespace-nowrap border-t border-[#E4E6EE] px-2 py-3 sm:px-3">{money(c.sales)}</td>
                          <td className="border-t border-[#E4E6EE] px-2 py-3 sm:px-3">{c.cancelRate}٪</td>
                        </tr>
                      ))
                    : [0, 1, 2].map((i) => (
                        <tr key={i}>
                          <td colSpan={4} className="border-t border-[#E4E6EE] px-2 py-3 sm:px-3">
                            <Skeleton className="h-5 w-full" />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHead title="يحتاج انتباهك" />
            <Attention data={data} me={me} />
          </Card>
        </div>

        <Card>
          <CardHead
            title="ما يراه العملاء الآن"
            aside={
              can('home') ? (
                <Link href={sectionHref('home')} className="text-[13.5px] font-semibold text-dark-ocean underline">
                  إدارة الواجهة
                </Link>
              ) : null
            }
          />
          <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
            <div className="relative min-h-[190px] flex-1 overflow-hidden rounded-[14px] bg-dark-ocean">
              {data?.banner ? <img src={data.banner.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-55" /> : null}
              <div className="absolute inset-x-4 bottom-4 text-white">
                <span className="text-xs font-bold text-[#DEE337]">البانر الحالي · الكل</span>
                <b className="mt-1 block text-xl">
                  {data == null
                    ? '…'
                    : data.banner
                      ? data.banner.title || (data.banner.count > 1 ? `الأول من ${data.banner.count} بانرات` : 'بانر الصفحة الرئيسية')
                      : 'لا بانرات منشورة الآن'}
                </b>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 md:w-[280px]">
              <span className="text-[13px] font-semibold text-[#5F6373]">آخر إشعار عرض</span>
              <div className="flex gap-2.5 rounded-[14px] bg-[#F5F6FA] p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-white text-dark-ocean">
                  <Icon name="bell" size={18} />
                </span>
                {data?.lastPush ? (
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <b className="text-[13.5px]">{data.lastPush.title}</b>
                    <span className="text-[12.5px] text-[#5F6373]">{data.lastPush.body}</span>
                    <span className="text-[12px] text-[#5F6373]">
                      {`أُرسل إلى ${data.lastPush.sent} جهاز`}
                      {since(data.lastPush.sentAt) ? ` · قبل ${since(data.lastPush.sentAt)}` : ''}
                    </span>
                  </span>
                ) : (
                  <span className="flex flex-col gap-0.5">
                    <b className="text-[13.5px]">{data == null ? '…' : 'لم يُرسَل إشعار عرض بعد'}</b>
                    {data == null ? null : <span className="text-[12.5px] text-[#5F6373]">تُرسَل إشعارات العروض من قسم «الإشعارات».</span>}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <QuickActions me={me} />
      </PageBody>
    </>
  );
}

function Stat({ label, icon, value, note }: { label: string; icon: IconName; value: number | string | undefined; note?: string }) {
  return (
    <div className="rounded-2xl border border-[#E4E6EE] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-[#5F6373]">{label}</span>
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#EEF0FA] text-dark-ocean">
          <Icon name={icon} size={19} />
        </span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-9 w-24" />
      ) : (
        <b className="mt-1.5 block font-display text-2xl sm:text-[30px]">{value}</b>
      )}
      <span className="text-[12.5px] text-[#5F6373]">{note ?? ' '}</span>
    </div>
  );
}

interface AttentionItem {
  key: string;
  tone: Tone;
  icon: IconName;
  text: string;
  href: string;
}

function Attention({ data, me }: { data: Overview | null; me: PanelMe }) {
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  const items: AttentionItem[] = [];
  if (data.waitingTooLong > 0) {
    const n = data.waitingTooLong;
    items.push({
      key: 'waiting',
      tone: 'amber',
      icon: 'clock',
      text: `${ordersCount(n)} ${n === 1 ? 'ينتظر' : n === 2 ? 'ينتظران' : 'تنتظر'} التأكيد أكثر من ساعتين`,
      href: sectionHref('orders', { status: 'new', period: 'all' }),
    });
  }
  if (data.reviewsPending) {
    items.push({
      key: 'reviews',
      tone: 'ocean',
      icon: 'star',
      text: `${counted(data.reviewsPending, ['تقييم واحد', 'تقييمان', 'تقييمات', 'تقييماً'])} بانتظار المراجعة`,
      href: sectionHref('reviews', { status: 'pending' }),
    });
  }
  if (data.productsWithoutPhoto?.count && me.sections.includes('products')) {
    const { count, total } = data.productsWithoutPhoto;
    items.push({
      key: 'photos',
      tone: 'red',
      icon: 'warning',
      text: `${count} ${count === 1 ? 'مرتبة' : 'مراتب'} من ${total} بدون صورة`,
      href: sectionHref('products'),
    });
  }
  if (!items.length) return <p className="border-t border-[#E4E6EE] pt-3 text-sm text-[#5F6373]">لا شيء يحتاج انتباهك الآن.</p>;
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="flex items-center gap-3 border-t border-[#E4E6EE] py-3 text-[#16161F] no-underline hover:bg-[#FAFBFD]">
          <span className={cn('grid size-[34px] shrink-0 place-items-center rounded-[10px]', toneClass(item.tone))}>
            <Icon name={item.icon} size={18} />
          </span>
          <span className="flex-1 text-sm">{item.text}</span>
          <Icon name="chevron" size={18} className="text-[#5F6373]" />
        </Link>
      ))}
    </div>
  );
}

function QuickActions({ me }: { me: PanelMe }) {
  const actions = [
    { section: 'push' as const, label: 'إشعار جديد', icon: 'plus' as const },
    { section: 'home' as const, label: 'بانر جديد', icon: 'image' as const },
    { section: 'quiz' as const, label: 'تعديل ساعدني أختار', icon: 'help' as const },
  ].filter((a) => me.sections.includes(a.section));
  if (!actions.length) return null;
  return (
    <Card>
      <CardHead title="إجراءات سريعة" />
      <div className="flex flex-wrap gap-2.5">
        {actions.map((a, i) => (
          <Link key={a.section} href={sectionHref(a.section)} className={cn(buttonClass(i === 0 ? 'primary' : 'outline'), 'no-underline')}>
            <Icon name={a.icon} size={18} />
            {a.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}
