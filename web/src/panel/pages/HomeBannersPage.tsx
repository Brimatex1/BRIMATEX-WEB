import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { toJpeg } from '@/components/BannersPanel';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BannerSlide, type RenderLink } from '@/shop/BannerSlide';
import { displayName, shopProducts, TIER_TITLE, type TierKey } from '@/shop/catalog';
import { MARKETING_SLUGS, productForSlug } from '@/shop/marketing';
import type { Product, WebBanner } from '@/types';

import { panelApi, PanelError, type BannerPlatform, type HomeBanner, type HomeDoc, type HomePayload, type HomeSectionKey, type InstagramPost, type PanelMe } from '../api';
import { PageBody, PageHeader } from '../Shell';
import { Button, Card, CardHead, ErrorCard, Field, Icon, Pill, Skeleton, Switch, buttonClass, type Tone } from '../ui';

/* ────────────────────────────────────────────────────────────── words */

const SECTION_LABEL: Record<HomeSectionKey, string> = {
  hero: 'البانر الرئيسي',
  offers: 'العروض',
  categories: 'تسوّق حسب الفئة',
  recent: 'شاهدتها مؤخراً',
  bestsellers: 'الأكثر طلباً (تلقائي من مبيعات أودو)',
  quiz: 'ساعدني أختار',
  instagram: 'من إنستغرام بريماتكس',
};

/** Where each section actually shows today - the website's home and the apps' have different ones. */
const SECTION_WHERE: Partial<Record<HomeSectionKey, string>> = {
  offers: 'لا قسم له في الرئيسية بعد',
  recent: 'الموقع فقط',
  bestsellers: 'الموقع فقط',
  quiz: 'الموقع فقط',
  instagram: 'الموقع فقط',
};

const PLATFORM_LABEL: Record<BannerPlatform, string> = { ios: 'iOS', android: 'أندرويد', web: 'الموقع' };
const PLATFORMS: BannerPlatform[] = ['ios', 'android', 'web'];

