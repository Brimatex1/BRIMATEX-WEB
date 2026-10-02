import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { CITIES } from '@/shop/CityDialog';

import { panelApi, PanelError, type AppSettings, type PanelMe, type SettingsPayload, type TeamMember } from '../api';
import { PageBody, PageHeader } from '../Shell';
import { Button, Card, CardHead, ErrorCard, Field, Icon, ROLE_LABEL, Skeleton, SwitchRow, buttonClass, formatLibyan, formatPhone } from '../ui';

const ROLE_OPTIONS: TeamMember['role'][] = ['admin', 'marketing', 'support', 'customer'];

/** What each role opens - the server's map (src/lib/auth.js SECTIONS_BY_ROLE), in words. */
const ROLE_SEES: { role: TeamMember['role']; sees: string }[] = [
  { role: 'admin', sees: 'كل الأقسام' },
  { role: 'marketing', sees: 'الواجهة، الإشعارات، ساعدني أختار، المراتب' },
  { role: 'support', sees: 'نظرة عامة، الطلبات' },
];

/** The form keeps every value as typed; the server checks and normalises on «حفظ». */
type Form = {
  ios: string;
  android: string;
  forceUpdate: boolean;
  maintenanceOn: boolean;
  maintenanceMessage: string;
  guestBrowsing: boolean;
  phone: string;
  whatsapp: string;
  email: string;
  showroom: string;
  quietFrom: string;
  quietTo: string;
};

function toForm(s: AppSettings): Form {
  return {
    ios: s.minVersion.ios,
    android: s.minVersion.android,
    forceUpdate: s.forceUpdate,
    maintenanceOn: s.maintenance.on,
    maintenanceMessage: s.maintenance.message,
    guestBrowsing: s.guestBrowsing,
    phone: formatLibyan(s.contact.phone),
    whatsapp: formatLibyan(s.contact.whatsapp),
    email: s.contact.email,
    showroom: s.contact.showroom,
    quietFrom: s.quietHours.from,
    quietTo: s.quietHours.to,
  };
}

function fromForm(f: Form): AppSettings {
  return {
    minVersion: { ios: f.ios.trim(), android: f.android.trim() },
    forceUpdate: f.forceUpdate,
    maintenance: { on: f.maintenanceOn, message: f.maintenanceMessage.trim() },
    guestBrowsing: f.guestBrowsing,
    contact: { phone: f.phone, whatsapp: f.whatsapp, email: f.email.trim(), showroom: f.showroom.trim() },
    quietHours: { from: f.quietFrom, to: f.quietTo },
  };
}

/** The server's field names («contact.email») → the form's. */
const FIELD: Record<string, keyof Form> = {
  'minVersion.ios': 'ios',
  'minVersion.android': 'android',
  forceUpdate: 'forceUpdate',
  'maintenance.on': 'maintenanceOn',
  'maintenance.message': 'maintenanceMessage',
  guestBrowsing: 'guestBrowsing',
  'contact.phone': 'phone',
  'contact.whatsapp': 'whatsapp',
  'contact.email': 'email',
  'contact.showroom': 'showroom',
  'quietHours.from': 'quietFrom',
  'quietHours.to': 'quietTo',
};

/**
 * الإعدادات (AdminSettings): the apps (minimum versions, «إجبار التحديث»,
 * maintenance, guests), contact, quiet hours for notifications, the delivery
 * cities (read-only - free everywhere) and who may open the panel. Admin only,
 * checked on the server. «حفظ» stores everything at once - in Odoo's system
 * parameter brimatex.app.settings - and the apps and the website read it from
 * /api/app/v1/config.
 */
