import { useCallback, useEffect, useState } from 'react';

import { panelApi, type PanelCustomer } from '../api';
import { PageBody } from '../Shell';
import { Link, orderHref, sectionHref } from '../router';
import { buttonClass, Card, CardHead, CHANNEL_META, ErrorCard, formatPhone, Icon, money, ordersCount, Pill, Skeleton, STATUS_META } from '../ui';
import { libyaMoment, whatsappHref } from './OrderDetailPage';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[#E4E6EE] bg-white p-4">
      <span className="text-[13px] text-[#5F6373]">{label}</span>
      <b className="font-display text-[22px]">{value}</b>
      {hint ? <span className="text-[12.5px] text-[#5F6373]">{hint}</span> : null}
    </div>
  );
}

/**
 * One customer (/admin/customers/:key): the account if they have one, every
 * order they placed - signed in, or as a guest with the same phone - with what
 * they spent, the addresses they gave, their points and their reviews.
 */
export function CustomerPage({ token, customerKey }: { token: string; customerKey: string }) {
  const [c, setC] = useState<PanelCustomer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    panelApi
      .customer(token, customerKey)
      .then((d) => setC(d.customer))
      .catch((err: Error) => setError(err.message));
  }, [token, customerKey]);
  useEffect(load, [load]);
  useEffect(() => {
    if (c) document.title = `${c.name || 'عميل'} · إدارة بريماتكس`;
  }, [c]);

  const wa = c ? whatsappHref(c.phone) : null;
  const devices = c ? [c.devices.ios ? `iOS${c.devices.ios > 1 ? ` (${c.devices.ios})` : ''}` : null, c.devices.android ? `أندرويد${c.devices.android > 1 ? ` (${c.devices.android})` : ''}` : null].filter(Boolean) : [];

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-[#E4E6EE] bg-white px-4 py-4 sm:px-8 lg:h-[76px] lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:py-0">
        <div className="flex flex-col gap-0.5">
          <Link href={sectionHref('orders')} className="text-[13px] font-semibold text-[#5F6373] no-underline hover:text-dark-ocean">
            → الطلبات
          </Link>
          <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-display text-[22px] font-bold">
            {c ? c.name || 'عميل بدون اسم' : 'العميل'}
            {c ? <Pill tone={c.account ? 'ocean' : 'grey'}>{c.account ? 'له حساب' : 'بدون حساب'}</Pill> : null}
          </h1>
        </div>
        {c ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <a href={`tel:${c.phone}`} className={buttonClass('outline')}>
              <Icon name="phone" size={18} /> اتصال
            </a>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClass('outline')}>
                <Icon name="chat" size={18} /> واتساب
              </a>
            ) : null}
          </div>
        ) : null}
      </header>

      <PageBody>
        {error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : !c ? (
          <>
            <Skeleton className="h-[110px]" />
            <Skeleton className="h-[320px]" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="الطلبات" value={String(c.stats.orders)} hint={[c.stats.delivered ? `${c.stats.delivered} تم تسليمها` : null, c.stats.cancelled ? `${c.stats.cancelled} ملغاة` : null].filter(Boolean).join(' · ') || undefined} />
              <Stat label="مجموع المشتريات" value={money(c.stats.spent)} hint={c.stats.average ? `متوسط الطلب ${money(c.stats.average)}` : undefined} />
              <Stat label="آخر طلب" value={c.stats.lastAt ? libyaMoment(c.stats.lastAt).split(' · ')[0] : '—'} hint={c.stats.firstAt && c.stats.orders > 1 ? `أول طلب ${libyaMoment(c.stats.firstAt, true).split(' · ')[0]}` : undefined} />
              <Stat label="نقاط بريماتكس" value={c.loyalty ? String(c.loyalty.points) : '—'} hint={c.loyalty?.value ? `تساوي ${money(c.loyalty.value)}` : c.loyalty ? undefined : 'لا تظهر النقاط الآن'} />
            </div>

            <div className="grid items-start gap-[22px] lg:grid-cols-[1fr_340px]">
              <Card className="min-w-0">
                <CardHead title="طلباته" aside={<span className="text-[13px] text-[#5F6373]">{ordersCount(c.orders.length)}</span>} />
                {c.orders.length ? (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {c.orders.map((o) => (
                      <li key={o.orderName} className="border-t border-[#E4E6EE] first:border-t-0">
                        <Link href={orderHref(o.orderName)} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 text-[14px] text-[#16161F] no-underline hover:bg-[#F7F8FC]">
                          <span className="flex min-w-[130px] flex-col">
                            <b>#{o.orderName}</b>
                            <span className="text-[12px] text-[#5F6373]">{libyaMoment(o.placedAt)}</span>
                          </span>
                          <span className="min-w-0 flex-1 text-[13.5px]">{o.products}</span>
                          <Pill tone="grey">{CHANNEL_META[o.channel].pill}</Pill>
                          <Pill tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</Pill>
                          <b className="whitespace-nowrap">{money(o.total)}</b>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-sm text-[#5F6373]">لم يطلب شيئاً بعد.</p>
                )}
              </Card>

              <div className="flex flex-col gap-[22px]">
                <Card>
                  <CardHead title="البيانات" />
                  <dl className="m-0 flex flex-col gap-3 text-[14px]">
                    <div className="flex flex-col">
                      <dt className="text-[12.5px] text-[#5F6373]">الهاتف</dt>
                      <dd className="m-0 text-end">
                        <bdi dir="ltr">{formatPhone(c.phone)}</bdi>
                      </dd>
                    </div>
                    {c.otherNames.length ? (
                      <div className="flex flex-col">
                        <dt className="text-[12.5px] text-[#5F6373]">أسماء أخرى استخدمها في الطلبات</dt>
                        <dd className="m-0">{c.otherNames.join('، ')}</dd>
                      </div>
                    ) : null}
                    {c.account?.createdAt ? (
                      <div className="flex flex-col">
                        <dt className="text-[12.5px] text-[#5F6373]">الحساب منذ</dt>
                        <dd className="m-0">{libyaMoment(c.account.createdAt, true).split(' · ')[0]}</dd>
                      </div>
                    ) : null}
                    <div className="flex flex-col">
                      <dt className="text-[12.5px] text-[#5F6373]">التطبيق</dt>
                      <dd className="m-0">{devices.length ? `مثبّت على ${devices.join(' و')}` : 'لم يطلب من التطبيق'}</dd>
                    </div>
                  </dl>
                </Card>

                <Card>
                  <CardHead title="العناوين" />
                  {c.places.length ? (
                    <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[14px]">
                      {c.places.map((p) => (
                        <li key={`${p.city}|${p.address}`} className="flex gap-2">
                          <Icon name="truck" size={18} className="mt-0.5 shrink-0 text-[#5F6373]" />
                          <span>
                            <b>{p.city || '—'}</b>
                            {p.address ? <span className="block text-[13px] text-[#5F6373]">{p.address}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 text-sm text-[#5F6373]">لا عناوين.</p>
                  )}
                </Card>

                {c.reviews.length ? (
                  <Card>
                    <CardHead title="تقييماته" />
                    <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[13.5px]">
                      {c.reviews.map((r) => (
                        <li key={r.id} className="flex flex-col gap-0.5">
                          <span className="font-semibold text-[#7A5300]">{'★'.repeat(Math.round(r.rating))}</span>
                          {r.comment ? <span>{r.comment}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
