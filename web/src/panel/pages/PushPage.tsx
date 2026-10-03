import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { shopProducts } from '@/shop/catalog';
import { CITIES } from '@/shop/CityDialog';
import type { Product } from '@/types';

import { panelApi, PanelError, type PanelMe, type PushAudience, type PushCampaign, type PushDraft, type PushPayload, type PushStatus } from '../api';
import { PageBody, PageHeader } from '../Shell';
import { Button, Card, CardHead, ErrorCard, Field, Icon, Pill, Skeleton, type Tone } from '../ui';
import { chevron, linkOptions, selectClass, type LinkOption } from './HomeBannersPage';

/* ────────────────────────────────────────────────────────────── time */

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const LIBYA_MS = 2 * 3600_000;

/** An ISO time as Libya reads it: «5 أكتوبر · 10:00 ص». */
function whenText(iso: string | undefined | null): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms + LIBYA_MS);
  const h = d.getUTCHours();
  const h12 = h % 12 || 12;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${h12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}

/** «22:00» → «10 مساءً», «08:30» → «8:30 صباحاً». */
function hourWords(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  const part = h < 12 ? 'صباحاً' : h === 12 ? 'ظهراً' : 'مساءً';
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${part}`;
}

/** A moment as Libyan local time, YYYY-MM-DDTHH:MM - what the schedule field holds. */
function libyaLocal(ms: number): string {
  return new Date(ms + LIBYA_MS).toISOString().slice(0, 16);
}

function tomorrowAtTen(): string {
  const today = new Date(Date.now() + LIBYA_MS).toISOString().slice(0, 10);
  const next = new Date(Date.parse(`${today}T00:00:00Z`) + 24 * 3600_000).toISOString().slice(0, 10);
  return `${next}T10:00`;
}

/* ────────────────────────────────────────────────────────────── words */

const STATUS: Record<PushStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'مجدول', tone: 'blue' },
  held: { label: 'مؤجَّل', tone: 'amber' },
  sending: { label: 'يُرسَل الآن', tone: 'ocean' },
  sent: { label: 'أُرسل', tone: 'green' },
  failed: { label: 'تعذّر', tone: 'red' },
  cancelled: { label: 'أُلغي', tone: 'grey' },
};

function audienceText(a: PushAudience): string {
  if (a.kind === 'city') return a.city;
  if (a.kind === 'cart') return 'سلة متروكة';
  if (a.kind === 'test') return 'جهازي';
  return 'من فعّل العروض';
}

const devicesText = (n: number) => `${n} جهاز`;

/* ────────────────────────────────────────────────────────────── the form */

type AudienceKind = 'offers' | 'city' | 'cart';

interface Form {
  title: string;
  body: string;
  link: string;
  audience: AudienceKind;
  city: string;
  when: 'now' | 'schedule';
  at: string;
}

const EMPTY: Form = { title: '', body: '', link: '/offers', audience: 'offers', city: '', when: 'now', at: '' };

/** The links a tap may open: the mattresses, the categories and the offers page (the server's list). */
function pushLinks(products: Product[]): LinkOption[] {
  return linkOptions(products).filter((o) => o.group !== 'page' || o.value === '/offers');
}

function draftOf(form: Form, options: LinkOption[]): PushDraft {
  const audience: PushDraft['audience'] = form.audience === 'city' ? { kind: 'city', city: form.city } : { kind: form.audience };
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    link: form.link,
    linkLabel: options.find((o) => o.value === form.link)?.label ?? '',
    audience,
    when: form.when,
    ...(form.when === 'schedule' ? { at: form.at } : {}),
  };
}

/**
 * الإشعارات (AdminPush): an offer notification to the apps - its words with a
 * live preview of how iOS and Android show it, what a tap opens, the audience
 * with its size now, send now or at a time (Libyan), and the log. The server
 * (src/lib/pushCampaigns.js) holds a send inside the quiet hours until they
 * end, skips devices over the weekly limit, and sends through Expo's push
 * service. Admin and marketing.
 */
export function PushPage({ me, token }: { me: PanelMe; token: string }) {
  const [data, setData] = useState<PushPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'send' | 'test' | 'limit' | string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    panelApi
      .push(token)
      .then(setData)
      .catch((err: Error) => setLoadError(err.message));
  }, [token]);
  useEffect(load, [load]);

  useEffect(() => {
    api
      .getProducts()
      .then((r) => setProducts(shopProducts(r.products)))
      .catch(() => setProducts([]));
  }, []);

  const options = useMemo(() => pushLinks(products), [products]);
  const titleMax = data?.limits.titleMax ?? 40;
  const bodyMax = data?.limits.bodyMax ?? 120;

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    const field = key === 'city' ? 'audience.city' : key === 'audience' ? 'audience' : key;
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  }

  /** A mattress chosen with no title yet: «عرض على [اسم المرتبة]» (the copy of NOTIFICATIONS.md). */
  function chooseLink(value: string) {
    const option = options.find((o) => o.value === value);
    setForm((f) => ({
      ...f,
      link: value,
      title: !f.title.trim() && option?.group === 'product' ? `عرض على ${option.label.replace('صفحة منتج: ', '')}`.slice(0, titleMax) : f.title,
    }));
  }

  const cityRows = useMemo(() => {
    const counted = new Map((data?.audiences.cities ?? []).map((c) => [c.city, c]));
    const names = [...(data?.audiences.cities ?? []).map((c) => c.city), ...CITIES.filter((c) => !counted.has(c))];
    return names.map((city) => ({ city, devices: counted.get(city)?.devices ?? 0, atLimit: counted.get(city)?.atLimit ?? 0 }));
  }, [data]);

  const size = useMemo(() => {
    if (!data) return null;
    if (form.audience === 'city') return form.city ? cityRows.find((c) => c.city === form.city) ?? { devices: 0, atLimit: 0 } : null;
    return data.audiences[form.audience];
  }, [data, form.audience, form.city, cityRows]);

  function reply(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback;
    if (err instanceof PanelError && err.field) setErrors((e) => ({ ...e, [err.field!]: message }));
    toast.error(message);
  }

  function checkLocally(): boolean {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'اكتب عنوان الإشعار';
    if (!form.body.trim()) next.body = 'اكتب نص الإشعار';
    if (form.audience === 'city' && !form.city) next['audience.city'] = 'اختر المدينة';
    if (form.when === 'schedule' && !form.at) next.at = 'اختر تاريخ الإرسال ووقته';
    setErrors(next);
    return !Object.keys(next).length;
  }

  function submit() {
    if (!checkLocally()) return;
    if (form.when === 'now' && !data?.quietHours.now) setConfirm(true);
    else void send();
  }

  async function send() {
    setConfirm(false);
    setBusy('send');
    try {
      const r = await panelApi.sendPush(token, draftOf(form, options));
      setData(r);
      setForm({ ...EMPTY, at: '' });
      const c = r.campaign;
      if (c.status === 'held') toast.success(`مؤجَّل حتى ${whenText(c.sendAt)}: ساعات الهدوء`);
      else if (c.status === 'scheduled') toast.success(`جُدول الإشعار: ${whenText(c.sendAt)}`);
      else if (c.status === 'sent') toast.success(`أُرسل إلى ${devicesText(c.counts?.sent ?? 0)}${c.counts?.skipped ? `، وتُخطّي ${c.counts.skipped} بلغت الحد` : ''}`);
      else toast.error('تعذّر الإرسال، راجع السجل');
    } catch (err) {
      reply(err, 'تعذّر الإرسال');
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'اكتب عنوان الإشعار';
    if (!form.body.trim()) next.body = 'اكتب نص الإشعار';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy('test');
    try {
      const { title, body, link, linkLabel } = draftOf(form, options);
      const r = await panelApi.testPush(token, { title, body, link, linkLabel });
      setData(r);
      if (r.campaign.counts?.sent) toast.success(r.campaign.counts.sent === 1 ? 'أُرسل إلى جهازك' : `أُرسل إلى أجهزتك (${r.campaign.counts.sent})`);
      else toast.error('لم يصل إلى جهازك، تأكد أن الإشعارات مفعّلة في التطبيق');
    } catch (err) {
      reply(err, 'تعذّر الإرسال التجريبي');
    } finally {
      setBusy(null);
    }
  }

  async function setLimit(perWeek: number) {
    setBusy('limit');
    try {
      setData(await panelApi.setPushLimit(token, perWeek));
      toast.success('حُفظ الحد الأسبوعي');
    } catch (err) {
      reply(err, 'تعذّر الحفظ');
    } finally {
      setBusy(null);
    }
  }

  async function cancel(c: PushCampaign) {
    setBusy(c.id);
    try {
      setData(await panelApi.cancelPush(token, c.id));
      toast.success('أُلغي الإشعار المجدول');
    } catch (err) {
      reply(err, 'تعذّر الإلغاء');
    } finally {
      setBusy(null);
    }
  }

  const quiet = data?.quietHours;
  const heldNow = form.when === 'now' && quiet?.now;

  return (
    <>
      <PageHeader section="push" me={me} />
      <PageBody>
        {loadError ? <ErrorCard message={loadError} onRetry={load} /> : null}
        {!data ? (
          loadError ? null : <PushSkeleton />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Card className="min-w-0">
              <CardHead title="إشعار جديد" aside={<Pill tone="ocean">عرض</Pill>} />
              <div className="flex flex-col gap-3">
                <Field
                  label="العنوان"
                  value={form.title}
                  onChange={(v) => set('title', v)}
                  maxLength={titleMax}
                  placeholder="عرض على [اسم المرتبة]"
                  error={errors.title || undefined}
                  hint={`${form.title.length}/${titleMax} حرفاً`}
                />
                <Field
                  label="النص"
                  value={form.body}
                  onChange={(v) => set('body', v)}
                  maxLength={bodyMax}
                  placeholder="خصم [النسبة]٪ حتى [تاريخ النهاية]. اطلب والدفع عند الاستلام."
                  multiline
                  error={errors.body || undefined}
                  hint={`${form.body.length}/${bodyMax} حرفاً. يظهر كاملاً في iOS وأندرويد حتى ${bodyMax} حرفاً`}
                />
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-[#5F6373]">يفتح عند الضغط</span>
                  <select
                    value={form.link}
                    onChange={(e) => chooseLink(e.target.value)}
                    aria-invalid={Boolean(errors.link)}
                    className={cn(selectClass, errors.link && 'shadow-[inset_0_0_0_1.5px_#A12020]')}
                    style={{ backgroundImage: chevron }}
                  >
                    {(['product', 'category', 'page'] as const).map((g) => (
                      <optgroup key={g} label={g === 'product' ? 'المراتب' : g === 'category' ? 'الفئات' : 'صفحات'}>
                        {options
                          .filter((o) => o.group === g)
                          .map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    <option value="">لا شيء: يفتح التطبيق</option>
                  </select>
                  {errors.link ? <span className="text-[12.5px] text-[#A12020]">{errors.link}</span> : null}
                </label>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-[13px] font-semibold text-[#5F6373]">الجمهور</legend>
                  <AudienceRow checked={form.audience === 'offers'} onSelect={() => set('audience', 'offers')} label="كل من فعّل «العروض»" aside={devicesText(data.audiences.offers.devices)} />
                  <AudienceRow
                    checked={form.audience === 'city'}
                    onSelect={() => set('audience', 'city')}
                    label="مدينة معيّنة"
                    aside={form.audience === 'city' && form.city ? devicesText(size?.devices ?? 0) : 'اختر المدينة'}
                  >
                    {form.audience === 'city' ? (
                      <select
                        value={form.city}
                        onChange={(e) => set('city', e.target.value)}
                        aria-label="المدينة"
                        aria-invalid={Boolean(errors['audience.city'])}
                        className={cn(selectClass, 'mt-2', errors['audience.city'] && 'shadow-[inset_0_0_0_1.5px_#A12020]')}
                        style={{ backgroundImage: chevron }}
                      >
                        <option value="">اختر المدينة</option>
                        {cityRows.map((c) => (
                          <option key={c.city} value={c.city}>
                            {c.city} · {devicesText(c.devices)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {errors['audience.city'] ? <span className="mt-1 block text-[12.5px] text-[#A12020]">{errors['audience.city']}</span> : null}
                  </AudienceRow>
                  <AudienceRow checked={form.audience === 'cart'} onSelect={() => set('audience', 'cart')} label="من أضاف للسلة ولم يطلب خلال 7 أيام" aside={devicesText(data.audiences.cart.devices)} />
                  <AudienceRow checked={false} disabled label="من شاهد مرتبة معيّنة" aside={<Pill tone="grey">قريباً</Pill>} />
                  <span className="text-[12.5px] leading-relaxed text-[#5F6373]">
                    {size && size.atLimit ? `منها ${size.atLimit} بلغت الحد الأسبوعي وستُتخطّى. ` : ''}
                    {data.devices.offersOff ? `${devicesText(data.devices.offersOff)} لم يفعّل «العروض» في التطبيق، فلا يصله شيء.` : ''}
                  </span>
                  {errors.audience ? <span className="text-[12.5px] text-[#A12020]">{errors.audience}</span> : null}
                </fieldset>

                <div className="flex gap-3">
                  <label className="flex w-1/2 min-w-0 flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-[#5F6373]">الإرسال</span>
                    <select
                      value={form.when}
                      onChange={(e) => {
                        const when = e.target.value as Form['when'];
                        setForm((f) => ({ ...f, when, at: when === 'schedule' && !f.at ? tomorrowAtTen() : f.at }));
                      }}
                      className={selectClass}
                      style={{ backgroundImage: chevron }}
                    >
                      <option value="now">الآن</option>
                      <option value="schedule">مجدول</option>
                    </select>
                  </label>
                  <label className="flex w-1/2 min-w-0 flex-col gap-1.5">
                    <span className="text-[13px] font-semibold text-[#5F6373]">الموعد {form.when === 'schedule' ? <span className="font-normal">· بتوقيت ليبيا</span> : null}</span>
                    {form.when === 'schedule' ? (
                      <input
                        type="datetime-local"
                        value={form.at}
                        min={libyaLocal(Date.now())}
                        onChange={(e) => set('at', e.target.value)}
                        aria-invalid={Boolean(errors.at)}
                        dir="ltr"
                        className={cn(
                          'h-[42px] w-full min-w-0 rounded-[10px] bg-white px-3 text-right text-[14.5px] text-[#16161F] outline-none focus-visible:shadow-[inset_0_0_0_1.5px_#282868]',
                          errors.at ? 'shadow-[inset_0_0_0_1.5px_#A12020]' : 'shadow-[inset_0_0_0_1px_#E4E6EE]'
                        )}
                      />
                    ) : (
                      <span className="flex h-[42px] items-center rounded-[10px] bg-[#F5F6FA] px-3 text-[14.5px] text-[#5F6373]">
                        {heldNow && quiet?.endsAt ? `يُؤجَّل حتى ${whenText(quiet.endsAt)}` : 'فور الإرسال'}
                      </span>
                    )}
                    {errors.at ? <span className="text-[12.5px] text-[#A12020]">{errors.at}</span> : null}
                  </label>
                </div>

                {heldNow ? (
                  <Note tone="amber" icon="clock">
                    نحن الآن في ساعات الهدوء: يُحفظ الإشعار ويُرسل تلقائياً عند {hourWords(quiet!.to)}.
                  </Note>
                ) : null}
                <Note tone="ocean" icon="clock">
                  لا يُرسل بين {hourWords(data.quietHours.from)} و{hourWords(data.quietHours.to)}، ويُؤجَّل {Number(data.quietHours.to.slice(0, 2)) < 12 ? 'للصباح' : `حتى ${hourWords(data.quietHours.to)}`}. الحد {data.perWeek} إشعارات عروض في الأسبوع لكل جهاز. إشعارات الطلبات
                  ورمز الدخول تلقائية من أودو ولا تُرسل من هنا.
                </Note>

                <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#5F6373]">
                  <label htmlFor="push-limit" className="font-semibold">
                    الحد الأسبوعي لكل جهاز
                  </label>
                  <select
                    id="push-limit"
                    value={data.perWeek}
                    disabled={busy === 'limit'}
                    onChange={(e) => void setLimit(Number(e.target.value))}
                    className={cn(selectClass, 'h-9 w-[84px] text-[13.5px]')}
                    style={{ backgroundImage: chevron }}
                  >
                    {Array.from({ length: data.limits.perWeekMax }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span>يُحفظ مع سجل الإشعارات</span>
                </div>
              </div>

              <div className="mt-[18px] flex flex-wrap gap-2.5">
                <Button onClick={submit} disabled={busy === 'send'} aria-busy={busy === 'send'}>
                  <Icon name={form.when === 'schedule' ? 'clock' : 'bell'} size={18} />
                  {form.when === 'schedule' ? 'جدولة الإشعار' : 'إرسال الإشعار'}
                </Button>
                <Button variant="outline" onClick={() => void sendTest()} disabled={busy === 'test'} aria-busy={busy === 'test'}>
                  إرسال تجريبي لجهازي
                </Button>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-[#5F6373]">
                {data.myDevices
                  ? `التجريبي يصل إلى ${data.myDevices === 1 ? 'جهازك المسجّل' : `أجهزتك المسجّلة (${data.myDevices})`} فقط، ولا يُحسب في الحد. `
                  : 'لا جهاز مسجّل لحسابك بعد: افتح التطبيق وادخل بحسابك نفسه وفعّل الإشعارات. '}
                يُرسل عبر خدمة إشعارات Expo، وهي التي يسجّل بها التطبيقان أجهزتهما، ومنها تصل الإشعارات إلى Apple وGoogle.
              </p>
            </Card>

            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardHead title="المعاينة" />
                <Preview title={form.title} body={form.body} />
              </Card>
              <Card className="p-4">
                <CardHead title="السجل" />
                <Log campaigns={data.campaigns} busy={busy} onCancel={(c) => void cancel(c)} />
              </Card>
            </div>
          </div>
        )}
      </PageBody>

      <Dialog open={confirm} onOpenChange={(open) => !open && setConfirm(false)}>
        <DialogContent dir="rtl" className="max-w-md bg-white font-sans text-[#16161F]">
          <DialogTitle className="font-display text-xl font-bold">إرسال الإشعار الآن؟</DialogTitle>
          <DialogDescription className="text-[14.5px] leading-relaxed text-[#5F6373]">
            يصل «{form.title.trim()}» إلى {devicesText(Math.max(0, (size?.devices ?? 0) - (size?.atLimit ?? 0)))} الآن
            {size?.atLimit ? `، ويُتخطّى ${size.atLimit} بلغت الحد الأسبوعي` : ''}. لا يمكن سحب الإشعار بعد إرساله.
          </DialogDescription>
          <DialogFooter className="gap-2 sm:justify-start sm:gap-2">
            <Button onClick={() => void send()}>إرسال</Button>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ────────────────────────────────────────────────────────────── pieces */

function AudienceRow({
  checked,
  onSelect,
  label,
  aside,
  disabled,
  children,
}: {
  checked: boolean;
  onSelect?: () => void;
  label: string;
  aside: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[10px] px-3 py-2.5',
        checked ? 'bg-[#FAFAFE] shadow-[inset_0_0_0_2px_#282868]' : 'shadow-[inset_0_0_0_1px_#E4E6EE]',
        disabled && 'opacity-60'
      )}
    >
      <label className={cn('flex items-center gap-2.5', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input type="radio" name="push-audience" checked={checked} disabled={disabled} onChange={() => onSelect?.()} className="sr-only" />
        <span
          aria-hidden
          className={cn('size-[18px] shrink-0 rounded-full', checked ? 'shadow-[inset_0_0_0_6px_#282868]' : 'shadow-[inset_0_0_0_2px_#B5B8C5]')}
        />
        <span className="flex-1 text-sm">{label}</span>
        <span className="text-[12.5px] text-[#5F6373]">{aside}</span>
      </label>
      {children}
    </div>
  );
}

function Note({ tone, icon, children }: { tone: 'ocean' | 'amber'; icon: 'clock'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13.5px] leading-relaxed',
        tone === 'ocean' ? 'bg-[#EEF0FA] text-dark-ocean' : 'bg-[#FFF4D6] text-[#7A5300]'
      )}
    >
      <Icon name={icon} size={18} className="mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

/** How iOS and Android show it (AdminPush's «المعاينة»). */
function Preview({ title, body }: { title: string; body: string }) {
  const t = title.trim() || 'عرض على [اسم المرتبة]';
  const b = body.trim() || 'خصم [النسبة]٪ حتى [تاريخ النهاية]. اطلب والدفع عند الاستلام.';
  const empty = !title.trim() && !body.trim();
  return (
    <div className={cn('flex flex-col gap-3.5', empty && 'opacity-60')}>
      <span className="text-[12.5px] font-semibold text-[#5F6373]">iOS</span>
      <div className="flex gap-2.5 rounded-[18px] bg-[rgba(245,245,250,.95)] p-3 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
        <img src="/apple-touch-icon.png" alt="" className="size-[34px] shrink-0 rounded-lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="flex justify-between gap-2">
            <b className="truncate text-[13px]">{t}</b>
            <span className="shrink-0 text-[11px] text-[#8a8a93]">الآن</span>
          </span>
          <span className="break-words text-[12.5px] text-[#333]">{b}</span>
        </span>
      </div>
      <span className="text-[12.5px] font-semibold text-[#5F6373]">أندرويد</span>
      <div className="flex gap-2.5 rounded-[22px] bg-[#FCF8FF] px-3.5 py-3 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
        <img src="/apple-touch-icon.png" alt="" className="size-6 shrink-0 rounded-full" />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-[11px] text-[#47464F]">بريماتكس · الآن</span>
          <b className="text-[13px] font-medium">{t}</b>
          <span className="break-words text-[12.5px] text-[#47464F]">{b}</span>
        </span>
      </div>
    </div>
  );
}

function Log({ campaigns, busy, onCancel }: { campaigns: PushCampaign[]; busy: string | null; onCancel: (c: PushCampaign) => void }) {
  if (!campaigns.length) {
    return <p className="px-1 pb-2 text-sm text-[#5F6373]">لم يُرسل إشعار عرض بعد. ما تُرسله أو تجدوله يظهر هنا.</p>;
  }
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-right">
        <thead>
          <tr className="text-[12.5px] font-semibold text-[#5F6373]">
            {['الإشعار', 'الجمهور', 'الحالة', 'أُرسل', 'الموعد', ''].map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 pb-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const status = c.test ? { label: 'تجريبي', tone: 'teal' as Tone } : STATUS[c.status];
            const when = c.sentAt ?? (c.status === 'cancelled' ? c.cancelledAt : c.sendAt);
            return (
              <tr key={c.id} className="align-middle text-[13.5px]">
                <td className="border-t border-[#E4E6EE] p-3">
                  <b className="block">{c.title}</b>
                  <span className="text-[12px] text-[#5F6373]">{c.by.name ? `بواسطة ${c.by.name}` : ''}</span>
                </td>
                <td className="border-t border-[#E4E6EE] p-3">{audienceText(c.audience)}</td>
                <td className="border-t border-[#E4E6EE] p-3">
                  <Pill tone={status.tone}>{status.label}</Pill>
                </td>
                <td className="border-t border-[#E4E6EE] p-3">
                  {c.counts ? (
                    <>
                      <span className="block">{c.counts.sent}</span>
                      {c.counts.skipped || c.counts.failed ? (
                        <span className="block whitespace-nowrap text-[12px] text-[#5F6373]">
                          {[c.counts.skipped ? `تُخطّي ${c.counts.skipped}` : '', c.counts.failed ? `تعذّر ${c.counts.failed}` : ''].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="border-t border-[#E4E6EE] p-3">
                  <span className="block whitespace-nowrap">{whenText(when)}</span>
                  {c.status === 'held' ? <span className="text-[12px] text-[#7A5300]">ساعات الهدوء</span> : null}
                </td>
                <td className="border-t border-[#E4E6EE] p-3 text-left">
                  {c.status === 'scheduled' || c.status === 'held' ? (
                    <button
                      type="button"
                      onClick={() => onCancel(c)}
                      disabled={busy === c.id}
                      className="text-[13px] font-semibold text-[#A12020] underline disabled:opacity-50"
                    >
                      إلغاء
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PushSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-[42px] w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[42px] w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="flex flex-col gap-3">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    </div>
  );
}