/** The brand's colours for the text panel (Dark Ocean, Porcelain, Nebula, Sun Glare, white). */
const PANEL_COLOURS: { hex: string; name: string }[] = [
  { hex: '#282868', name: 'كحلي' },
  { hex: '#9DC9CF', name: 'فيروزي فاتح' },
  { hex: '#D9E3E2', name: 'رمادي فاتح' },
  { hex: '#DEE337', name: 'ليموني' },
  { hex: '#FFFFFF', name: 'أبيض' },
];

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function dayText(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Today in Libya (UTC+2), as the server counts a banner's dates. */
function libyaToday(): string {
  return new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
}

function datesText(b: Pick<HomeBanner, 'startsAt' | 'endsAt'>): string {
  if (!b.startsAt && !b.endsAt) return 'دائم';
  if (b.startsAt && b.endsAt) return `${dayText(b.startsAt)} – ${dayText(b.endsAt)}`;
  return b.startsAt ? `من ${dayText(b.startsAt)}` : `حتى ${dayText(b.endsAt!)}`;
}

function statusOf(b: HomeBanner, today = libyaToday()): { label: string; tone: Tone } {
  if (b.status === 'draft') return { label: 'مسودة', tone: 'grey' };
  if (b.startsAt && b.startsAt > today) return { label: 'مجدول', tone: 'blue' };
  if (b.endsAt && b.endsAt < today) return { label: 'انتهى', tone: 'grey' };
  return { label: 'منشور', tone: 'green' };
}

/* ────────────────────────────────────────────────────────────── links */

export interface LinkOption {
  value: string;
  label: string;
  group: 'product' | 'category' | 'page';
}

/** The pages a banner or a button can open, from the catalogue: a mattress by its marketing slug when it has one. */
export function linkOptions(products: Product[]): LinkOption[] {
  const options: LinkOption[] = [];
  const bySlug = new Map<number, string>();
  for (const slug of Object.keys(MARKETING_SLUGS)) {
    const p = productForSlug(slug, products);
    if (p && !bySlug.has(p.id)) bySlug.set(p.id, slug);
  }
  for (const p of products) {
    const slug = bySlug.get(p.id);
    options.push({ value: slug ? `/p/${slug}` : `/product/${p.id}`, label: `صفحة منتج: ${displayName(p)}`, group: 'product' });
  }
  // Without the catalogue (or a demo one), the owner's marketing links still read right.
  for (const [slug, entry] of Object.entries(MARKETING_SLUGS)) {
    if (!options.some((o) => o.value === `/p/${slug}`)) options.push({ value: `/p/${slug}`, label: `صفحة منتج: ${entry.name}`, group: 'product' });
  }
  for (const tier of ['elite', 'premium', 'comfort'] as TierKey[]) {
    options.push({ value: `/mattresses/${tier}`, label: `فئة: ${TIER_TITLE[tier]}`, group: 'category' });
  }
  options.push({ value: '/mattresses', label: 'كل المراتب', group: 'category' });
  options.push({ value: '/offers', label: 'العروض', group: 'page' });
  options.push({ value: '/quiz', label: 'ساعدني أختار', group: 'page' });
  options.push({ value: '/account/loyalty', label: 'نقاطي (برنامج النقاط)', group: 'page' });
  return options;
}

/** «منتج: بالانس» - what a link opens, in the list's line. */
function linkText(link: string, options: LinkOption[]): string {
  const variant = link.match(/^\/p\/([a-z0-9-]+)\?variant=(\d+)/);
  if (variant) return `منتج: ${MARKETING_SLUGS[variant[1]]?.name ?? variant[1]} · مقاس محدد`;
  const hit = options.find((o) => o.value === link);
  if (hit) return hit.label.replace('صفحة منتج: ', 'منتج: ');
  return /^https:/.test(link) ? 'رابط خارجي' : `رابط: ${link}`;
}

const CUSTOM = '__custom';

export const selectClass =
  'h-[42px] w-full appearance-none rounded-[10px] bg-white bg-[length:16px] bg-[left_12px_center] bg-no-repeat ps-3 pe-9 text-[14.5px] text-[#16161F] outline-none shadow-[inset_0_0_0_1px_#E4E6EE] focus-visible:shadow-[inset_0_0_0_1.5px_#282868]';
export const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235F6373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

/** «يفتح»: a page of the shop from a list, or any other shop path / https address. */
function LinkPicker({ label, value, onChange, options, error }: { label: string; value: string; onChange: (v: string) => void; options: LinkOption[]; error?: string }) {
  const known = options.some((o) => o.value === value);
  const [custom, setCustom] = useState(!known && value !== '');
  useEffect(() => {
    if (!options.some((o) => o.value === value) && value !== '') setCustom(true);
  }, [value, options]);
  const groups: { key: LinkOption['group']; label: string }[] = [
    { key: 'product', label: 'المراتب' },
    { key: 'category', label: 'الفئات' },
    { key: 'page', label: 'صفحات' },
  ];
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[#5F6373]">{label}</span>
      <select
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        aria-invalid={Boolean(error)}
        className={cn(selectClass, error && 'shadow-[inset_0_0_0_1.5px_#A12020]')}
        style={{ backgroundImage: chevron }}
      >
        {value === '' && !custom ? <option value="">اختر صفحة</option> : null}
        {groups.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {options
              .filter((o) => o.group === g.key)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>رابط آخر…</option>
      </select>
      {custom ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          placeholder="/p/hotel?variant=5632 أو https://…"
          aria-label={`${label}: الرابط`}
          className="h-[42px] w-full rounded-[10px] bg-white px-3 text-right text-[14px] outline-none shadow-[inset_0_0_0_1px_#E4E6EE] focus-visible:shadow-[inset_0_0_0_1.5px_#282868]"
        />
      ) : null}
      {error ? <span className="text-[12.5px] text-[#A12020]">{error}</span> : null}
    </label>
  );
}

/* ────────────────────────────────────────────────────────────── pictures */

/** A picture made JPEG and no wider than `maxWidth`, with its size - before it is uploaded. */
function compress(file: File, maxWidth: number): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('تعذّرت قراءة الصورة: اختر صورة JPEG أو PNG أو WebP'));
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = () => {
      const img = new Image();
      img.onerror = fail;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('المتصفح لا يدعم معالجة الصور'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const IMAGE_SPEC = {
  photo: { label: 'الموقع 1600×900', icon: 'monitor' as const, maxWidth: 1600, ratio: 16 / 9 },
  app: { label: 'التطبيق 1080×1350', icon: 'phone' as const, maxWidth: 1080, ratio: 1080 / 1350 },
};

/** An upload tile (AdminHomepage): the picture with its size chip, or «اسحب صورة أو اخترها». */
function ImageTile({
  kind,
  url,
  note,
  error,
  token,
  onUploaded,
}: {
  kind: 'photo' | 'app';
  url: string | null;
  note?: string;
  error?: string;
  token: string;
  onUploaded: (url: string) => void;
}) {
  const spec = IMAGE_SPEC[kind];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function take(file: File | undefined) {
    if (!file || busy) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('اختر صورة JPEG أو PNG أو WebP');
      return;
    }
    setBusy(true);
    try {
      const { dataUrl, width, height } = await compress(file, spec.maxWidth);
      const r = await panelApi.uploadHomeImage(token, dataUrl, kind);
      onUploaded(r.url);
      if (Math.abs(width / height - spec.ratio) / spec.ratio > 0.08) toast.message(`نسبة الصورة ${width}×${height} تختلف عن ${spec.label.split(' ')[1]}، وستُقص أطرافها`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files?.[0]);
        }}
        aria-label={`${url ? 'تغيير' : 'اختيار'} صورة ${spec.label}`}
        aria-busy={busy}
        className={cn(
          'group relative flex h-[120px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-[1.5px] border-dashed text-[12.5px] text-[#5F6373] transition-colors',
          over ? 'border-dark-ocean bg-[#EEF0FA]' : error ? 'border-[#A12020]' : 'border-[#E4E6EE] hover:border-[#C9CCDA]'
        )}
      >
        {url ? (
          <>
            <img src={url} alt="" className="absolute inset-0 size-full object-cover opacity-90" />
            <span className="absolute bottom-2 start-2 inline-flex h-[26px] items-center gap-1.5 rounded-full bg-white/90 px-2.5 text-[12px] font-semibold text-[#16161F]">
              <Icon name={spec.icon} size={14} />
              {spec.label}
            </span>
            <span className="absolute inset-0 hidden place-items-center bg-black/35 text-[13px] font-semibold text-white group-hover:grid group-focus-visible:grid">تغيير الصورة</span>
          </>
        ) : (
          <>
            <Icon name="upload" size={20} />
            <span>{spec.label}</span>
            <span className="text-[11.5px]">اسحب صورة أو اخترها</span>
          </>
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-white/70">
            <span className="size-6 animate-spin rounded-full border-[3px] border-[#E4E6EE] border-t-dark-ocean" />
          </span>
        ) : null}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void take(e.target.files?.[0])} />
      {error ? <span className="text-[12.5px] text-[#A12020]">{error}</span> : note ? <span className="text-[12px] leading-relaxed text-[#5F6373]">{note}</span> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── reordering */

/**
 * Drag to reorder (the browser's own drag and drop - no library), and the
 * grip's arrow keys for the keyboard. The list moves while dragging; `onDone`
 * gets the new order once, when the row is dropped.
 */
function useReorder<T extends { id: string }>(items: T[], onDone: (next: T[]) => void) {
  const [live, setLive] = useState<T[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = live ?? items;

  const move = useCallback((from: number, to: number, base: T[]) => {
    const next = [...base];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }, []);

  return {
    list,
    dragging,
    rowProps: (item: T) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        setDragging(item.id);
        setLive(items);
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        if (!dragging || dragging === item.id) return;
        setLive((cur) => {
          const base = cur ?? items;
          const from = base.findIndex((x) => x.id === dragging);
          const to = base.findIndex((x) => x.id === item.id);
          return from < 0 || to < 0 ? base : move(from, to, base);
        });
      },
      onDrop: (e: DragEvent) => e.preventDefault(),
      onDragEnd: () => {
        const next = live;
        setDragging(null);
        setLive(null);
        if (next && next.map((x) => x.id).join() !== items.map((x) => x.id).join()) onDone(next);
      },
    }),
    gripKeys: (index: number) => (e: KeyboardEvent) => {
      const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : -1;
      if (to < 0 || to >= items.length) return;
      e.preventDefault();
      onDone(move(index, to, items));
    },
    moveBy: (index: number, by: number) => {
      const to = index + by;
      if (to >= 0 && to < items.length) onDone(move(index, to, items));
    },
  };
}

function Grip({ label, onKeyDown }: { label: string; onKeyDown: (e: KeyboardEvent) => void }) {
  return (
    <button
      type="button"
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${label}: اسحب أو استخدم السهمين لتغيير الترتيب`}
      className="grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-[#9A9DAB] hover:bg-[#F5F6FA] hover:text-[#5F6373] active:cursor-grabbing"
    >
      <Icon name="grip" size={18} />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────── the page */

function newBanner(): HomeBanner {
  const id = `b-${Math.random().toString(16).slice(2, 10)}`;
  return {
    id,
    key: id,
    status: 'draft',
    tag: '',
    title: '',
    text: '',
    buttons: [{ label: 'تسوّق الآن', link: '/mattresses' }],
    link: '/mattresses',
    panel: '#282868',
    photo: null,
    appImage: null,
    platforms: ['ios', 'android', 'web'],
    startsAt: null,
    endsAt: null,
  };
}

/** The form's banner as the website draws it, for the preview. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
function previewOf(b: HomeBanner): WebBanner {
  return {
    id: b.id,
    key: b.key,
    tag: b.tag,
    title: b.title || 'عنوان البانر',
    text: b.text,
    buttons: b.buttons.map((x) => ({ ...x, label: x.label || 'الزر' })),
    link: b.link,
    panel: b.panel,
    photo: b.photo || BLANK,
    photoAlt: b.photoAlt,
    photoPosition: b.photoPosition,
    tagIcon: b.tagIcon,
    card: b.card,
  };
}

const previewLink: RenderLink = (_href, { tabIndex: _t, ...props }) => <span {...props} />;

/** A wide thing drawn at its real size and scaled down to the box it is in. */
function Scaled({ width, height, children, className }: { width: number; height: number; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} className={cn('relative overflow-hidden', className)} style={{ height: height * scale }} aria-hidden>
      <div className="pointer-events-none absolute right-0 top-0 origin-top-right" style={{ width, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

type FieldErrors = Record<string, string>;

/**
 * الواجهة والبانرات (AdminHomepage): the banners (drag to reorder, up to five
 * published), the home sections (on/off and order), the banner being edited
 * with a live preview of the website's desktop and phone banner, and the
 * Instagram posts. The banners and the sections are saved in Odoo's
 * brimatex.app.home and read by the website and both apps from
 * /api/app/v1/config. Admin and marketing.
 */
export function HomeBannersPage({ me, token }: { me: PanelMe; token: string }) {
  const [data, setData] = useState<HomePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<HomeBanner | null>(null);
  const [baseline, setBaseline] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState<'publish' | 'draft' | 'order' | null>(null);
  const [show, setShow] = useState({ mobile: true, desktop: true });
  const preview = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoadError(null);
    panelApi
      .home(token)
      .then((r) => {
        setData(r);
        const first = r.home.banners[0] ?? null;
        setSelected(first?.id ?? null);
        setForm(first ? structuredClone(first) : null);
        setBaseline(first ? JSON.stringify(first) : '');
      })
      .catch((err: Error) => setLoadError(err.message));
  }, [token]);
  useEffect(load, [load]);

  useEffect(() => {
    api
      .getProducts()
      .then((r) => setProducts(shopProducts(r.products)))
      .catch(() => setProducts([]));
  }, []);

  const options = useMemo(() => linkOptions(products), [products]);
  const dirty = Boolean(form) && JSON.stringify(form) !== baseline;
  const isNew = Boolean(form && data && !data.home.banners.some((b) => b.id === form.id));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function edit(banner: HomeBanner | null) {
    if (dirty && !window.confirm('في البانر تغييرات لم تُحفظ. تجاهلها؟')) return false;
    setSelected(banner?.id ?? null);
    setForm(banner ? structuredClone(banner) : null);
    setBaseline(banner ? JSON.stringify(banner) : '');
    setErrors({});
    // Phones: the form is under the lists.
    if (window.matchMedia?.('(max-width: 1023px)').matches) requestAnimationFrame(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return true;
  }

  function set<K extends keyof HomeBanner>(key: K, value: HomeBanner[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(next)) if (k === key || k.startsWith(`${String(key)}.`)) delete next[k];
      return next;
    });
  }

  /** Saves the whole home; on a refusal, says why (at the field when it names one). */
  async function persist(doc: HomeDoc, kind: 'publish' | 'draft' | 'order', done: string): Promise<HomePayload | null> {
    setSaving(kind);
    try {
      const r = await panelApi.saveHome(token, doc);
      setData(r);
      toast.success(done);
      return r;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر الحفظ';
      if (err instanceof PanelError && err.field && err.banner && err.banner === form?.id) setErrors({ [err.field]: message });
      toast.error(message);
      return null;
    } finally {
      setSaving(null);
    }
  }

  async function saveBanner(status: 'published' | 'draft') {
    if (!form || !data) return;
    const banner = { ...form, status };
    const exists = data.home.banners.some((b) => b.id === banner.id);
    const banners = exists ? data.home.banners.map((b) => (b.id === banner.id ? banner : b)) : [...data.home.banners, banner];
    const r = await persist({ ...data.home, banners }, status === 'published' ? 'publish' : 'draft', status === 'published' ? 'حُفظ البانر ونُشر' : 'حُفظ البانر كمسودة');
    const saved = r?.home.banners.find((b) => b.id === banner.id);
    if (saved) {
      setForm(structuredClone(saved));
      setBaseline(JSON.stringify(saved));
      setSelected(saved.id);
      setErrors({});
    }
  }

  async function removeBanner() {
    if (!form || !data) return;
    if (isNew) {
      setDirtyFree(data.home.banners[0] ?? null);
      return;
    }
    if (!window.confirm(`حذف البانر «${form.title}»؟ لا يمكن التراجع.`)) return;
    const r = await persist({ ...data.home, banners: data.home.banners.filter((b) => b.id !== form.id) }, 'draft', 'حُذف البانر');
    if (r) setDirtyFree(r.home.banners[0] ?? null);
  }

  /** Opens a banner without asking about the form (it was just saved or dropped). */
  function setDirtyFree(banner: HomeBanner | null) {
    setSelected(banner?.id ?? null);
    setForm(banner ? structuredClone(banner) : null);
    setBaseline(banner ? JSON.stringify(banner) : '');
    setErrors({});
  }

  const reorderBanners = (next: HomeBanner[]) => data && void persist({ ...data.home, banners: next }, 'order', 'حُفظ الترتيب');
  const banners = useReorder(data?.home.banners ?? [], reorderBanners);

  type SectionRow = HomeDoc['sections'][number] & { id: string };
  const sectionRows: SectionRow[] = useMemo(() => (data?.home.sections ?? []).map((s) => ({ ...s, id: s.key })), [data]);
  const saveSections = (next: SectionRow[]) => data && void persist({ ...data.home, sections: next.map(({ key, on }) => ({ key, on })) }, 'order', 'حُفظ ترتيب الأقسام');
  const sections = useReorder(sectionRows, saveSections);

  const titleMax = data?.limits.titleMax ?? 40;
  const titleLength = form ? [...form.title].length : 0;
  const today = libyaToday();
  const publishedCount = data?.home.banners.filter((b) => b.status === 'published').length ?? 0;

  return (
    <>
      <PageHeader
        section="home"
        me={me}
        action={
          <a href="/" target="_blank" rel="noreferrer" className={cn(buttonClass('outline', 'sm'), 'no-underline')}>
            <Icon name="external" size={18} />
            عرض الموقع
          </a>
        }
      />
      <PageBody>
        {loadError ? <ErrorCard message={loadError} onRetry={load} /> : null}
        {!data ? (
          loadError ? null : <PageSkeleton />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.05fr]">
            {/* ── The list, the sections, Instagram ── */}
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardHead
                  title="البانرات"
                  aside={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => edit(newBanner())}
                      disabled={data.home.banners.length >= data.limits.maxBanners}
                    >
                      <Icon name="plus" size={18} />
                      بانر جديد
                    </Button>
                  }
                />
                {banners.list.length === 0 ? <p className="py-6 text-center text-sm text-[#5F6373]">لا بانرات بعد. أضف أول بانر.</p> : null}
                <ul className="flex flex-col gap-3" aria-label="البانرات بالترتيب">
                  {banners.list.map((b, i) => {
                    const status = statusOf(b, today);
                    const active = b.id === selected;
                    return (
                      <li
                        key={b.id}
                        {...banners.rowProps(b)}
                        className={cn(
                          'flex items-center gap-2 rounded-[14px] bg-white p-2.5 transition-shadow sm:gap-3 sm:p-3',
                          active ? 'shadow-[inset_0_0_0_2px_#282868]' : 'shadow-[inset_0_0_0_1px_#E4E6EE] hover:shadow-[inset_0_0_0_1px_#C9CCDA]',
                          banners.dragging === b.id && 'opacity-60'
                        )}
                      >
                        <Grip label={b.title} onKeyDown={banners.gripKeys(i)} />
                        <button type="button" onClick={() => edit(b)} className="flex min-w-0 flex-1 items-center gap-2.5 text-start sm:gap-3" aria-current={active || undefined}>
                          <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-[#EDEEF3] sm:h-16 sm:w-24">
                            {b.photo || b.appImage ? <img src={b.photo || b.appImage || ''} alt="" className="absolute inset-0 size-full object-cover" /> : null}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <b className="line-clamp-2 text-[14px] leading-snug sm:truncate sm:text-[15px]">{b.title}</b>
                            <span className="truncate text-[12.5px] text-[#5F6373]">
                              {linkText(b.link, options)} · {datesText(b)}
                            </span>
                            <span className="flex flex-wrap gap-1">
                              {PLATFORMS.map((p) => (
                                <Pill key={p} tone={b.platforms.includes(p) ? 'ocean' : 'grey'} className={cn('h-[22px] px-1.5 text-[11.5px] sm:h-6 sm:px-2 sm:text-[12px]', !b.platforms.includes(p) && 'text-[#9A9DAB] line-through')}>
                                  {PLATFORM_LABEL[p]}
                                </Pill>
                              ))}
                            </span>
                          </span>
                        </button>
                        <span className="flex shrink-0 flex-col items-end gap-2">
                          <Pill tone={status.tone}>{status.label}</Pill>
                          {/* Phones cannot drag: up and down instead. */}
                          <span className="flex gap-1 lg:hidden">
                            <button type="button" onClick={() => banners.moveBy(i, -1)} disabled={i === 0} aria-label="للأعلى" className="grid size-7 place-items-center rounded-md text-[#5F6373] hover:bg-[#F5F6FA] disabled:opacity-30">
                              <Icon name="arrowUp" size={16} />
                            </button>
                            <button type="button" onClick={() => banners.moveBy(i, 1)} disabled={i === banners.list.length - 1} aria-label="للأسفل" className="grid size-7 place-items-center rounded-md text-[#5F6373] hover:bg-[#F5F6FA] disabled:opacity-30">
                              <Icon name="arrowDown" size={16} />
                            </button>
                          </span>
                        </span>
                      </li>
                    );
                  })}
                  {isNew && form ? (
                    <li className="flex items-center gap-3 rounded-[14px] p-3 shadow-[inset_0_0_0_2px_#282868]">
                      <span className="grid h-16 w-24 place-items-center rounded-lg bg-[#EDEEF3] text-[#9A9DAB]">
                        <Icon name="image" />
                      </span>
                      <b className="flex-1 text-[15px]">{form.title || 'بانر جديد'}</b>
                      <Pill tone="amber">جديد</Pill>
                    </li>
                  ) : null}
                </ul>
                <p className="mt-3 text-[12.5px] text-[#5F6373]">
                  اسحب لتغيير الترتيب. يظهر حتى {data.limits.maxPublished} بانرات، والمنشور فقط ({publishedCount} الآن).
                </p>
              </Card>

              <Card>
                <CardHead title="ترتيب أقسام الرئيسية" aside={<Pill tone="ocean">التطبيق والموقع</Pill>} />
                <ul className="flex flex-col" aria-label="أقسام الرئيسية بالترتيب">
                  {sections.list.map((s, i) => (
                    <li
                      key={s.key}
                      {...sections.rowProps(s)}
                      className={cn('flex min-h-[45px] items-center gap-2 border-t border-[#E4E6EE] py-1.5', sections.dragging === s.key && 'opacity-60')}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[14.5px]">{SECTION_LABEL[s.key]}</span>
                        {SECTION_WHERE[s.key] ? <span className="text-[12px] text-[#9A9DAB]">{SECTION_WHERE[s.key]}</span> : null}
                      </span>
                      <span className="flex gap-0.5 lg:hidden">
                        <button type="button" onClick={() => sections.moveBy(i, -1)} disabled={i === 0} aria-label={`${SECTION_LABEL[s.key]} للأعلى`} className="grid size-7 place-items-center rounded-md text-[#5F6373] disabled:opacity-30">
                          <Icon name="arrowUp" size={16} />
                        </button>
                        <button type="button" onClick={() => sections.moveBy(i, 1)} disabled={i === sections.list.length - 1} aria-label={`${SECTION_LABEL[s.key]} للأسفل`} className="grid size-7 place-items-center rounded-md text-[#5F6373] disabled:opacity-30">
                          <Icon name="arrowDown" size={16} />
                        </button>
                      </span>
                      <Grip label={SECTION_LABEL[s.key]} onKeyDown={sections.gripKeys(i)} />
                      <Switch
                        checked={s.on}
                        label={SECTION_LABEL[s.key]}
                        disabled={saving !== null}
                        onChange={(on) => saveSections(sectionRows.map((x) => (x.key === s.key ? { ...x, on } : x)))}
                      />
                    </li>
                  ))}
                </ul>
              </Card>

              <InstagramCard token={token} />
            </div>

            {/* ── The banner being edited, and its preview ── */}
            <div ref={editor} className="flex min-w-0 scroll-mt-16 flex-col gap-4">
              {form ? (
                <Card>
                  <CardHead
                    title={isNew ? 'بانر جديد' : 'تعديل البانر'}
                    aside={isNew ? <Pill tone="amber">جديد</Pill> : <Pill tone={statusOf(form, today).tone}>{statusOf(form, today).label}</Pill>}
                  />
                  <div className="mb-3.5 grid grid-cols-2 gap-3">
                    <ImageTile kind="photo" url={form.photo} token={token} error={errors.photo} onUploaded={(url) => set('photo', url)} />
                    <ImageTile
                      kind="app"
                      url={form.appImage}
                      token={token}
                      error={errors.appImage}
                      note={form.appImages ? 'ومعها نسختا iOS وأندرويد بمقاس كل تطبيق' : undefined}
                      onUploaded={(url) => setForm((f) => (f ? { ...f, appImage: url, appImages: undefined } : f))}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <Field
                      label="العنوان"
                      value={form.title}
                      onChange={(v) => set('title', v)}
                      error={errors.title}
                      hint={
                        <span className={cn(titleLength > titleMax && 'text-[#A12020]')}>
                          {titleLength > titleMax ? `${titleLength} حرفاً من ${titleMax}` : `${titleMax} حرفاً كحد أقصى`}
                        </span>
                      }
                    />
                    <Field label="سطر وصفي" value={form.text} onChange={(v) => set('text', v)} error={errors.text} maxLength={200} />
                    <Field label="السطر فوق العنوان" value={form.tag} onChange={(v) => set('tag', v)} error={errors.tag} placeholder="مثل: بريميوم" maxLength={40} />

                    {form.buttons.map((b, i) => (
                      <div key={i} className="grid grid-cols-2 items-start gap-3">
                        <Field
                          label={form.buttons.length > 1 ? (i === 0 ? 'نص الزر الأول' : 'نص الزر الثاني') : 'نص الزر'}
                          value={b.label}
                          maxLength={24}
                          error={errors[`buttons.${i}.label`]}
                          onChange={(v) => set('buttons', form.buttons.map((x, j) => (j === i ? { ...x, label: v } : x)))}
                        />
                        <LinkPicker
                          label="يفتح"
                          value={b.link}
                          options={options}
                          error={errors[`buttons.${i}.link`]}
                          onChange={(v) => {
                            const buttons = form.buttons.map((x, j) => (j === i ? { ...x, link: v } : x));
                            // The whole banner follows the first button until it is set apart.
                            setForm((f) => (f ? { ...f, buttons, link: i === 0 && f.link === f.buttons[0].link ? v : f.link } : f));
                          }}
                        />
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {form.buttons.length < 2 ? (
                        <Button variant="outline" size="sm" onClick={() => set('buttons', [...form.buttons, { label: 'كل المراتب', link: '/mattresses' }])}>
                          <Icon name="plus" size={16} />
                          زر ثانٍ
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => set('buttons', form.buttons.slice(0, 1))}>
                          <Icon name="close" size={16} />
                          إزالة الزر الثاني
                        </Button>
                      )}
                    </div>
                    <LinkPicker label="البانر كاملاً يفتح (الصورة، والتطبيقان)" value={form.link} options={options} error={errors.link} onChange={(v) => set('link', v)} />

                    <div className="grid grid-cols-2 gap-3">
                      <DateField label="يبدأ" value={form.startsAt} onChange={(v) => set('startsAt', v)} error={errors.startsAt} placeholder="من اليوم" />
                      <DateField label="ينتهي" value={form.endsAt} onChange={(v) => set('endsAt', v)} error={errors.endsAt} placeholder="بدون نهاية" />
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[13px] font-semibold text-[#5F6373]">لون الخلفية</span>
                      <span className="flex flex-wrap gap-2" role="radiogroup" aria-label="لون الخلفية">
                        {PANEL_COLOURS.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            role="radio"
                            aria-checked={form.panel.toUpperCase() === c.hex}
                            aria-label={c.name}
                            title={c.name}
                            onClick={() => set('panel', c.hex)}
                            className={cn(
                              'size-8 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)] transition-shadow',
                              form.panel.toUpperCase() === c.hex && 'ring-2 ring-dark-ocean ring-offset-2'
                            )}
                            style={{ background: c.hex }}
                          />
                        ))}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[13px] font-semibold text-[#5F6373]">يظهر في</span>
                      <span className="flex flex-wrap gap-1.5">
                        {PLATFORMS.map((p) => {
                          const on = form.platforms.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              aria-pressed={on}
                              onClick={() => set('platforms', on ? form.platforms.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || form.platforms.includes(x)))}
                              className={cn(
                                'inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
                                on ? 'bg-[#EEF0FA] text-dark-ocean' : 'bg-white text-[#9A9DAB] shadow-[inset_0_0_0_1px_#E4E6EE] line-through'
                              )}
                            >
                              {on ? <Icon name="check" size={14} /> : null}
                              {PLATFORM_LABEL[p]}
                            </button>
                          );
                        })}
                      </span>
                      {errors.platforms ? <span className="text-[12.5px] text-[#A12020]">{errors.platforms}</span> : null}
                    </div>

                    <Field label="وصف الصورة (لقارئ الشاشة ومحركات البحث)" value={form.photoAlt ?? ''} onChange={(v) => set('photoAlt', v)} placeholder="مثل: مرتبة بالانس" maxLength={80} error={errors.photoAlt} />
                  </div>

                  <div className="mt-[18px] flex flex-wrap gap-2.5">
                    <Button onClick={() => void saveBanner('published')} disabled={saving !== null} aria-busy={saving === 'publish'}>
                      <Icon name="check" size={18} />
                      حفظ ونشر
                    </Button>
                    <Button variant="outline" onClick={() => preview.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                      معاينة
                    </Button>
                    <Button variant="outline" onClick={() => void saveBanner('draft')} disabled={saving !== null} aria-busy={saving === 'draft'}>
                      حفظ كمسودة
                    </Button>
                    <button
                      type="button"
                      onClick={() => void removeBanner()}
                      disabled={saving !== null}
                      className="ms-auto inline-flex h-[42px] items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-semibold text-[#A12020] hover:bg-[#FDE8E8] disabled:opacity-50"
                    >
                      <Icon name="trash" size={18} />
                      {isNew ? 'إلغاء' : 'حذف'}
                    </button>
                  </div>
                  {dirty ? <p className="mt-2.5 text-[12.5px] text-[#7A5300]">تغييرات لم تُحفظ بعد.</p> : null}
                </Card>
              ) : (
                <Card>
                  <p className="py-8 text-center text-sm text-[#5F6373]">اختر بانراً لتعديله، أو أضف بانراً جديداً.</p>
                </Card>
              )}

              {form ? (
                <Card>
                  <CardHead
                    title="المعاينة"
                    aside={
                      <span className="flex gap-1.5">
                        {(['mobile', 'desktop'] as const).map((k) => (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={show[k]}
                            onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
                            className={cn(
                              'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold',
                              show[k] ? 'bg-[#EEF0FA] text-dark-ocean' : 'bg-[#F4F4F6] text-[#5F6373]'
                            )}
                          >
                            <Icon name={k === 'mobile' ? 'phone' : 'monitor'} size={14} />
                            {k === 'mobile' ? 'الجوال' : 'الموقع'}
                          </button>
                        ))}
                      </span>
                    }
                  />
                  <div ref={preview} className="flex flex-col items-stretch gap-[18px] sm:flex-row sm:items-end">
                    {show.mobile ? (
                      <div className="mx-auto w-[162px] shrink-0 overflow-hidden rounded-[26px] border-[6px] border-[#16161F] bg-white sm:mx-0">
                        <Scaled width={358} height={500}>
                          <div className="h-[500px]">
                            <BannerSlide banner={previewOf(form)} mode="mobile" renderLink={previewLink} eager />
                          </div>
                        </Scaled>
                      </div>
                    ) : null}
                    {show.desktop ? (
                      <Scaled width={1200} height={520} className="w-full min-w-0 rounded-[10px] shadow-[0_0_0_1px_#E4E6EE] sm:flex-1">
                        <BannerSlide banner={previewOf(form)} mode="desktop" renderLink={previewLink} eager />
                      </Scaled>
                    ) : null}
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-[#5F6373]">
                    الموقع يعرض النص والأزرار نصاً حقيقياً فوق صورة الموقع. التطبيقان يعرضان صورة التطبيق كما هي، والبانر كاملاً يفتح رابطه.
                  </p>
                </Card>
              ) : null}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function DateField({ label, value, onChange, error, placeholder }: { label: string; value: string | null; onChange: (v: string | null) => void; error?: string; placeholder: string }) {
  // Empty, it reads «بدون نهاية»; focused, it is the browser's date picker.
  const [picking, setPicking] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[#5F6373]">{label}</span>
      <span className="relative">
        <input
          type={value || picking ? 'date' : 'text'}
          value={value ?? ''}
          placeholder={placeholder}
          onFocus={() => setPicking(true)}
          onBlur={() => setPicking(false)}
          onChange={(e) => onChange(e.target.value || null)}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-[42px] w-full rounded-[10px] bg-white px-3 text-right text-[14.5px] outline-none placeholder:text-[#5F6373] focus-visible:shadow-[inset_0_0_0_1.5px_#282868]',
            error ? 'shadow-[inset_0_0_0_1.5px_#A12020]' : 'shadow-[inset_0_0_0_1px_#E4E6EE]',
            value && 'pe-9'
          )}
        />
        {value ? (
          <button type="button" onClick={() => onChange(null)} aria-label={`مسح ${label}`} className="absolute inset-y-0 end-1 grid w-8 place-items-center text-[#9A9DAB] hover:text-[#16161F]">
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </span>
      {error ? <span className="text-[12.5px] text-[#A12020]">{error}</span> : null}
    </label>
  );
}

/**
 * «من إنستغرام بريماتكس» - the classic dashboard's editor (InstagramPanel),
 * moved here: up to five square pictures, each opening its post; the home's
 * row hides with none, or with its switch off in the sections above.
 */
function InstagramCard({ token }: { token: string }) {
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [max, setMax] = useState(5);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    panelApi
      .instagram(token)
      .then((r) => {
        setPosts(r.posts);
        setMax(r.max);
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  const add = (file: File | undefined) =>
    file &&
    run(async () => {
      const { post } = await panelApi.addInstagram(token, await toJpeg(file), link.trim());
      setPosts((p) => [...p, post]);
      setLink('');
      if (input.current) input.current.value = '';
    }, 'أُضيفت الصورة');

  const move = (index: number, by: number) =>
    run(async () => {
      const ids = posts.map((p) => p.id);
      [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
      setPosts((await panelApi.reorderInstagram(token, ids)).posts);
    });

  const remove = (p: InstagramPost) => run(async () => setPosts((await panelApi.deleteInstagram(token, p.id)).posts), 'حُذفت الصورة');

  return (
    <Card>
      <CardHead title="من إنستغرام بريماتكس" aside={<Pill tone="grey">الموقع</Pill>} />
      <p className="-mt-2 mb-3 text-[12.5px] leading-relaxed text-[#5F6373]">
        حتى {max} صور مربّعة، وكل صورة تفتح منشورها على إنستغرام. انسخ رابط المنشور (مشاركة ← نسخ الرابط) ثم اختر صورته.
      </p>
      {loading ? <Skeleton className="h-16" /> : null}
      {!loading && posts.length === 0 ? <p className="py-2 text-sm text-[#5F6373]">لا صور بعد، فالقسم مخفي في الموقع.</p> : null}
      <ul className="flex flex-col gap-2">
        {posts.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl p-2 shadow-[inset_0_0_0_1px_#E4E6EE]">
            <img src={p.imageUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
            <a href={p.link} target="_blank" rel="noopener noreferrer" dir="ltr" className="min-w-0 flex-1 truncate text-right text-[13px] text-dark-ocean underline">
              {p.link}
            </a>
            <span className="flex gap-0.5">
              <button type="button" disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label="للأمام" className="grid size-8 place-items-center rounded-lg text-[#5F6373] hover:bg-[#F5F6FA] disabled:opacity-30">
                <Icon name="arrowUp" size={16} />
              </button>
              <button type="button" disabled={busy || i === posts.length - 1} onClick={() => void move(i, 1)} aria-label="للخلف" className="grid size-8 place-items-center rounded-lg text-[#5F6373] hover:bg-[#F5F6FA] disabled:opacity-30">
                <Icon name="arrowDown" size={16} />
              </button>
              <button type="button" disabled={busy} onClick={() => void remove(p)} aria-label="حذف" className="grid size-8 place-items-center rounded-lg text-[#A12020] hover:bg-[#FDE8E8] disabled:opacity-30">
                <Icon name="trash" size={16} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {!loading && posts.length < max ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-[#E4E6EE] p-3 sm:flex-row">
          <input
            dir="ltr"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.instagram.com/p/…"
            aria-label="رابط المنشور"
            className="h-[42px] min-w-0 flex-1 rounded-[10px] bg-white px-3 text-right text-[14px] outline-none shadow-[inset_0_0_0_1px_#E4E6EE] focus-visible:shadow-[inset_0_0_0_1.5px_#282868]"
          />
          <Button size="sm" className="h-[42px]" disabled={busy || !link.trim()} onClick={() => input.current?.click()}>
            <Icon name="upload" size={16} />
            {busy ? 'جارٍ الرفع…' : 'اختر الصورة'}
          </Button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void add(e.target.files?.[0])} />
        </div>
      ) : null}
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col gap-4">
        <Card>
          <Skeleton className="mb-4 h-6 w-28" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="mb-3 h-[88px]" />
          ))}
        </Card>
        <Card>
          <Skeleton className="mb-4 h-6 w-40" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="mb-2 h-9" />
          ))}
        </Card>
      </div>
      <Card>
        <Skeleton className="mb-4 h-6 w-28" />
        <Skeleton className="mb-3 h-[120px]" />
        <Skeleton className="mb-3 h-[42px]" />
        <Skeleton className="h-[42px]" />
      </Card>
    </div>
  );
}
