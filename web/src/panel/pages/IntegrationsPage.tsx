import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ConversionsApiStatus, DeliveryTimes, FacebookPixelSettings, IpHealth, OdooSettings, WhatsappSupportSettings, YourIp } from '@/types';

import type { PanelMe } from '../api';
import { PageBody, PageHeader } from '../Shell';
import { Button, Card, Field, Icon, Pill, Skeleton, type IconName } from '../ui';

/*
 * الربط والتكاملات - admin only. The classic dashboard's «الإعدادات» tab
 * (OdooSettingsPanel, WhatsAppSettingsPanel, FacebookPixelSettingsPanel,
 * PreorderSettingsPanel) in the panel's look: the same calls to the same
 * admin-only routes (src/routes/admin.js), the same checks, the same words.
 *
 * Secrets are write-only: Odoo's API key and Meta's Conversions API token are
 * sent once and never come back - the server says only whether one is stored
 * (and the token's last four characters, to tell two tokens apart).
 */
export function IntegrationsPage({ me, token }: { me: PanelMe; token: string }) {
  return (
    <>
      <PageHeader section="integrations" me={me} />
      <PageBody>
        <div className="flex items-start gap-2.5 rounded-xl bg-[#EEF0FA] px-3.5 py-3 text-[13.5px] leading-relaxed text-dark-ocean">
          <Icon name="lock" size={18} className="mt-0.5" />
          <span>كل بطاقة تُحفظ وحدها. مفتاح أودو ومفتاح Conversions API يُحفظان على الخادم فقط ولا يُعرضان هنا مرة أخرى.</span>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <OdooCard token={token} />
            <WhatsAppCard token={token} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <MetaCard token={token} />
            <DeliveryTimesCard token={token} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

/* ---------------------------------------------------------------- shared */

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** A card's head: the icon tile, the title, the line under it and the state on the left. */
function IntegrationHead({ icon, title, line, status }: { icon: IconName; title: string; line: ReactNode; status?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[17px] font-bold">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#EEF0FA] text-dark-ocean">
            <Icon name={icon} size={19} />
          </span>
          {title}
        </h2>
        {status}
      </div>
      <p className="text-[13.5px] leading-relaxed text-[#5F6373]">{line}</p>
    </div>
  );
}

function StatusPill({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return <Pill tone={on ? 'green' : 'grey'}>{on ? onLabel : offLabel}</Pill>;
}

/** A grey note in a card (values from the server's .env, ...). */
function Note({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'red' }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed',
        tone === 'red' ? 'bg-[#FDE8E8] text-[#A12020]' : 'bg-[#F5F6FA] text-[#3B3E4C]'
      )}
    >
      {tone === 'red' ? <Icon name="warning" size={17} className="mt-0.5" /> : null}
      <span>{children}</span>
    </p>
  );
}

function CardSkeleton({ icon, title }: { icon: IconName; title: string }) {
  return (
    <Card className="flex flex-col gap-4">
      <IntegrationHead icon={icon} title={title} line={<Skeleton className="h-4 w-3/4" />} />
      <Skeleton className="h-[42px]" />
      <Skeleton className="h-[42px]" />
      <Skeleton className="h-[42px] w-28" />
    </Card>
  );
}

function LoadError({ icon, title, error, onRetry }: { icon: IconName; title: string; error: string; onRetry: () => void }) {
  return (
    <Card>
      <IntegrationHead icon={icon} title={title} line="" />
      <p className="mb-3 flex items-center gap-2 text-[14.5px] text-[#A12020]">
        <Icon name="warning" size={18} />
        {error}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </Card>
  );
}

/** The red text button a card ends with («فصل»، «حذف»). */
const dangerClass = 'text-[#A12020] hover:text-[#A12020]';

/** Reads a card's settings once, with a retry - the classic panels' load, minus the toast. */
function useSettings<T>(read: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    read()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(message(err, 'تعذّر تحميل الإعدادات')));
    return () => {
      cancelled = true;
    };
  }, [read]);
  useEffect(load, [load]);
  return { data, error, reload: load };
}

/* ---------------------------------------------------------------- أودو */

type OdooForm = { url: string; db: string; username: string; apiKey: string };

/** GET /api/admin/settings/odoo also says the last failure, which lib/api.ts does not type. */
type OdooPayload = { odoo: OdooSettings; lastError?: { message: string; at: string } | null };

