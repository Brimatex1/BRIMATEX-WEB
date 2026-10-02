import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { displayName, shopProducts } from '@/shop/catalog';
import { photoOf } from '@/shop/ProductCard';
import { recommend, type QuizAnswers } from '@/shop/quiz';
import type { Product } from '@/types';

import { panelApi, PanelError, type PanelMe, type QuizPayload, type QuizRules } from '../api';
import { PageBody, PageHeader } from '../Shell';
import { Button, Card, CardHead, ErrorCard, Field, Icon, Pill, Skeleton, Switch, Thumb, TierPill } from '../ui';

/** What a reason sentence is for - the tags of docs/QUIZ.md, in words. */
const TAG_LABEL: Record<string, string> = {
  _default: 'الجملة العامة',
  back_pain: 'آلام الظهر',
  high_flex: 'مرونة عالية',
  pressure_relief: 'تخفيف الضغط',
  spine_support: 'دعم العمود الفقري',
  motion_isolation: 'عزل الحركة',
  athlete_support: 'دعم الرياضيين',
  cool_fabric: 'قماش بارد',
  economy: 'سعر اقتصادي',
  support: 'الدعم',
  medical_support: 'دعم طبي',
  edge_support: 'دعم الحواف',
  springs: 'النوابض',
  foam: 'الإسفنج',
  summer_winter: 'صيف شتاء',
  ventilation: 'التهوية',
  deep_sleep: 'نوم عميق',
};

const REASON_MAX = 220;
const LABEL_MAX = 60;
const TITLE_MAX = 80;
const SUBTITLE_MAX = 160;
const SAME_PAIR = 'الخيار الأول والبديل يجب أن يختلفا';
const NOT_IN_CATALOGUE = 'غير موجودة في الكتالوج';

/** The test block's three answers - the prototype's opening example. */
const FIRST_TEST: QuizAnswers = { who: 'me', position: 'side', need: 'joints' };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const length = (s: string) => [...s.trim()].length;

/**
 * ساعدني أختار (AdminQuiz): the pair (first choice and alternative) for each
 * answer to question 3, each answer on or off, the reason sentences per
 * mattress, the questions' wording - and «جرّب القواعد», which runs the
 * website's own engine (shop/quiz.ts) on the live catalogue with the rules as
 * edited, before they are saved. «حفظ التغييرات» stores the whole rules in
 * Odoo's brimatex.app.quiz (src/lib/quizRules.js); the website and the apps read
 * them from /api/app/v1/config. Admin and marketing.
 */
