import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { panelApi, type AccountPlatform, type AccountsPage, type AccountsQuery, type PanelMe } from '../api';
import { customerHref, Link, useQueryUpdater } from '../router';
import { PageBody, PageHeader } from '../Shell';
import { Button, ErrorCard, formatPhone, Icon, ordersCount, Pill, ROLE_LABEL, Skeleton, since } from '../ui';
import { libyaMoment } from './OrderDetailPage';

type Filter = 'all' | AccountPlatform | 'unknown' | 'suspended';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'ios', label: 'iPhone' },
  { key: 'android', label: 'Android' },
  { key: 'web', label: 'الموقع' },
  { key: 'unknown', label: 'غير معروف' },
  { key: 'suspended', label: 'موقوف' },
];

export const PLATFORM_LABEL: Record<AccountPlatform, string> = { ios: 'iPhone', android: 'Android', web: 'الموقع' };

function readQuery(search: string): AccountsQuery & { filter: Filter } {
  const p = new URLSearchParams(search);
  const platform = p.get('platform');
  const status = p.get('status') === 'suspended' ? 'suspended' : '';
  const validPlatform = platform === 'ios' || platform === 'android' || platform === 'web' || platform === 'unknown' ? platform : '';
  return {
    q: (p.get('q') || '').slice(0, 60),
    platform: validPlatform,
    status,
    page: Math.max(1, Number(p.get('page')) || 1),
    filter: status ? 'suspended' : validPlatform || 'all',
  };
}

/**
 * المستخدمون (admin only): every account, newest first - its name and number,
 * which app it uses (the platform the app reports at every launch, the devices
 * registered for notifications, orders from the website), its orders, and
 * whether it is stopped. A row opens the customer's page, where the account is
 * edited, stopped or erased.
 */
export function UsersPage({ me, token, search }: { me: PanelMe; token: string; search: string }) {
  const query = useMemo(() => readQuery(search), [search]);
  const setQuery = useQueryUpdater();
  const [data, setData] = useState<AccountsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    panelApi
      .accounts(token, { q: query.q, platform: query.platform, status: query.status, page: query.page })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [token, query.q, query.platform, query.status, query.page]);
  useEffect(load, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const countOf = (f: Filter) => (data ? (f === 'all' ? data.counts.all : data.counts[f]) : null);

  return (
    <>
      <PageHeader
        section="users"
        me={me}
        search={{ value: query.q, placeholder: 'ابحث بالاسم أو رقم الهاتف', onSubmit: (q) => setQuery({ q, page: null }) }}
      />
      <PageBody>
        <div className="flex items-start gap-2.5 rounded-xl bg-[#EEF0FA] px-3.5 py-3 text-[13.5px] leading-relaxed text-dark-ocean">
          <Icon name="phone" size={18} className="mt-0.5" />
          <span>
            الجهاز يُعرف من التطبيق نفسه كلما فتحه العميل، ومن طلباته من الموقع. افتح الحساب لتعديل بياناته أو إيقافه أو حذفه.
          </span>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="نوع الحساب">
          {FILTERS.map(({ key, label }) => {
            const active = query.filter === key;
            const n = countOf(key);
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  setQuery({
                    platform: key === 'all' || key === 'suspended' ? null : key,
                    status: key === 'suspended' ? 'suspended' : null,
                    page: null,
                  })
                }
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors',
                  active ? 'bg-dark-ocean text-white' : 'bg-white text-[#16161F] shadow-[inset_0_0_0_1px_#E4E6EE] hover:bg-[#F5F6FA]'
                )}
              >
                {label}
                <span className="opacity-70">{n ?? '–'}</span>
              </button>
            );
          })}
        </div>

        {error ? <ErrorCard message={error} onRetry={load} /> : null}

        {!error || data ? (
          <div className="rounded-2xl border border-[#E4E6EE] bg-white p-3">
            <ul className="m-0 flex list-none flex-col p-0">
              {!data ? (
                Array.from({ length: 6 }, (_, i) => (
                  <li key={i} className="border-t border-[#E4E6EE] p-3 first:border-t-0">
                    <Skeleton className="h-10 w-full" />
                  </li>
                ))
              ) : data.accounts.length === 0 ? (
                <li className="px-3 py-10 text-center text-sm text-[#5F6373]">{query.q ? 'لا حساب يطابق البحث.' : 'لا حسابات هنا.'}</li>
              ) : (
                data.accounts.map((a) => (
                  <li key={a.id} className="border-t border-[#E4E6EE] first:border-t-0">
                    <Link
                      href={`${customerHref(`u:${a.id}`)}?from=users`}
                      className={cn(
                        'flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-3 py-3 text-[14px] text-[#16161F] no-underline hover:bg-[#F7F8FC]',
                        a.suspendedAt && 'bg-[#FFF6F6]'
                      )}
                    >
                      <span className="flex min-w-[180px] flex-1 flex-col">
                        <b className="flex flex-wrap items-center gap-2">
                          {a.name || 'بدون اسم'}
                          {a.role !== 'customer' ? <Pill tone="ocean">{ROLE_LABEL[a.role]}</Pill> : null}
                          {a.suspendedAt ? <Pill tone="red">موقوف</Pill> : null}
                        </b>
                        <bdi dir="ltr" className="self-start text-[13px] text-[#5F6373]">
                          {formatPhone(a.phone)}
                        </bdi>
                      </span>
                      <span className="flex min-w-[150px] flex-wrap gap-1.5">
                        {a.platforms.length ? (
                          a.platforms.map((p) => (
                            <Pill key={p} tone={p === 'ios' ? 'blue' : p === 'android' ? 'green' : 'grey'}>
                              {PLATFORM_LABEL[p]}
                            </Pill>
                          ))
                        ) : (
                          <span className="text-[13px] text-[#5F6373]">لم يُعرف بعد</span>
                        )}
                      </span>
                      <span className="flex min-w-[120px] flex-col text-[13px]">
                        <span>{a.orders ? ordersCount(a.orders) : 'بلا طلبات'}</span>
                        {a.appSeenAt ? <span className="text-[#5F6373]">فتح التطبيق قبل {since(a.appSeenAt)}</span> : null}
                      </span>
                      <span className="min-w-[110px] text-[13px] text-[#5F6373]">
                        {a.createdAt ? `منذ ${libyaMoment(a.createdAt, true).split(' · ')[0]}` : ''}
                      </span>
                      <Icon name="chevron" size={18} className="text-[#5F6373]" />
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#5F6373]">
          <span>{data ? `${data.total} حساب · الصفحة ${data.page} من ${pages}` : ''}</span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data || data.page <= 1} onClick={() => setQuery({ page: data && data.page > 2 ? data.page - 1 : null })}>
              السابق
            </Button>
            <Button variant="outline" size="sm" disabled={!data || data.page >= pages} onClick={() => setQuery({ page: (data?.page ?? 1) + 1 })}>
              التالي
            </Button>
          </span>
        </div>
      </PageBody>
    </>
  );
}