function OdooCard({ token }: { token: string }) {
  const read = useCallback(() => api.adminOdooSettings(token) as Promise<OdooPayload>, [token]);
  const { data, error, reload } = useSettings(read);
  const [settings, setSettings] = useState<OdooSettings | null>(null);
  const [lastError, setLastError] = useState<OdooPayload['lastError']>(null);
  const [form, setForm] = useState<OdooForm>({ url: '', db: '', username: '', apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [synced, setSynced] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSettings(data.odoo);
    setLastError(data.lastError ?? null);
    // The key is never sent back: the field starts empty and stays empty after a save.
    setForm({ url: data.odoo.url, db: data.odoo.db, username: data.odoo.username, apiKey: '' });
  }, [data]);

  const set = (key: keyof OdooForm) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const { odoo } = await api.adminSaveOdoo(token, form);
      setSettings(odoo);
      setForm((f) => ({ ...f, apiKey: '' }));
      toast.success('حُفظت الإعدادات');
    } catch (err) {
      toast.error(message(err, 'تعذّر الحفظ'));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.adminTestOdoo(token);
      const parts = [`المستخدم رقم ${r.uid}`];
      if (r.serverVersion) parts.push(`أودو ${r.serverVersion}`);
      if (typeof r.productCount === 'number') parts.push(`${r.productCount} منتج في فئة المراتب`);
      setTestResult({ ok: true, text: parts.join(' · ') });
      toast.success('الاتصال ناجح');
      const fresh = (await api.adminOdooSettings(token)) as OdooPayload;
      setSettings(fresh.odoo);
      setLastError(fresh.lastError ?? null);
    } catch (err) {
      const text = message(err, 'فشل الاتصال');
      setTestResult({ ok: false, text });
      toast.error(text);
    } finally {
      setTesting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.adminSync(token);
      const text = r.source === 'odoo' ? `تمت المزامنة — ${r.count} منتج من أودو` : `الوضع التجريبي — ${r.count} منتج من ملف المتجر`;
      setSynced(`${text} · ${new Date(r.syncedAt).toLocaleTimeString('ar-LY', { hour: 'numeric', minute: '2-digit' })}`);
      toast.success(text);
    } catch (err) {
      toast.error(message(err, 'تعذّرت المزامنة'));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      const { odoo } = await api.adminClearOdoo(token);
      setSettings(odoo);
      setForm({ url: '', db: '', username: '', apiKey: '' });
      setTestResult(null);
      toast.success('فُصل أودو — عاد المتجر للوضع التجريبي');
    } catch (err) {
      toast.error(message(err, 'تعذّر الفصل'));
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <LoadError icon="box" title="أودو" error={error} onRetry={reload} />;
  if (!settings) return <CardSkeleton icon="box" title="أودو" />;

  // The key would cross the network in clear text.
  const insecure = window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname);

  return (
    <Card>
      <IntegrationHead
        icon="box"
        title="أودو"
        line="عند الربط تُجلب المنتجات والأسعار والكميات من أودو بدل ملف المتجر."
        status={<StatusPill on={settings.configured} onLabel="مربوط" offLabel="غير مربوط" />}
      />

      <div className="flex flex-col gap-3.5">
        {insecure ? (
          <Note tone="red">
            الموقع يعمل على <b>http</b> غير مشفّر، فمفتاح أودو سيُرسل نصاً واضحاً يمكن اعتراضه. فعّل https قبل إدخاله.
          </Note>
        ) : null}
        {settings.fromEnv ? <Note>الإعدادات الحالية من ملف البيئة على الخادم. أي حفظ هنا يتجاوزها.</Note> : null}

        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3.5">
          <Field label="عنوان الخادم" type="url" value={form.url} onChange={set('url')} placeholder="https://mycompany.odoo.com" ltr inputMode="url" autoComplete="off" />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="قاعدة البيانات" value={form.db} onChange={set('db')} placeholder="mycompany" ltr autoComplete="off" />
            <Field label="اسم المستخدم" value={form.username} onChange={set('username')} placeholder="admin@example.com" ltr autoComplete="off" />
          </div>
          <Field
            label="مفتاح API"
            aside={settings.hasApiKey ? '(محفوظ — اتركه فارغاً للإبقاء عليه)' : undefined}
            type="password"
            value={form.apiKey}
            onChange={set('apiKey')}
            placeholder={settings.hasApiKey ? '••••••••••••' : 'المفتاح من إعدادات حسابك في أودو'}
            ltr
            autoComplete="off"
            spellCheck={false}
            hint="يُحفظ على الخادم ولا يُعاد عرضه هنا أبداً."
          />

          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" disabled={saving} aria-busy={saving}>
              <Icon name="check" size={18} />
              {saving ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
            <Button variant="outline" onClick={() => void test()} disabled={testing || !settings.configured} aria-busy={testing}>
              <Icon name="plug" size={18} />
              {testing ? 'جارٍ الاختبار…' : 'اختبار الاتصال'}
            </Button>
            {settings.configured ? (
              <Button variant="outline" className={dangerClass} onClick={() => void disconnect()} disabled={saving}>
                فصل
              </Button>
            ) : null}
          </div>
        </form>

        {testResult ? (
          <p
            dir="auto"
            className={cn('rounded-xl px-3.5 py-3 text-[13.5px]', testResult.ok ? 'bg-[#E3F5E6] text-[#1E6B2E]' : 'bg-[#FDE8E8] text-[#A12020]')}
            role="status"
          >
            {testResult.ok ? 'الاتصال ناجح: ' : ''}
            {testResult.text}
          </p>
        ) : null}
        {!testResult && lastError ? (
          <p className="text-[12.5px] text-[#A12020]" dir="auto">
            آخر خطأ من أودو ({new Date(lastError.at).toLocaleString('ar-LY')}): {lastError.message}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-[#E4E6EE] pt-4">
        <span className="flex flex-col gap-0.5">
          <b className="text-sm">تحديث البيانات</b>
          <span className="text-[12.5px] leading-relaxed text-[#5F6373]">يمسح الذاكرة المؤقتة ويعيد جلب المنتجات فوراً بدل انتظار انتهاء صلاحيتها.</span>
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing} aria-busy={syncing}>
            <Icon name="refresh" size={17} className={syncing ? 'motion-safe:animate-spin' : undefined} />
            مزامنة المنتجات الآن
          </Button>
          {synced ? <span className="text-[12.5px] text-[#5F6373]">{synced}</span> : null}
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- واتساب */

function WhatsAppCard({ token }: { token: string }) {
  const read = useCallback(() => api.adminWhatsappSupportSettings(token), [token]);
  const { data, error, reload } = useSettings(read);
  const [settings, setSettings] = useState<WhatsappSupportSettings | null>(null);
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const apply = (s: WhatsappSupportSettings) => {
    setSettings(s);
    setPhone(s.phone ?? '');
    setText(s.message ?? '');
  };
  useEffect(() => {
    if (data) apply(data.whatsappSupport);
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { whatsappSupport } = await api.adminSaveWhatsappSupport(token, phone.trim(), text);
      apply(whatsappSupport);
      toast.success('حُفظ رقم واتساب — سيظهر زر الدعم المباشر في الصفحة الرئيسية');
    } catch (err) {
      toast.error(message(err, 'تعذّر الحفظ'));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      const { whatsappSupport } = await api.adminClearWhatsappSupport(token);
      setSettings(whatsappSupport);
      setPhone('');
      setText(whatsappSupport.message ?? '');
      toast.success('أُخفي زر واتساب');
    } catch (err) {
      toast.error(message(err, 'تعذّر الفصل'));
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <LoadError icon="chat" title="واتساب" error={error} onRetry={reload} />;
  if (!settings) return <CardSkeleton icon="chat" title="واتساب" />;

  return (
    <Card>
      <IntegrationHead
        icon="chat"
        title="واتساب"
        line="رقم واتساب المتجر بالصيغة الدولية: يظهر زر عائم في الصفحة الرئيسية يفتح محادثة مباشرة مع العميل."
        status={<StatusPill on={settings.configured} onLabel="مفعّل" offLabel="غير مفعّل" />}
      />
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3.5">
        {settings.fromEnv ? <Note>القيمة الحالية من ملف البيئة على الخادم. أي حفظ هنا يتجاوزها.</Note> : null}
        <Field
          label="رقم واتساب"
          value={phone}
          onChange={setPhone}
          placeholder="+218911234567"
          ltr
          inputMode="tel"
          autoComplete="off"
          hint="بالصيغة الدولية مع رمز الدولة (مثال: 218 لليبيا)، بلا مسافات."
        />
        <Field
          label="رسالة الترحيب"
          value={text}
          onChange={setText}
          placeholder="مرحباً، لدي استفسار بخصوص منتجات بريماتكس."
          multiline
          rows={3}
          hint="تُكتب تلقائياً في محادثة واتساب عندما يضغط العميل الزر."
        />
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" disabled={saving} aria-busy={saving}>
            <Icon name="check" size={18} />
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
          {settings.configured ? (
            <Button variant="outline" className={dangerClass} onClick={() => void disconnect()} disabled={saving}>
              فصل
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

/* ---------------------------------------------------------------- ميتا */

const IP_SOURCES: Record<string, string> = {
  'cf-connecting-ip': 'CF-Connecting-IP',
  'x-forwarded-for': 'X-Forwarded-For',
  'x-real-ip': 'X-Real-IP',
  socket: 'الاتصال المباشر',
  'fbi-cookie': 'المتصفح نفسه (_fbi)',
};

/**
 * «عنوان IP للزبون»: what Meta got as each visitor's address since the server
 * started - Meta flags addresses shared by many people, and these numbers show
 * whether that can still happen. And the staff member's own visit, to see which
 * header carries the address on this host.
 */
function IpCheck({ health, you }: { health: IpHealth; you?: YourIp }) {
  const pct = (n: number) => (health.events ? Math.round((n / health.events) * 100) : 0);
  const sources = Object.entries(health.sources).sort((a, b) => b[1] - a[1]);
  // Header names are Latin: isolated, so the Arabic line around them keeps its order.
  const name = (k: string) => <bdi dir={IP_SOURCES[k] && k !== 'socket' && k !== 'fbi-cookie' ? 'ltr' : 'rtl'}>{IP_SOURCES[k] ?? k}</bdi>;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-[#F5F6FA] p-3.5 text-[12.5px] leading-relaxed text-[#5F6373]">
      <span className="text-[13px] font-semibold text-[#1B1F3B]">عنوان IP للزبون</span>
      {health.events ? (
        <>
          <span>
            منذ {new Date(health.since).toLocaleString('ar-LY')}: {health.events.toLocaleString('ar-LY')} حدثاً — بعنوان الزبون {pct(health.sent)}٪، وحُجب عنوان مشترك في {pct(health.shared)}٪، وبلا عنوان {pct(health.none)}٪.
            {health.sent ? ` منها IPv6 (عنوان الجهاز نفسه) ${Math.round(((health.ipv6 ?? 0) / health.sent) * 100)}٪.` : ''}
          </span>
          <span>
            {health.addresses.toLocaleString('ar-LY')} عنواناً مختلفاً خلال آخر 24 ساعة، منها {health.sharedAddresses.toLocaleString('ar-LY')} مشتركة ({health.sharedVisitors} زوار أو أكثر)
            {health.mostVisitorsOnOne ? `، وأكثر عنوان عليه ${health.mostVisitorsOnOne.toLocaleString('ar-LY')} زائراً` : ''}.
          </span>
          {sources.length ? (
            <span>
              مصدر العنوان:{' '}
              {sources.map(([k, n], i) => (
                <span key={k}>
                  {i ? '، ' : ''}
                  {name(k)} — {n.toLocaleString('ar-LY')} حدثاً
                </span>
              ))}
              .
            </span>
          ) : null}
        </>
      ) : (
        <span>لم يُرسل حدث منذ بدء تشغيل الخادم.</span>
      )}
      {you ? (
        <span>
          زيارتك الآن: {you.ip ? <bdi dir="ltr">{you.ip}</bdi> : 'لا عنوان صالح'}
          {you.source ? <>، من {name(you.source)}</> : null}
          {you.headers['x-forwarded-for'] && you.headers['x-forwarded-for'] !== you.ip ? (
            <>
              . السلسلة كاملة: <bdi dir="ltr">{you.headers['x-forwarded-for']}</bdi>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function MetaCard({ token }: { token: string }) {
  const read = useCallback(() => api.adminFacebookPixelSettings(token), [token]);
  const { data, error, reload } = useSettings(read);
  const [settings, setSettings] = useState<FacebookPixelSettings | null>(null);
  const [capi, setCapi] = useState<ConversionsApiStatus | null>(null);
  const [pixelId, setPixelId] = useState('');
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [capiToken, setCapiToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (s: FacebookPixelSettings) => {
    setSettings(s);
    setPixelId(s.pixelId ?? '');
    setRate(s.lydPerUsd ? String(s.lydPerUsd) : '');
  };
  useEffect(() => {
    if (!data) return;
    apply(data.facebookPixel);
    setCapi(data.conversionsApi);
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { facebookPixel } = await api.adminSaveFacebookPixel(token, pixelId.trim(), rate.trim());
      apply(facebookPixel);
      toast.success('حُفظ رقم البكسل — سيعمل على كل الصفحات والمنتجات تلقائياً');
    } catch (err) {
      toast.error(message(err, 'تعذّر الحفظ'));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      const { facebookPixel } = await api.adminClearFacebookPixel(token);
      setSettings(facebookPixel);
      setPixelId('');
      setRate('');
      toast.success('فُصل بكسل فيسبوك');
    } catch (err) {
      toast.error(message(err, 'تعذّر الفصل'));
    } finally {
      setSaving(false);
    }
  }

  /** Write-only: the field empties after a save, and the server keeps the token. */
  async function saveToken(e: FormEvent) {
    e.preventDefault();
    if (!capiToken.trim()) return;
    setSavingToken(true);
    try {
      const { conversionsApi } = await api.adminSaveCapiToken(token, capiToken.trim());
      setCapi((prev) => ({ ...conversionsApi, lastResult: conversionsApi.lastResult ?? prev?.lastResult ?? null }));
      setCapiToken('');
      toast.success('حُفظ المفتاح على الخادم — عمليات الشراء تُرسل لميتا من الآن');
    } catch (err) {
      toast.error(message(err, 'تعذّر حفظ المفتاح'));
    } finally {
      setSavingToken(false);
    }
  }

  async function clearToken() {
    setSavingToken(true);
    try {
      const { conversionsApi } = await api.adminClearCapiToken(token);
      setCapi(conversionsApi);
      toast.success('حُذف المفتاح من لوحة الإدارة');
    } catch (err) {
      toast.error(message(err, 'تعذّر الحذف'));
    } finally {
      setSavingToken(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.adminTestConversionsApi(token, testCode.trim());
      if (r.ok) {
        setTestResult({ ok: true, text: 'وصل الحدث التجريبي — تأكد منه في Events Manager ← Test events' });
        toast.success('وصل الحدث التجريبي — تأكد منه في Events Manager > Test events');
      } else {
        setTestResult({ ok: false, text: `ميتا رفضت: ${r.error}` });
        toast.error(`ميتا رفضت: ${r.error}`);
      }
    } catch (err) {
      const text = message(err, 'تعذّر الاختبار');
      setTestResult({ ok: false, text });
      toast.error(text);
    } finally {
      setTesting(false);
    }
  }

  if (error && !settings) return <LoadError icon="megaphone" title="ميتا" error={error} onRetry={reload} />;
  if (!settings || !capi) return <CardSkeleton icon="megaphone" title="ميتا" />;

  return (
    <Card>
      <IntegrationHead
        icon="megaphone"
        title="ميتا"
        line="رقم الـ Pixel ID وحده يكفي: يُطبَّق تلقائياً على كل الصفحات وكل المنتجات، الحالية والتي تُضاف لاحقاً، بلا أي كود إضافي."
        status={<StatusPill on={settings.configured} onLabel="مفعّل" offLabel="غير مفعّل" />}
      />

      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3.5">
        {settings.fromEnv ? <Note>القيمة الحالية من ملف البيئة على الخادم. أي حفظ هنا يتجاوزها.</Note> : null}
        <Field
          label="رقم الـ Pixel ID"
          value={pixelId}
          onChange={setPixelId}
          placeholder="123456789012345"
          ltr
          inputMode="numeric"
          autoComplete="off"
          hint="تجده في Meta Events Manager. أرقام فقط — لصق كود كامل غير مطلوب ولن يُقبل."
        />
        <Field
          label="سعر الصرف لإعلانات ميتا (دينار لكل دولار)"
          value={rate}
          onChange={(v) => setRate(v.replace(/[^\d.]/g, ''))}
          placeholder="4.85"
          ltr
          inputMode="decimal"
          autoComplete="off"
          hint="ميتا لا تقبل الدينار الليبي، فتُرسَل قيم المشتريات إليها بالدولار بهذا السعر. العميل لا يرى الدولار أبداً — الأسعار في الموقع تبقى بالدينار. اتركه فارغاً لإرسالها بالدينار."
        />
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" disabled={saving} aria-busy={saving}>
            <Icon name="check" size={18} />
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
          {settings.configured ? (
            <Button variant="outline" className={dangerClass} onClick={() => void disconnect()} disabled={saving}>
              فصل
            </Button>
          ) : null}
        </div>
      </form>

      {/* Conversions API: the server reports each purchase itself. */}
      <div className="mt-4 flex flex-col gap-3.5 border-t border-[#E4E6EE] pt-4">
        <div className="flex items-center justify-between gap-3">
          <b className="text-[15px]">Conversions API (من الخادم)</b>
          <Pill tone={capi.configured ? (capi.testMode ? 'amber' : 'green') : 'grey'}>
            {capi.configured ? (capi.testMode ? 'وضع الاختبار' : 'مفعّل') : 'غير مفعّل'}
          </Pill>
        </div>
        <p className="-mt-1.5 text-[12.5px] leading-relaxed text-[#5F6373]">
          يرسل كل عملية شراء من الموقع إلى ميتا من الخادم مباشرة — لا يحجبها مانع الإعلانات ولا قيود آيفون.
        </p>

        {/* The token: write-only - saved on the server, never shown again. */}
        <form onSubmit={(e) => void saveToken(e)} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label="مفتاح Conversions API"
              aside={capi.tokenSource ? '(محفوظ)' : undefined}
              type="password"
              value={capiToken}
              onChange={setCapiToken}
              placeholder={capi.tokenLast4 ? `محفوظ — ينتهي بـ ${capi.tokenLast4}` : 'EAA…'}
              ltr
              autoComplete="off"
              spellCheck={false}
              className="min-w-[200px] flex-1"
            />
            <Button type="submit" disabled={savingToken || !capiToken.trim()} aria-busy={savingToken}>
              {capi.tokenLast4 ? 'استبدال' : 'حفظ المفتاح'}
            </Button>
            {capi.tokenSource === 'dashboard' ? (
              <Button variant="outline" className={dangerClass} disabled={savingToken} onClick={() => void clearToken()}>
                حذف
              </Button>
            ) : null}
          </div>
          <span className="text-[12.5px] leading-relaxed text-[#5F6373]">
            من Events Manager ← SHOP - Brimatex ← الإعدادات ← Conversions API ← Generate access token. يُحفظ على الخادم فقط ولا يظهر مرة ثانية.
            {capi.tokenSource === 'env' ? ' المفتاح الحالي من ملف .env على الخادم — مفتاح يُحفظ هنا يحلّ محله.' : ''}
          </span>
        </form>

        {capi.lastResult ? (
          <p className={cn('text-[12.5px]', capi.lastResult.ok ? 'text-[#5F6373]' : 'text-[#A12020]')}>
            آخر إرسال ({new Date(capi.lastResult.at).toLocaleString('ar-LY')}): {capi.lastResult.ok ? 'وصل إلى ميتا' : `رُفض — ${capi.lastResult.error}`}
          </p>
        ) : null}

        {capi.ipHealth ? <IpCheck health={capi.ipHealth} you={data?.yourIp} /> : null}

        {capi.configured ? (
          <div className="flex flex-col gap-1.5 rounded-xl bg-[#F5F6FA] p-3.5">
            <div className="flex flex-wrap items-end gap-2">
              <Field
                label="رمز الاختبار (ليس المفتاح)"
                value={testCode}
                onChange={setTestCode}
                placeholder="TEST12345"
                ltr
                autoComplete="off"
                spellCheck={false}
                className="w-40"
              />
              <Button variant="outline" disabled={testing || !testCode.trim()} aria-busy={testing} onClick={() => void sendTest()}>
                {testing ? 'جارٍ الإرسال…' : 'إرسال حدث تجريبي'}
              </Button>
            </div>
            <span className="text-[12.5px] leading-relaxed text-[#5F6373]">
              الرمز من Events Manager ← SHOP - Brimatex ← Test events. الحدث التجريبي يظهر هناك فقط ولا يُحسب ضمن البيانات الحقيقية.
            </span>
            {testResult ? (
              <p role="status" className={cn('mt-1 text-[13px] font-semibold', testResult.ok ? 'text-[#1E6B2E]' : 'text-[#A12020]')}>
                {testResult.text}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- مدة التوصيل */

/** «1–3 أيام عمل» - the server's rangeText (src/lib/availability.js), word for word. */
function rangeText([from, to]: [number, number], working = false): string {
  const unit = (n: number) => (n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? 'أيام' : 'يوماً');
  const text = from === to ? (from <= 2 ? unit(from) : `${from} ${unit(from)}`) : `${from}–${to} ${unit(to)}`;
  return working ? `${text} عمل` : text;
}

/**
 * Delivery times (src/lib/availability.js), in place of pre-orders: every
 * size can be ordered and shows «متوفر»; one in stock in Odoo arrives in the
 * first range, one that is not in the second - the customer sees only the
 * days, the warehouse the order's note.
 */
function DeliveryTimesCard({ token }: { token: string }) {
  const read = useCallback(() => api.adminDeliveryTimes(token), [token]);
  const { data, error, reload } = useSettings(read);
  const [times, setTimes] = useState<DeliveryTimes | null>(null);
  const [fields, setFields] = useState({ stockFrom: '', stockTo: '', madeFrom: '', madeTo: '' });
  const [saving, setSaving] = useState(false);

  const apply = (t: DeliveryTimes) => {
    setTimes(t);
    setFields({ stockFrom: String(t.stock[0]), stockTo: String(t.stock[1]), madeFrom: String(t.made[0]), madeTo: String(t.made[1]) });
  };
  useEffect(() => {
    if (data) apply(data.deliveryTimes);
  }, [data]);

  const range = (a: string, b: string): [number, number] | null => {
    const x = Number(a);
    const y = Number(b);
    return Number.isInteger(x) && Number.isInteger(y) && x >= 1 && y <= 60 && x <= y ? [x, y] : null;
  };
  const stock = range(fields.stockFrom, fields.stockTo);
  const made = range(fields.madeFrom, fields.madeTo);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!stock || !made) return;
    setSaving(true);
    try {
      const { deliveryTimes } = await api.adminSaveDeliveryTimes(token, { stock, made });
      apply(deliveryTimes);
      toast.success('حُفظت مدة التوصيل — تظهر للعملاء خلال دقائق');
    } catch (err) {
      toast.error(message(err, 'تعذّر الحفظ'));
    } finally {
      setSaving(false);
    }
  }

  if (error && !times) return <LoadError icon="truck" title="مدة التوصيل" error={error} onRetry={reload} />;
  if (!times) return <CardSkeleton icon="truck" title="مدة التوصيل" />;

  const set = (k: keyof typeof fields) => (v: string) => setFields((f) => ({ ...f, [k]: v.replace(/\D/g, '').slice(0, 2) }));
  const num = { ltr: true, inputMode: 'numeric' as const, autoComplete: 'off', className: 'w-[88px]' };

  return (
    <Card>
      <IntegrationHead
        icon="truck"
        title="مدة التوصيل"
        line="كل المراتب تظهر للعميل «متوفر» ويطلبها. المتوفرة في مخزن أودو تصل في المدة الأولى، وغير المتوفرة في الثانية — ويرى الفريق في ملاحظة الطلب ما ليس في المخزن."
      />
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <b className="text-[14px]">متوفرة في المخزن (أيام عمل)</b>
          <div className="flex items-end gap-2">
            <Field label="من" value={fields.stockFrom} onChange={set('stockFrom')} {...num} />
            <Field label="إلى" value={fields.stockTo} onChange={set('stockTo')} {...num} />
          </div>
          <span className="text-[12.5px] text-[#5F6373]">يرى العميل: «{stock ? `التوصيل خلال ${rangeText(stock, true)}` : '—'}»</span>
        </div>
        <div className="flex flex-col gap-2">
          <b className="text-[14px]">غير متوفرة في المخزن (أيام)</b>
          <div className="flex items-end gap-2">
            <Field label="من" value={fields.madeFrom} onChange={set('madeFrom')} {...num} />
            <Field label="إلى" value={fields.madeTo} onChange={set('madeTo')} {...num} />
          </div>
          <span className="text-[12.5px] text-[#5F6373]">يرى العميل: «{made ? `التوصيل خلال ${rangeText(made)}` : '—'}»، وأقرب يوم توصيل يختاره بعد {made ? made[0] : '—'} أيام عمل.</span>
        </div>
        {!stock || !made ? <span className="text-[12.5px] text-[#A12020]">كل مدة من 1 إلى 60 يوماً، و«من» لا تزيد عن «إلى».</span> : null}
        <div>
          <Button type="submit" disabled={saving || !stock || !made} aria-busy={saving}>
            <Icon name="check" size={18} />
            {saving ? 'جارٍ الحفظ…' : 'حفظ المدة'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