export function QuizRulesPage({ me, token }: { me: PanelMe; token: string }) {
  const [data, setData] = useState<QuizPayload | null>(null);
  const [rules, setRules] = useState<QuizRules | null>(null);
  const [baseline, setBaseline] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'save' | 'reset' | null>(null);
  const [serverError, setServerError] = useState<{ field: string; message: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);

  const take = useCallback((r: QuizPayload) => {
    setData(r);
    setRules(clone(r.rules));
    setBaseline(JSON.stringify(r.rules));
    setServerError(null);
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    panelApi
      .quiz(token)
      .then(take)
      .catch((err: Error) => setLoadError(err.message));
  }, [token, take]);
  useEffect(load, [load]);

  // The catalogue the website sells from - the test block and «غير موجودة في الكتالوج».
  useEffect(() => {
    api
      .getProducts()
      .then((r) => setProducts(shopProducts(r.products)))
      .catch(() => setProducts([]));
  }, []);

  const inShop = useMemo(() => {
    const map = new Map<string, Product>();
    if (!rules || !products) return map;
    for (const [key, m] of Object.entries(rules.mattresses)) {
      const p = products.find((x) => displayName(x) === m.name);
      if (p) map.set(key, p);
    }
    return map;
  }, [rules, products]);

  const dirty = Boolean(rules) && JSON.stringify(rules) !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** The checks the server makes, here first: so the error sits at its field before «حفظ». */
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!rules) return out;
    for (const q of rules.questions) {
      if (!length(q.title)) out[`questions.${q.id}.title`] = 'عنوان السؤال مطلوب';
      else if (length(q.title) > TITLE_MAX) out[`questions.${q.id}.title`] = `${TITLE_MAX} حرفاً كحد أقصى`;
      if (q.subtitle && length(q.subtitle) > SUBTITLE_MAX) out[`questions.${q.id}.subtitle`] = `${SUBTITLE_MAX} حرفاً كحد أقصى`;
      for (const o of q.options) {
        if (!length(o.label)) out[`questions.${q.id}.${o.id}.label`] = 'نص الإجابة مطلوب';
        else if (length(o.label) > LABEL_MAX) out[`questions.${q.id}.${o.id}.label`] = `${LABEL_MAX} حرفاً كحد أقصى`;
        if (q.id === 'need' && o.pair && o.pair[0] === o.pair[1]) out[`questions.need.${o.id}.pair`] = SAME_PAIR;
      }
    }
    for (const [key, m] of Object.entries(rules.mattresses)) {
      for (const [tag, sentence] of Object.entries(m.reasons)) {
        if (!length(sentence)) out[`mattresses.${key}.reasons.${tag}`] = 'الجملة مطلوبة';
        else if (length(sentence) > REASON_MAX) out[`mattresses.${key}.reasons.${tag}`] = `${REASON_MAX} حرفاً كحد أقصى`;
      }
    }
    return out;
  }, [rules]);
  const errorFor = (field: string) => errors[field] ?? (serverError?.field === field ? serverError.message : undefined);
  const invalid = Object.keys(errors).length > 0;

  function update(change: (draft: QuizRules) => void) {
    setRules((r) => {
      if (!r) return r;
      const next = clone(r);
      change(next);
      return next;
    });
    setServerError(null);
  }

  async function save() {
    if (!rules || !dirty || saving) return;
    if (invalid) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    setSaving('save');
    try {
      take(await panelApi.saveQuiz(token, rules));
      toast.success('حُفظت قواعد «ساعدني أختار»، وتصل التطبيقين والموقع الآن');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر الحفظ';
      if (err instanceof PanelError && err.field) setServerError({ field: err.field, message });
      toast.error(message);
    } finally {
      setSaving(null);
    }
  }

  async function reset() {
    setSaving('reset');
    try {
      take(await panelApi.resetQuiz(token));
      setConfirmReset(false);
      toast.success('عادت قواعد المصنع');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّرت الاستعادة');
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <PageHeader
        section="quiz"
        me={me}
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={!rules || saving !== null}>
              <Icon name="refresh" size={18} />
              استعادة قواعد المصنع
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || saving !== null} aria-busy={saving === 'save'}>
              <Icon name="check" size={18} />
              {saving === 'save' ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
            </Button>
          </>
        }
      />
      <PageBody>
        {loadError ? <ErrorCard message={loadError} onRetry={load} /> : null}
        {!rules || !data ? (
          loadError ? null : <PageSkeleton />
        ) : (
          <>
            <p className="flex items-start gap-2.5 rounded-xl bg-[#EEF0FA] px-3.5 py-3 text-[13.5px] leading-relaxed text-dark-ocean">
              <Icon name="help" size={18} className="mt-0.5" />
              <span>السؤال الثالث يحدد مرتبتين: الخيار الأول والبديل. أول سؤالين يرتّبان بينهما فقط. التغيير هنا يُحفظ في quiz-rules ويصل التطبيقين والموقع بدون تحديث.</span>
            </p>
            {/* Wide: the test beside the rules, following the page; narrow: right after the pairs it tests. */}
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
              <div className="min-w-0 xl:col-start-1 xl:row-start-1">
                <PairsCard rules={rules} inShop={inShop} catalogueReady={products !== null} update={update} errorFor={errorFor} />
              </div>
              <div className="min-w-0 xl:sticky xl:top-6 xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:self-start">
                <TestCard rules={rules} products={products} inShop={inShop} />
              </div>
              <div className="min-w-0 xl:col-start-1">
                <ReasonsCard rules={rules} inShop={inShop} catalogueReady={products !== null} update={update} errorFor={errorFor} />
              </div>
              <div className="min-w-0 xl:col-start-1">
                <WordingCard rules={rules} update={update} errorFor={errorFor} />
              </div>
            </div>
          </>
        )}
      </PageBody>

      <Dialog open={confirmReset} onOpenChange={(open) => !open && saving !== 'reset' && setConfirmReset(false)}>
        <DialogContent dir="rtl" className="max-w-md bg-white font-sans text-[#16161F]">
          <DialogTitle className="font-display text-xl font-bold">استعادة قواعد المصنع؟</DialogTitle>
          <DialogDescription className="text-[14.5px] leading-relaxed text-[#5F6373]">
            تعود الأزواج والجمل ونصوص الأسئلة كما أرسلها المصنع، وتُفعَّل كل الإجابات. يصل ذلك التطبيقين والموقع فوراً
            {dirty ? '، وتُلغى التعديلات التي لم تُحفظ' : ''}.
          </DialogDescription>
          <DialogFooter className="gap-2 sm:justify-start sm:gap-2">
            <Button disabled={saving === 'reset'} onClick={() => void reset()}>
              <Icon name="refresh" size={18} />
              {saving === 'reset' ? 'جارٍ الاستعادة…' : 'استعادة'}
            </Button>
            <Button variant="outline" disabled={saving === 'reset'} onClick={() => setConfirmReset(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Update = (change: (draft: QuizRules) => void) => void;
type ErrorFor = (field: string) => string | undefined;

/* ────────────────────────────────────────────────────────────── the pairs */

function PairsCard({
  rules,
  inShop,
  catalogueReady,
  update,
  errorFor,
}: {
  rules: QuizRules;
  inShop: Map<string, Product>;
  catalogueReady: boolean;
  update: Update;
  errorFor: ErrorFor;
}) {
  const need = rules.questions.find((q) => q.id === 'need');
  if (!need) return null;
  const onCount = need.options.filter((o) => o.enabled !== false).length;

  return (
    <Card className="p-4 sm:p-[22px]">
      <CardHead title="أزواج الاقتراح · السؤال 3" aside={<Pill tone="ocean">{need.options.length} إجابات</Pill>} />
      <div className="hidden grid-cols-[minmax(96px,120px)_minmax(0,1fr)_minmax(0,1fr)_52px] gap-3 px-1 pb-2.5 text-[12.5px] font-semibold text-[#5F6373] md:grid">
        <span>إجابة العميل</span>
        <span>الخيار الأول</span>
        <span>البديل</span>
        <span>مفعّل</span>
      </div>
      <ul className="flex flex-col">
        {need.options.map((o, index) => {
          const pair = o.pair ?? ['', ''];
          const on = o.enabled !== false;
          const lastOn = on && onCount === 1;
          const error = errorFor(`questions.need.${o.id}.pair`);
          const missing = catalogueReady ? pair.filter((k) => k && !inShop.has(k)) : [];
          const setPair = (slot: 0 | 1, key: string) =>
            update((d) => {
              const opt = d.questions.find((q) => q.id === 'need')!.options[index];
              const next: [string, string] = [...(opt.pair ?? ['', ''])] as [string, string];
              next[slot] = key;
              opt.pair = next;
            });
          return (
            <li key={o.id} className="flex flex-col gap-2 border-t border-[#E4E6EE] py-3 md:grid md:grid-cols-[minmax(96px,120px)_minmax(0,1fr)_minmax(0,1fr)_52px] md:items-center md:gap-3">
              <div className="flex items-center justify-between gap-3 md:contents">
                <b className={cn('text-sm leading-snug md:order-1', !on && 'text-[#5F6373] line-through decoration-[#C9CCDA]')}>{o.label}</b>
                <span className="flex items-center gap-2 md:order-4 md:justify-start">
                  <span className="text-[12.5px] text-[#5F6373] md:hidden">مفعّل</span>
                  <Switch
                    checked={on}
                    disabled={lastOn}
                    label={`تفعيل «${o.label}»`}
                    onChange={(v) =>
                      update((d) => {
                        const opt = d.questions.find((q) => q.id === 'need')!.options[index];
                        if (v) delete opt.enabled;
                        else opt.enabled = false;
                      })
                    }
                  />
                </span>
              </div>
              <MattressSelect className="md:order-2" label="الخيار الأول" answer={o.label} value={pair[0]} rules={rules} inShop={inShop} catalogueReady={catalogueReady} invalid={Boolean(error)} onChange={(k) => setPair(0, k)} />
              <MattressSelect className="md:order-3" label="البديل" answer={o.label} value={pair[1]} rules={rules} inShop={inShop} catalogueReady={catalogueReady} invalid={Boolean(error)} onChange={(k) => setPair(1, k)} />
              {error || missing.length || lastOn ? (
                <span className="flex flex-col gap-0.5 text-[12.5px] md:order-5 md:col-span-4">
                  {error ? (
                    <span className="flex items-center gap-1.5 text-[#A12020]" role="alert">
                      <Icon name="warning" size={15} />
                      {error}
                    </span>
                  ) : null}
                  {missing.length ? (
                    <span className="text-[#7A5300]">
                      {missing.map((k) => rules.mattresses[k]?.name).join(' و')} {NOT_IN_CATALOGUE}: يقترح الموقع والتطبيق مرتبة أخرى بدلها حتى تُضاف.
                    </span>
                  ) : null}
                  {lastOn ? <span className="text-[#5F6373]">آخر إجابة مفعّلة في السؤال: تبقى مفعّلة.</span> : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** A select over the rules' mattresses: photo, name, tier - and «غير موجودة في الكتالوج». */
function MattressSelect({
  className,
  label,
  answer,
  value,
  rules,
  inShop,
  catalogueReady,
  invalid,
  onChange,
}: {
  className?: string;
  label: string;
  answer: string;
  value: string;
  rules: QuizRules;
  inShop: Map<string, Product>;
  catalogueReady: boolean;
  invalid: boolean;
  onChange: (key: string) => void;
}) {
  const m = rules.mattresses[value];
  const photo = (key: string) => {
    const p = inShop.get(key);
    return p ? photoOf(p) : null;
  };
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[12px] font-semibold text-[#5F6373] md:hidden">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={`${label} لـ«${answer}»: ${m?.name ?? ''}`}
          aria-invalid={invalid}
          className={cn(
            'h-[52px] rounded-xl border-0 bg-white px-2.5 text-[#16161F]',
            invalid ? 'shadow-[inset_0_0_0_1.5px_#A12020]' : 'shadow-[inset_0_0_0_1px_#E4E6EE]'
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Thumb src={photo(value)} size={34} />
            <b className="min-w-0 truncate text-[14px] font-semibold">{m?.name ?? 'اختر مرتبة'}</b>
            {catalogueReady && m && !inShop.has(value) ? <Icon name="warning" size={15} className="text-[#B7791F]" aria-label={NOT_IN_CATALOGUE} /> : null}
            <TierPill tier={m?.tier} className="ms-auto" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-white font-sans text-[#16161F]" dir="rtl">
          {Object.entries(rules.mattresses).map(([key, x]) => (
            <SelectItem key={key} value={key} className="py-2">
              <span className="flex items-center gap-2.5">
                <Thumb src={photo(key)} size={30} />
                <span className="flex flex-col">
                  <b className="text-[14px] font-semibold">{x.name}</b>
                  {catalogueReady && !inShop.has(key) ? <span className="text-[11.5px] text-[#7A5300]">{NOT_IN_CATALOGUE}</span> : null}
                </span>
                <TierPill tier={x.tier} className="ms-3 h-[22px] text-[11.5px]" />
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── the reasons */

/** The sentence a mattress's row shows: its reason for the first need it leads, else its general one. */
function leadSentence(rules: QuizRules, key: string): string {
  const m = rules.mattresses[key];
  const need = rules.questions.find((q) => q.id === 'need');
  const tag = need?.options.find((o) => o.pair?.[0] === key && o.tag && m.reasons[o.tag])?.tag;
  return (tag && m.reasons[tag]) || m.reasons._default || '';
}

function ReasonsCard({
  rules,
  inShop,
  catalogueReady,
  update,
  errorFor,
}: {
  rules: QuizRules;
  inShop: Map<string, Product>;
  catalogueReady: boolean;
  update: Update;
  errorFor: ErrorFor;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const keys = Object.keys(rules.mattresses);
  const all = open.size === keys.length;
  const hasError = (key: string) => Object.keys(rules.mattresses[key].reasons).some((tag) => errorFor(`mattresses.${key}.reasons.${tag}`));

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card className="p-4 sm:p-[22px]">
      <CardHead
        title="سطر السبب لكل مرتبة"
        aside={
          <button type="button" onClick={() => setOpen(all ? new Set() : new Set(keys))} className="text-[13.5px] font-semibold text-dark-ocean underline underline-offset-4">
            {all ? 'إخفاء الجمل' : 'كل الجمل'}
          </button>
        }
      />
      <ul className="flex flex-col">
        {keys.map((key) => {
          const m = rules.mattresses[key];
          const p = inShop.get(key);
          const expanded = open.has(key) || hasError(key);
          // _default first, then the tags in the factory's order.
          const tags = ['_default', ...Object.keys(m.reasons).filter((t) => t !== '_default')];
          return (
            <li key={key} className="border-t border-[#E4E6EE] py-3.5">
              <div className="flex items-start gap-3">
                <Thumb src={p ? photoOf(p) : null} size={40} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="flex flex-wrap items-center gap-2 text-sm">
                    {m.name}
                    {catalogueReady && !p ? <span className="text-[12px] font-normal text-[#7A5300]">{NOT_IN_CATALOGUE}</span> : null}
                  </b>
                  <span className="text-[13px] leading-relaxed text-[#5F6373]">{leadSentence(rules, key)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={expanded}
                  className="shrink-0 text-[13.5px] font-semibold text-dark-ocean underline underline-offset-4"
                >
                  {expanded ? 'إغلاق' : 'تعديل'}
                </button>
              </div>
              {expanded ? (
                <div className="mt-3 grid gap-3 rounded-xl bg-[#F5F6FA] p-3 sm:p-4">
                  {tags.map((tag) => (
                    <Field
                      key={tag}
                      label={TAG_LABEL[tag] ?? tag}
                      aside={<bdi dir="ltr">{tag}</bdi>}
                      value={m.reasons[tag] ?? ''}
                      onChange={(v) => update((d) => (d.mattresses[key].reasons[tag] = v))}
                      error={errorFor(`mattresses.${key}.reasons.${tag}`)}
                      multiline
                      rows={2}
                      maxLength={REASON_MAX + 20}
                    />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────── the wording */

function WordingCard({ rules, update, errorFor }: { rules: QuizRules; update: Update; errorFor: ErrorFor }) {
  return (
    <Card className="p-4 sm:p-[22px]">
      <CardHead title="نصوص الأسئلة والإجابات" />
      <div className="flex flex-col gap-5">
        {rules.questions.map((q, qi) => {
          const onCount = q.options.filter((o) => o.enabled !== false).length;
          return (
            <section key={q.id} className="flex flex-col gap-3 border-t border-[#E4E6EE] pt-4 first:border-t-0 first:pt-0">
              <span className="text-[12.5px] font-bold text-[#5F6373]">السؤال {qi + 1}</span>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="السؤال" value={q.title} onChange={(v) => update((d) => (d.questions[qi].title = v))} error={errorFor(`questions.${q.id}.title`)} maxLength={TITLE_MAX + 10} />
                <Field
                  label="السطر تحت السؤال"
                  aside="اختياري"
                  value={q.subtitle ?? ''}
                  onChange={(v) =>
                    update((d) => {
                      if (v) d.questions[qi].subtitle = v;
                      else delete d.questions[qi].subtitle;
                    })
                  }
                  error={errorFor(`questions.${q.id}.subtitle`)}
                  maxLength={SUBTITLE_MAX + 10}
                />
              </div>
              <ul className="grid gap-2.5 md:grid-cols-2">
                {q.options.map((o, oi) => {
                  const on = o.enabled !== false;
                  return (
                    <li key={o.id} className="flex items-start gap-3">
                      <Field
                        label={`الإجابة ${oi + 1}`}
                        value={o.label}
                        onChange={(v) => update((d) => (d.questions[qi].options[oi].label = v))}
                        error={errorFor(`questions.${q.id}.${o.id}.label`)}
                        maxLength={LABEL_MAX + 10}
                        className="min-w-0 flex-1"
                      />
                      {q.id === 'need' ? null : (
                        <span className="mt-[30px]">
                          <Switch
                            checked={on}
                            disabled={on && onCount === 1}
                            label={`تفعيل «${o.label}»`}
                            onChange={(v) =>
                              update((d) => {
                                const opt = d.questions[qi].options[oi];
                                if (v) delete opt.enabled;
                                else opt.enabled = false;
                              })
                            }
                          />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {q.id === 'need' ? <span className="text-[12.5px] text-[#5F6373]">تفعيل إجابات هذا السؤال من جدول الأزواج.</span> : null}
              {errorFor(`questions.${q.id}.options`) ? <span className="text-[12.5px] text-[#A12020]">{errorFor(`questions.${q.id}.options`)}</span> : null}
            </section>
          );
        })}
      </div>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────── the test */

function TestCard({ rules, products, inShop }: { rules: QuizRules; products: Product[] | null; inShop: Map<string, Product> }) {
  const [answers, setAnswers] = useState<QuizAnswers>(FIRST_TEST);
  const questions = useMemo(
    () =>
      ['who', 'position', 'need'].map((id) => {
        const q = rules.questions.find((x) => x.id === id)!;
        return { id, options: q.options.filter((o) => o.enabled !== false) };
      }),
    [rules]
  );
  // An answer turned off above falls back to the first one still on.
  const effective = useMemo(() => {
    const out: QuizAnswers = {};
    for (const q of questions) out[q.id] = q.options.some((o) => o.id === answers[q.id]) ? answers[q.id] : q.options[0]?.id ?? '';
    return out;
  }, [questions, answers]);

  const result = useMemo(() => (products ? recommend(effective, products, rules) : null), [effective, products, rules]);
  const pair = rules.questions.find((q) => q.id === 'need')?.options.find((o) => o.id === effective.need)?.pair;
  const firstKey = result?.best ? [...inShop.entries()].find(([, p]) => p === result.best?.product)?.[0] : undefined;
  const replaced = pair && result?.best ? pair.filter((k) => !inShop.has(k)) : [];
  const swapped = Boolean(pair && firstKey && replaced.length === 0 && firstKey === pair[1]);

  const LABELS: Record<string, string> = { who: 'لمن المرتبة؟', position: 'كيف تنام غالباً؟', need: 'ما الأهم لك؟' };

  return (
    <Card className="p-4 sm:p-[22px]">
      <CardHead title="جرّب القواعد" />
      <div className="flex flex-col gap-2.5">
        {questions.map((q) => (
          <label key={q.id} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[#5F6373]">{LABELS[q.id]}</span>
            <Select value={effective[q.id]} onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}>
              <SelectTrigger aria-label={LABELS[q.id]} className="h-[42px] rounded-[10px] border-0 bg-white px-3 text-[14.5px] text-[#16161F] shadow-[inset_0_0_0_1px_#E4E6EE]">
                <span>{q.options.find((o) => o.id === effective[q.id])?.label}</span>
              </SelectTrigger>
              <SelectContent className="bg-white font-sans text-[#16161F]" dir="rtl">
                {q.options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2.5 rounded-[14px] bg-[#EEF0FA] p-3.5" aria-live="polite">
        {!products ? (
          <>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-16" />
          </>
        ) : !result?.best ? (
          <span className="text-[13.5px] leading-relaxed text-[#5F6373]">لا توجد مراتب القواعد في الكتالوج الآن، فلا يظهر اقتراح في الموقع لهذه الإجابات.</span>
        ) : (
          <>
            <span className="text-[12px] font-bold text-dark-ocean">الخيار الأول</span>
            <ResultRow photo={photoOf(result.best.product)} name={displayName(result.best.product)} size={64}>
              {result.reason}
            </ResultRow>
            {result.alternative ? (
              <>
                <span className="mt-1 text-[12px] font-bold text-[#5F6373]">البديل</span>
                <ResultRow photo={photoOf(result.alternative.product)} name={displayName(result.alternative.product)} size={40} />
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-[#5F6373]">
        {replaced.length ? (
          <span className="text-[#7A5300]">
            {replaced.map((k) => rules.mattresses[k]?.name).join(' و')} {NOT_IN_CATALOGUE}، فحلّت محلها المرتبة الأقرب كما في الموقع.
          </span>
        ) : null}
        {swapped ? <span>تقدّم البديل لأن أول سؤالين أعطياه نقاطاً أكثر من أفضلية الخيار الأول.</span> : null}
        <span>«لشخصين» يقدّم المرتبة التي تعزل الحركة: هوتيل قبل بالانس، وسبورت قبل كمفورت.</span>
        <span>النتيجة بالتعديلات الحالية قبل الحفظ، بمحرّك الموقع نفسه وأسعار الكتالوج الحالية.</span>
      </div>
    </Card>
  );
}

function ResultRow({ photo, name, size, children }: { photo: string; name: string; size: number; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Thumb src={photo} size={size} className="rounded-[10px]" />
      <span className="flex min-w-0 flex-col gap-1">
        <b className={size > 50 ? 'text-base' : 'text-sm'}>{name}</b>
        {children ? <span className="text-[13px] leading-normal text-[#5F6373]">{children}</span> : null}
      </span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[52px]" />
        ))}
      </Card>
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-[42px]" />
        <Skeleton className="h-[42px]" />
        <Skeleton className="h-28" />
      </Card>
    </div>
  );
}