export function SettingsPage({ me, token }: { me: PanelMe; token: string }) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: keyof Form; message: string } | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    panelApi
      .settings(token)
      .then((r) => {
        setData(r);
        setForm(toForm(r.settings));
      })
      .catch((err: Error) => setLoadError(err.message));
  }, [token]);
  useEffect(load, [load]);

  const initial = useMemo(() => (data ? toForm(data.settings) : null), [data]);
  const dirty = Boolean(form && initial && JSON.stringify(form) !== JSON.stringify(initial));

  // A change not saved: the browser asks before the page is left.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    if (fieldError?.field === key) setFieldError(null);
  }

  async function save() {
    if (!form || !dirty || saving) return;
    setSaving(true);
    setFieldError(null);
    try {
      const r = await panelApi.saveSettings(token, fromForm(form));
      setData(r);
      setForm(toForm(r.settings));
      toast.success('حُفظت الإعدادات');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر الحفظ';
      const field = err instanceof PanelError && err.field ? FIELD[err.field] : undefined;
      if (field) setFieldError({ field, message });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const err = (key: keyof Form) => (fieldError?.field === key ? fieldError.message : undefined);

  return (
    <>
      <PageHeader
        section="settings"
        me={me}
        action={
          <Button size="sm" onClick={() => void save()} disabled={!dirty || saving} aria-busy={saving}>
            <Icon name="check" size={18} />
            حفظ
          </Button>
        }
      />
      <PageBody>
        {loadError ? <ErrorCard message={loadError} onRetry={load} /> : null}
        {!form || !data ? (
          loadError ? null : <SettingsSkeleton />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardHead title="التطبيقان" />
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field label="أقل إصدار مسموح · iOS" value={form.ios} onChange={(v) => set('ios', v)} placeholder="1.0.0" ltr error={err('ios')} inputMode="decimal" />
                  <Field label="أقل إصدار مسموح · أندرويد" value={form.android} onChange={(v) => set('android', v)} placeholder="1.0.0" ltr error={err('android')} inputMode="decimal" />
                </div>
                <div className="mt-2 flex flex-col">
                  <SwitchRow title="إجبار التحديث" line="من يستخدم إصداراً أقدم يرى شاشة «حدّث التطبيق»" checked={form.forceUpdate} onChange={(v) => set('forceUpdate', v)} />
                  <SwitchRow title="وضع الصيانة" line="التطبيقان والموقع يعرضون رسالة الصيانة ويوقفون الطلب" checked={form.maintenanceOn} onChange={(v) => set('maintenanceOn', v)}>
                    {form.maintenanceOn ? (
                      <Field
                        label="رسالة الصيانة"
                        value={form.maintenanceMessage}
                        onChange={(v) => set('maintenanceMessage', v)}
                        error={err('maintenanceMessage')}
                        multiline
                        maxLength={200}
                      />
                    ) : null}
                  </SwitchRow>
                  <SwitchRow title="السماح بالطلب كزائر حتى السلة" line="الدخول برقم واتساب يُطلب عند إتمام الطلب فقط" checked={form.guestBrowsing} onChange={(v) => set('guestBrowsing', v)} />
                </div>
              </Card>

              <Card>
                <CardHead title="التواصل" />
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field label="رقم خدمة العملاء" value={form.phone} onChange={(v) => set('phone', v)} ltr error={err('phone')} inputMode="tel" autoComplete="off" />
                  <Field label="رقم واتساب الأعمال" value={form.whatsapp} onChange={(v) => set('whatsapp', v)} ltr error={err('whatsapp')} inputMode="tel" autoComplete="off" />
                  <Field label="البريد" value={form.email} onChange={(v) => set('email', v)} ltr error={err('email')} inputMode="email" autoComplete="off" />
                  <Field label="صالة العرض" value={form.showroom} onChange={(v) => set('showroom', v)} error={err('showroom')} />
                </div>
              </Card>

              <Card>
                <CardHead title="ساعات الهدوء للإشعارات" />
                <div className="flex gap-3.5">
                  <Field label="من" type="time" value={form.quietFrom} onChange={(v) => set('quietFrom', v)} error={err('quietFrom')} className="w-1/2" />
                  <Field label="إلى" type="time" value={form.quietTo} onChange={(v) => set('quietTo', v)} error={err('quietTo')} className="w-1/2" />
                </div>
              </Card>

              <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex flex-col gap-1">
                  <b className="text-[17px]">الإعدادات المتقدمة</b>
                  <span className="text-sm text-[#5F6373]">قائمة العملاء، والمخزون، وتعديلات المنتجات وصورها، وصور الإعلانات وإنستغرام في اللوحة السابقة حالياً.</span>
                </span>
                <a href="/admin/classic" className={cn(buttonClass('outline'), 'no-underline')}>
                  <Icon name="external" size={18} />
                  الإعدادات المتقدمة
                </a>
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <DeliveryCities days={data.delivery.days} />
              <UsersAndRoles me={me} token={token} />
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {[0, 1].map((col) => (
        <div key={col} className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <Card key={i} className="flex flex-col gap-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-[42px]" />
              <Skeleton className="h-[42px]" />
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-3 pb-3 text-right text-[12.5px] font-semibold text-[#5F6373]">{children}</th>;
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('border-t border-[#E4E6EE] px-3 py-3 align-middle text-sm', className)}>{children}</td>;
}

/** «مدن التوصيل» - read-only: the shop's cities, free to every one of them. */
function DeliveryCities({ days }: { days: string }) {
  return (
    <Card className="p-4">
      <CardHead title="مدن التوصيل" />
      <p className="-mt-2 mb-3 px-1 text-[13px] text-[#5F6373]">التوصيل مجاني لكل المدن</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>المدينة</Th>
              <Th>رسوم التوصيل</Th>
              <Th>أيام التوصيل</Th>
            </tr>
          </thead>
          <tbody>
            {CITIES.map((city) => (
              <tr key={city}>
                <Td className="py-2.5">{city}</Td>
                <Td className="py-2.5">مجاني</Td>
                <Td className="py-2.5 text-[13px] text-[#5F6373]">{days}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** «المستخدمون والصلاحيات»: what each role opens, then the team and each member's role. */
function UsersAndRoles({ me, token }: { me: PanelMe; token: string }) {
  const [users, setUsers] = useState<TeamMember[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (query = '') => {
      setError(null);
      panelApi
        .team(token, query)
        .then((r) => setUsers(r.users))
        .catch((err: Error) => setError(err.message));
    },
    [token]
  );
  useEffect(() => load(), [load]);

  async function change(user: TeamMember, role: TeamMember['role']) {
    try {
      await panelApi.setRole(token, user.id, role);
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, role } : u)) ?? prev);
      toast.success(`حُفظت صلاحية ${user.name || user.phone}: ${ROLE_LABEL[role]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    }
  }

  function search(e: FormEvent) {
    e.preventDefault();
    load(q.trim());
  }

  return (
    <Card className="p-4">
      <CardHead title="المستخدمون والصلاحيات" />
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>الدور في اللوحة</Th>
            <Th>يرى</Th>
          </tr>
        </thead>
        <tbody>
          {ROLE_SEES.map((r) => (
            <tr key={r.role}>
              <Td>
                <b>{ROLE_LABEL[r.role]}</b>
              </Td>
              <Td>{r.sees}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 border-t border-[#E4E6EE] px-1 pt-4">
        <b className="mb-3 block text-[15px]">فريق الإدارة</b>
        <form onSubmit={search} className="mb-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الهاتف لإضافة عضو"
            aria-label="بحث عن مستخدم"
            className="h-10 min-w-0 flex-1 rounded-[10px] bg-[#F5F6FA] px-3 text-sm outline-none placeholder:text-[#5F6373]"
          />
          <button type="submit" className={buttonClass('outline', 'sm')}>
            بحث
          </button>
        </form>
        {error ? <p className="text-sm text-[#A12020]">{error}</p> : null}
        {/* A long team scrolls inside the card, so the page stays one screen of settings. */}
        <ul className="flex max-h-[420px] flex-col overflow-y-auto overscroll-contain">
          {users?.length === 0 ? <li className="border-t border-[#E4E6EE] py-3 text-sm text-[#5F6373]">لا أحد يطابق البحث.</li> : null}
          {users?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E6EE] py-3 text-sm">
              <span className="flex flex-col">
                <b>{u.name || '—'}</b>
                <bdi dir="ltr" className="text-right text-[12.5px] text-[#5F6373]">
                  {formatPhone(u.phone)}
                </bdi>
              </span>
              {u.locked || u.id === me.user.id ? (
                <span className="text-[13px] text-[#5F6373]">
                  {ROLE_LABEL[u.role]}
                  {u.locked ? ' · من إعدادات الخادم' : ''}
                </span>
              ) : (
                <select
                  value={u.role}
                  onChange={(e) => void change(u, e.target.value as TeamMember['role'])}
                  aria-label={`صلاحية ${u.name}`}
                  className="h-9 rounded-[10px] bg-white px-2 text-[13.5px] shadow-[inset_0_0_0_1px_#E4E6EE]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      </div>
      <span className="mt-3 block px-1 text-[12.5px] text-[#5F6373]">الدخول برقم الهاتف ورمز واتساب، والمدير يحدد دور كل عضو.</span>
    </Card>
  );
}
