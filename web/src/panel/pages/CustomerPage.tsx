import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { panelApi, PanelError, type PanelCustomer, type PanelMe } from '../api';
import { PageBody } from '../Shell';
import { Link, navigate, orderHref, sectionHref } from '../router';
import { Button, buttonClass, Card, CardHead, CHANNEL_META, ErrorCard, Field, formatPhone, Icon, money, ordersCount, Pill, Skeleton, STATUS_META, since } from '../ui';
import { libyaMoment, whatsappHref } from './OrderDetailPage';
import { PLATFORM_LABEL } from './UsersPage';

type Account = NonNullable<PanelCustomer['account']>;

/**
 * «إدارة الحساب» (admin only): the name and the number the account signs in
 * with, «إيقاف الحساب» (signed out at once, no way in until reopened), and
 * «حذف الحساب» - for good, its orders kept without the name, as when the
 * customer deletes it themselves.
 */
function AccountCard({ token, me, account, onChanged }: { token: string; me: PanelMe; account: Account; onChanged: (changes: Partial<Account>) => void }) {
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(account.phone);
  const [error, setError] = useState<{ field: 'name' | 'phone' | null; message: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'suspend' | 'delete' | null>(null);
  useEffect(() => {
    setName(account.name);
    setPhone(account.phone);
  }, [account.name, account.phone]);

  if (account.id === me.user.id) {
    return (
      <Card>
        <CardHead title="إدارة الحساب" />
        <p className="m-0 text-sm text-[#5F6373]">هذا حسابك أنت، ولا يُعدَّل من هنا.</p>
      </Card>
    );
  }

  const changed = name.trim() !== account.name || phone.trim() !== account.phone;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!changed) return;
    const changes: { name?: string; phone?: string } = {};
    if (name.trim() !== account.name) changes.name = name.trim();
    if (phone.trim() !== account.phone) changes.phone = phone.trim();
    setBusy('save');
    setError(null);
    try {
      const { account: saved } = await panelApi.editAccount(token, account.id, changes);
      onChanged({ name: saved.name, phone: saved.phone });
      toast.success('حُفظت البيانات');
    } catch (err) {
      const message = err instanceof PanelError ? err.message : 'تعذّر الحفظ';
      setError({ field: /رقم|الهاتف/.test(message) ? 'phone' : /الاسم/.test(message) ? 'name' : null, message });
    } finally {
      setBusy(null);
    }
  }

  async function suspend(next: boolean) {
    const ask = next
      ? `إيقاف حساب «${account.name || formatPhone(account.phone)}»؟ يخرج من التطبيق والموقع فوراً، ولا يدخل حتى تعيد تفعيله.`
      : `إعادة تفعيل حساب «${account.name || formatPhone(account.phone)}»؟`;
    if (!window.confirm(ask)) return;
    setBusy('suspend');
    try {
      const { suspendedAt } = await panelApi.suspendAccount(token, account.id, next);
      onChanged({ suspendedAt });
      toast.success(next ? 'أُوقف الحساب' : 'أُعيد تفعيل الحساب');
    } catch (err) {
      toast.error(err instanceof PanelError ? err.message : 'تعذّر التنفيذ');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`حذف حساب «${account.name || formatPhone(account.phone)}» نهائياً؟ تُحذف بياناته وعناوينه ومفضلته، وتبقى طلباته بلا اسمه. لا يمكن التراجع.`)) return;
    setBusy('delete');
    try {
      await panelApi.deleteAccount(token, account.id);
      toast.success('حُذف الحساب');
      navigate(sectionHref('users'), { replace: true });
    } catch (err) {
      toast.error(err instanceof PanelError ? err.message : 'تعذّر الحذف');
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHead title="إدارة الحساب" aside={account.suspendedAt ? <Pill tone="red">موقوف</Pill> : <Pill tone="green">مفعّل</Pill>} />
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3">
        <Field label="الاسم" value={name} onChange={setName} maxLength={60} error={error?.field === 'name' ? error.message : undefined} />
        <Field
          label="رقم الهاتف"
          value={phone}
          onChange={setPhone}
          ltr
          inputMode="tel"
          maxLength={20}
          error={error?.field === 'phone' ? error.message : undefined}
          hint="الرقم الذي يدخل به العميل إلى حسابه."
        />
        {error && !error.field ? <p className="m-0 text-[12.5px] text-[#A12020]">{error.message}</p> : null}
        <Button type="submit" size="sm" disabled={!changed || busy !== null} aria-busy={busy === 'save'}>
          <Icon name="check" size={17} /> حفظ التعديل
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-2 border-t border-[#E4E6EE] pt-4">
        {account.suspendedAt ? (
          <p className="m-0 text-[13px] text-[#A12020]">موقوف منذ {libyaMoment(account.suspendedAt, true)}</p>
        ) : null}
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void suspend(!account.suspendedAt)}>
          <Icon name={account.suspendedAt ? 'check' : 'lock'} size={17} />
          {account.suspendedAt ? 'إعادة تفعيل الحساب' : 'إيقاف الحساب'}
        </Button>
        <Button variant="outline" size="sm" className="text-[#A12020]" disabled={busy !== null} onClick={() => void remove()}>
          <Icon name="trash" size={17} /> حذف الحساب نهائياً
        </Button>
      </div>
    </Card>
  );
}

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
export function CustomerPage({ me, token, customerKey, search }: { me: PanelMe; token: string; customerKey: string; search: string }) {
  const [c, setC] = useState<PanelCustomer | null>(null);
  // Opened from المستخدمون: the way back goes there.
  const fromUsers = new URLSearchParams(search).get('from') === 'users' && me.sections.includes('users');
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
  // The devices registered for notifications, and the app the account last opened.
  const ios = c ? Math.max(c.devices.ios, c.account?.appPlatform === 'ios' ? 1 : 0) : 0;
  const android = c ? Math.max(c.devices.android, c.account?.appPlatform === 'android' ? 1 : 0) : 0;
  const devices = [ios ? `iPhone${ios > 1 ? ` (${ios})` : ''}` : null, android ? `Android${android > 1 ? ` (${android})` : ''}` : null].filter(Boolean);

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-[#E4E6EE] bg-white px-4 py-4 sm:px-8 lg:h-[76px] lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:py-0">
        <div className="flex flex-col gap-0.5">
          <Link href={sectionHref(fromUsers ? 'users' : 'orders')} className="text-[13px] font-semibold text-[#5F6373] no-underline hover:text-dark-ocean">
            → {fromUsers ? 'المستخدمون' : 'الطلبات'}
          </Link>
          <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-display text-[22px] font-bold">
            {c ? c.name || 'عميل بدون اسم' : 'العميل'}
            {c ? <Pill tone={c.account ? 'ocean' : 'grey'}>{c.account ? 'له حساب' : 'بدون حساب'}</Pill> : null}
            {c?.account?.suspendedAt ? <Pill tone="red">موقوف</Pill> : null}
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
                    {c.account?.appPlatform ? (
                      <div className="flex flex-col">
                        <dt className="text-[12.5px] text-[#5F6373]">آخر فتح للتطبيق</dt>
                        <dd className="m-0">
                          {PLATFORM_LABEL[c.account.appPlatform]}
                          {c.account.appSeenAt ? ` · قبل ${since(c.account.appSeenAt)}` : ''}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </Card>

                {c.account && me.sections.includes('users') ? (
                  <AccountCard
                    token={token}
                    me={me}
                    account={c.account}
                    onChanged={(changes) =>
                      setC((prev) =>
                        prev?.account
                          ? { ...prev, name: changes.name || prev.name, phone: changes.phone || prev.phone, account: { ...prev.account, ...changes } }
                          : prev
                      )
                    }
                  />
                ) : null}

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
