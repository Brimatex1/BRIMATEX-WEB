import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { FEATURE_LABELS } from '@/shop/Features';

import { panelApi, type OdooProductChanges, type PanelMe, type PanelProduct, type ProductsPayload } from '../api';
import { PageBody, PageHeader } from '../Shell';
import { Button, Card, ErrorCard, Field, Icon, Pill, Skeleton, Switch, Thumb, TierPill, counted, money } from '../ui';

/** One mattress's edits, before «حفظ». */
interface Draft {
  description: string;
  features: string[];
  enabled: boolean;
  /** A new shop photo (data URL), 'remove' to go back to the catalogue's, or null for no change. */
  shopImage: string | null;
  /** A new image_1920 for Odoo (data URL), or null for no change. */
  odooImage: string | null;
  /** id null: a tag Odoo does not have yet - made on save. */
  tags: { id: number | null; name: string }[];
  descriptionSale: string;
}

function draftOf(row: PanelProduct): Draft {
  return {
    description: row.shop?.description ?? '',
    features: row.shop?.features ?? [],
    enabled: row.shop?.enabled ?? false,
    shopImage: null,
    odooImage: null,
    tags: row.odoo?.tags.map((t) => ({ id: t.id, name: t.name })) ?? [],
    descriptionSale: row.odoo?.descriptionSale ?? '',
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const tagsKey = (tags: Draft['tags']) => tags.map((t) => t.id ?? `+${t.name}`).join();

/** The shop's changes against the row: an empty description or the catalogue's own goes back to following the catalogue. */
function shopChanges(row: PanelProduct, d: Draft) {
  const shop = row.shop;
  const out: { description?: string | null; features?: string[] | null; enabled?: boolean } = {};
  if (!shop) return out;
  if (d.description.trim() !== shop.description.trim()) {
    const text = d.description.trim();
    out.description = !text || text === (shop.catalogueDescription ?? '').trim() ? null : text;
  }
  if (!same(d.features, shop.features)) out.features = same(d.features, shop.catalogueFeatures) ? null : d.features;
  if (d.enabled !== shop.enabled) out.enabled = d.enabled;
  return out;
}

function odooChanges(row: PanelProduct, d: Draft): OdooProductChanges {
  const out: OdooProductChanges = {};
  if (!row.odoo) return out;
  if (d.odooImage) out.image = d.odooImage;
  if (tagsKey(d.tags) !== tagsKey(row.odoo.tags.map((t) => ({ id: t.id, name: t.name })))) {
    out.tagIds = d.tags.filter((t) => t.id !== null).map((t) => t.id as number);
    out.newTags = d.tags.filter((t) => t.id === null).map((t) => t.name);
  }
  if (d.descriptionSale.trim() !== row.odoo.descriptionSale.trim()) out.descriptionSale = d.descriptionSale.trim();
  return out;
}

/** A picture made JPEG and no wider than `maxWidth`, before it is sent. */
function compress(file: File, maxWidth: number): Promise<string> {
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
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const years = (n: number | null | undefined) => (n ? counted(n, ['سنة واحدة', 'سنتان', 'سنوات', 'سنة']) : 'بدون');
const tagsCount = (n: number) => (n ? counted(n, ['وسم واحد', 'وسمان', 'وسوم', 'وسماً']) : 'بلا وسوم');

/**
 * المراتب (AdminProducts): the eight catalogue mattresses. Each has two sides,
 * kept apart on purpose: «ما يظهر في المتجر» - the shop's own photo, feature
 * icons, description and whether it is shown (what customers see today; saved
 * on this server) - and «في أودو» - the product's image_1920, its native tags
 * and description_sale, written to Odoo only on «حفظ». Price, sizes, stock
 * and warranty are read-only, with the record's link in Odoo. Admin and marketing.
 */
export function ProductsPage({ me, token }: { me: PanelMe; token: string }) {
  const [data, setData] = useState<ProductsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const editor = useRef<HTMLDivElement>(null);

  const rowId = (r: PanelProduct) => r.key ?? `p${r.shop?.id ?? r.templateId}`;

  const load = useCallback(
    (keep?: string | null) => {
      setLoadError(null);
      return panelApi
        .products(token)
        .then((r) => {
          setData(r);
          const row = r.products.find((p) => rowId(p) === keep) ?? r.products.find((p) => p.shop) ?? r.products[0] ?? null;
          setSelected(row ? rowId(row) : null);
          setDraft(row ? draftOf(row) : null);
        })
        .catch((err: Error) => setLoadError(err.message));
    },
    [token]
  );
  useEffect(() => {
    void load();
  }, [load]);

  const row = data?.products.find((p) => rowId(p) === selected) ?? null;
  const dirty = Boolean(row && draft) && (Object.keys(shopChanges(row!, draft!)).length > 0 || draft!.shopImage !== null || Object.keys(odooChanges(row!, draft!)).length > 0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function open(next: PanelProduct) {
    if (rowId(next) !== selected && dirty && !window.confirm('في المرتبة تغييرات لم تُحفظ. تجاهلها؟')) return;
    setSelected(rowId(next));
    setDraft(draftOf(next));
    if (window.matchMedia?.('(max-width: 1279px)').matches) requestAnimationFrame(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  /** «ظاهرة» in the table: saved at once - the shop's record only, never Odoo. */
  async function toggleShown(r: PanelProduct, enabled: boolean) {
    if (!r.shop) return;
    setToggling(r.shop.id);
    try {
      await panelApi.saveShop(token, r.shop.id, { enabled });
      setData((d) => (d ? { ...d, products: d.products.map((p) => (p === r && p.shop ? { ...p, shop: { ...p.shop, enabled } } : p)) } : d));
      if (rowId(r) === selected) setDraft((d) => (d ? { ...d, enabled } : d));
      toast.success(enabled ? `عادت ${r.name} إلى المتجر` : `أُخفيت ${r.name} من المتجر`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setToggling(null);
    }
  }

  async function save() {
    if (!row || !draft || saving) return;
    setSaving(true);
    const done: string[] = [];
    let failed = false;
    try {
      // The shop first (this server), then Odoo - each says how it went.
      if (row.shop) {
        try {
          if (draft.shopImage === 'remove') await panelApi.removeShopImage(token, row.shop.id);
          else if (draft.shopImage) await panelApi.uploadShopImage(token, row.shop.id, draft.shopImage);
          const changes = shopChanges(row, draft);
          if (Object.keys(changes).length) await panelApi.saveShop(token, row.shop.id, changes);
          if (draft.shopImage || Object.keys(changes).length) done.push('المتجر');
        } catch (err) {
          failed = true;
          toast.error(`المتجر: ${err instanceof Error ? err.message : 'تعذّر الحفظ'}`);
        }
      }
      const odoo = odooChanges(row, draft);
      if (row.odoo && Object.keys(odoo).length) {
        try {
          await panelApi.saveOdooProduct(token, row.odoo.templateId, odoo);
          done.push('أودو');
        } catch (err) {
          failed = true;
          toast.error(`أودو: ${err instanceof Error ? err.message : 'تعذّر الحفظ'}`);
        }
      }
      if (done.length) toast.success(`حُفظت ${row.name} في ${done.join(' و')}`);
      if (!failed) await load(rowId(row));
      else {
        // What did save is reloaded; what did not stays in the form to try again.
        const keep = draft;
        await load(rowId(row));
        setDraft(keep);
      }
    } finally {
      setSaving(false);
    }
  }

  const missingPhotos = data?.odoo.connected ? data.products.filter((p) => p.key && p.odoo && !p.odoo.hasImage).length : null;

  return (
    <>
      <PageHeader section="products" me={me} />
      <PageBody>
        {loadError ? <ErrorCard message={loadError} onRetry={() => void load(selected)} /> : null}
        {!data ? (
          loadError ? null : <PageSkeleton />
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Card className="min-w-0 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
                <h2 className="text-[17px] font-bold">المراتب الثماني</h2>
                <Pill tone="ocean">السعر من أودو</Pill>
              </div>
              <ProductTable rows={data.products} selected={selected} rowId={rowId} odooOn={data.odoo.connected && !data.odoo.error} onOpen={open} onToggle={toggleShown} toggling={toggling} />
              <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-[#5F6373]">
                {data.odoo.connected
                  ? `عمود «الصورة» حالة صورة المنتج في أودو (image_1920)${missingPhotos ? `: ${counted(missingPhotos, ['مرتبة واحدة تحتاج', 'مرتبتان تحتاجان', 'مراتب تحتاج', 'مرتبة تحتاج'])} صورتها` : ''}. صور الموقع والتطبيق اليوم من الكتالوج أو المرفوعة هنا.`
                  : 'أودو غير متصل: الأسعار والفئات من كتالوج المتجر، وأعمدة أودو فارغة.'}
              </p>
            </Card>

            <div ref={editor} className="min-w-0 scroll-mt-4">
              {row && draft ? (
                <Editor
                  key={rowId(row)}
                  row={row}
                  draft={draft}
                  setDraft={setDraft}
                  data={data}
                  dirty={dirty}
                  saving={saving}
                  onSave={() => void save()}
                  onCancel={() => setDraft(draftOf(row))}
                />
              ) : null}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

/* ────────────────────────────────────────────────────────────── the table */

function ProductTable({
  rows,
  selected,
  rowId,
  odooOn,
  onOpen,
  onToggle,
  toggling,
}: {
  rows: PanelProduct[];
  selected: string | null;
  rowId: (r: PanelProduct) => string;
  odooOn: boolean;
  onOpen: (r: PanelProduct) => void;
  onToggle: (r: PanelProduct, on: boolean) => void;
  toggling: number | null;
}) {
  return (
    <>
      {/* Wide screens: the prototype's table. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-right text-[12.5px] font-semibold text-[#5F6373]">
              <th className="px-2.5 pb-3 font-semibold">المرتبة</th>
              <th className="px-2.5 pb-3 font-semibold">الفئة</th>
              <th className="px-2.5 pb-3 font-semibold">السعر</th>
              <th className="px-2.5 pb-3 font-semibold">الضمان</th>
              <th className="px-2.5 pb-3 font-semibold">الاقتراح</th>
              <th className="px-2.5 pb-3 font-semibold">الصورة</th>
              <th className="px-2.5 pb-3 font-semibold">ظاهرة</th>
              <th className="px-2.5 pb-3">
                <span className="sr-only">تعديل</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowId(r)} className={cn('border-t border-[#E4E6EE]', rowId(r) === selected && 'bg-[#F7F8FC]')}>
                <td className="px-2.5 py-3">
                  <span className="flex items-center gap-3">
                    <Thumb src={r.shop?.image ?? r.odoo?.image} size={48} className="rounded-[10px]" />
                    <b className="text-[15px]">{r.name}</b>
                  </span>
                </td>
                <td className="px-2.5 py-3">
                  <TierPill tier={r.shop?.tier?.key} label={r.shop?.tier?.name ?? r.odoo?.category} />
                </td>
                <td className="whitespace-nowrap px-2.5 py-3">
                  <Price row={r} />
                </td>
                <td className="whitespace-nowrap px-2.5 py-3">{r.shop ? years(r.shop.warrantyYears) : '—'}</td>
                <td className="whitespace-nowrap px-2.5 py-3">{odooOn && r.odoo ? tagsCount(r.odoo.tags.length) : '—'}</td>
                <td className="whitespace-nowrap px-2.5 py-3">
                  <PhotoState row={r} odooOn={odooOn} />
                </td>
                <td className="px-2.5 py-3">
                  {r.shop ? (
                    <Switch checked={r.shop.enabled} onChange={(v) => onToggle(r, v)} disabled={toggling === r.shop.id} label={`${r.name} ظاهرة في المتجر`} />
                  ) : (
                    <span className="whitespace-nowrap text-[12.5px] text-[#5F6373]">ليست في المتجر</span>
                  )}
                </td>
                <td className="px-2.5 py-3">
                  <button type="button" onClick={() => onOpen(r)} className="text-[13.5px] font-semibold text-dark-ocean underline underline-offset-4">
                    تعديل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones and tablets: one block per mattress. */}
      <ul className="flex flex-col lg:hidden">
        {rows.map((r) => (
          <li key={rowId(r)} className={cn('flex flex-col gap-2.5 border-t border-[#E4E6EE] px-1 py-3', rowId(r) === selected && 'bg-[#F7F8FC]')}>
            <div className="flex items-center gap-3">
              <Thumb src={r.shop?.image ?? r.odoo?.image} size={52} className="rounded-[10px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <b className="text-[15px]">{r.name}</b>
                  <TierPill tier={r.shop?.tier?.key} label={r.shop?.tier?.name ?? r.odoo?.category} className="h-[22px] text-[11.5px]" />
                </span>
                <Price row={r} inline />
              </span>
              {r.shop ? <Switch checked={r.shop.enabled} onChange={(v) => onToggle(r, v)} disabled={toggling === r.shop.id} label={`${r.name} ظاهرة في المتجر`} /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[#5F6373]">
              <span>الضمان: {r.shop ? years(r.shop.warrantyYears) : '—'}</span>
              <span>{odooOn && r.odoo ? tagsCount(r.odoo.tags.length) : 'الوسوم: —'}</span>
              <span className="inline-flex items-center gap-1">
                الصورة: <PhotoState row={r} odooOn={odooOn} />
              </span>
              {!r.shop ? <span>ليست في المتجر</span> : null}
              <button type="button" onClick={() => onOpen(r)} className="ms-auto text-[13.5px] font-semibold text-dark-ocean underline underline-offset-4">
                تعديل
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Price({ row, inline }: { row: PanelProduct; inline?: boolean }) {
  const amount = row.shop?.priceFrom ?? row.odoo?.listPrice ?? null;
  if (amount === null) return <span className="text-[#5F6373]">—</span>;
  return inline ? (
    <span className="text-[12.5px] text-[#5F6373]">
      يبدأ من <b className="text-[13.5px] text-[#16161F]">{money(amount)}</b>
    </span>
  ) : (
    <span className="flex flex-col leading-tight">
      <b className="text-[14.5px]">{money(amount)}</b>
      <span className="text-[11.5px] text-[#5F6373]">يبدأ من</span>
    </span>
  );
}

/** The photo column: image_1920's state in Odoo. */
function PhotoState({ row, odooOn }: { row: PanelProduct; odooOn: boolean }) {
  if (!odooOn || !row.odoo) return <span className="text-[#5F6373]" title="أودو غير متصل">—</span>;
  return row.odoo.hasImage ? (
    <span className="inline-flex items-center gap-1 font-semibold text-[#1E6B2E]" title="صورة المنتج موجودة في أودو">
      <Icon name="check" size={15} />
      موجودة
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-[#A12020]" title="image_1920 فارغة في أودو">
      <Icon name="warning" size={15} />
      ناقصة
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── the editor */

function Editor({
  row,
  draft,
  setDraft,
  data,
  dirty,
  saving,
  onSave,
  onCancel,
}: {
  row: PanelProduct;
  draft: Draft;
  setDraft: (fn: (d: Draft | null) => Draft | null) => void;
  data: ProductsPayload;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const link = row.odoo?.link ?? row.odooLink;

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-[22px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">{row.name}</h2>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-dark-ocean underline underline-offset-4">
            افتح في أودو
            <Icon name="external" size={15} />
          </a>
        ) : null}
      </div>

      <ShopSection row={row} draft={draft} set={set} featureIcons={data.featureIcons} odooOn={data.odoo.connected && !data.odoo.error} />
      <OdooSection row={row} draft={draft} set={set} data={data} />

      <div className="flex items-start gap-2.5 rounded-xl bg-[#FFF4D6] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#7A5300]">
        <Icon name="warning" size={18} className="mt-0.5" />
        <span>السعر والمقاسات والمخزون والضمان تُعدَّل في أودو فقط. هنا محتوى العرض في التطبيق والموقع.</span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button onClick={onSave} disabled={!dirty || saving} aria-busy={saving}>
          <Icon name="check" size={18} />
          {saving ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={!dirty || saving}>
          إلغاء
        </Button>
      </div>
    </Card>
  );
}

function SectionHead({ title, line, tone }: { title: string; line: string; tone: 'shop' | 'odoo' }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', tone === 'shop' ? 'bg-[#EEF0FA] text-dark-ocean' : 'bg-[#E2F4F6] text-[#0E5E68]')}>
        <Icon name={tone === 'shop' ? 'monitor' : 'factory'} size={16} />
      </span>
      <span className="flex flex-col gap-0.5">
        <b className="text-[15px]">{title}</b>
        <span className="text-[12.5px] leading-relaxed text-[#5F6373]">{line}</span>
      </span>
    </div>
  );
}

function SubLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-[#5F6373]">
      <span>{children}</span>
      {aside}
    </span>
  );
}

/** A picture to choose (or drop) - held in the form until «حفظ». */
function PickTile({ label, onPick, maxWidth }: { label: string; onPick: (dataUrl: string) => void; maxWidth: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function take(file: File | undefined) {
    if (!file || busy) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('اختر صورة JPEG أو PNG أو WebP');
      return;
    }
    setBusy(true);
    try {
      onPick(await compress(file, maxWidth));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّرت قراءة الصورة');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void take(e.dataTransfer.files?.[0]);
        }}
        aria-label={label}
        title={label}
        aria-busy={busy}
        className="grid size-[92px] shrink-0 place-items-center rounded-xl border-[1.5px] border-dashed border-[#E4E6EE] text-[#5F6373] transition-colors hover:border-[#C9CCDA] hover:text-dark-ocean"
      >
        {busy ? <span className="size-5 animate-spin rounded-full border-[3px] border-[#E4E6EE] border-t-dark-ocean" /> : <Icon name="plus" size={22} />}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void take(e.target.files?.[0])} />
    </>
  );
}

function Photo({ src, note }: { src: string | null; note?: ReactNode }) {
  return (
    <span className="relative size-[92px] shrink-0 overflow-hidden rounded-xl bg-[#EEF0FA]">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[#5F6373]"><Icon name="image" size={24} /></span>}
      {note ? <span className="absolute inset-x-1 bottom-1 rounded-md bg-white/90 px-1 py-0.5 text-center text-[10.5px] font-semibold text-[#16161F]">{note}</span> : null}
    </span>
  );
}

function Chip({ children, onRemove, label, tone = 'ocean' }: { children: ReactNode; onRemove: () => void; label: string; tone?: 'ocean' | 'grey' | 'new' }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-full ps-3 pe-1 text-[13px] font-semibold',
        tone === 'ocean' ? 'bg-[#EEF0FA] text-dark-ocean' : tone === 'new' ? 'bg-[#E3F5E6] text-[#1E6B2E]' : 'bg-[#F4F4F6] text-[#3B3E4C] shadow-[inset_0_0_0_1px_#E4E6EE]'
      )}
    >
      {children}
      <button type="button" onClick={onRemove} aria-label={label} className="grid size-6 place-items-center rounded-full hover:bg-black/5">
        <Icon name="close" size={13} />
      </button>
    </span>
  );
}

function ShopSection({
  row,
  draft,
  set,
  featureIcons,
  odooOn,
}: {
  row: PanelProduct;
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  featureIcons: string[];
  odooOn: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const shop = row.shop;
  if (!shop) {
    return (
      <section className="flex flex-col gap-3 border-t border-[#E4E6EE] pt-4">
        <SectionHead tone="shop" title="ما يظهر في المتجر" line="الصورة والوصف والمميزات كما يراها العملاء في الموقع والتطبيق." />
        <p className="rounded-xl bg-[#F5F6FA] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#3B3E4C]">
          {odooOn
            ? `${row.name} ليست ضمن فئات المتجر في أودو بعد، فلا تظهر في الموقع والتطبيق. تظهر حين تُنقل إلى فئتها تحت «Mattresses» في أودو، ويُعدَّل محتواها هنا بعدها.`
            : `${row.name} ليست في كتالوج المتجر الحالي: المتجر يعرض كتالوجاً تجريبياً حتى يُربط أودو.`}
        </p>
      </section>
    );
  }

  const shownImage = draft.shopImage === 'remove' ? shop.catalogueImage : draft.shopImage ?? shop.image;
  const source = draft.shopImage === 'remove' ? 'catalogue' : draft.shopImage ? 'new' : shop.imageSource;
  const sourceText = source === 'new' ? 'جديدة' : source === 'upload' ? 'مرفوعة' : source === 'catalogue' ? 'الكتالوج' : source === 'odoo' ? 'أودو' : undefined;
  const remaining = featureIcons.filter((k) => !draft.features.includes(k) && FEATURE_LABELS[k]);
  const followsCatalogue = same(draft.features, shop.catalogueFeatures);

  return (
    <section className="flex flex-col gap-4 border-t border-[#E4E6EE] pt-4">
      <SectionHead tone="shop" title="ما يظهر في المتجر" line="يراه العملاء في الموقع والتطبيق فور الحفظ - محفوظ في خادم الموقع، لا في أودو." />

      <div className="flex flex-col gap-2">
        <SubLabel
          aside={
            source === 'upload' || source === 'new' ? (
              <button type="button" onClick={() => set('shopImage', shop.imageSource === 'upload' ? 'remove' : null)} className="text-[12.5px] font-semibold text-dark-ocean underline underline-offset-4">
                {shop.catalogueImage ? 'صورة الكتالوج' : 'إزالة الصورة'}
              </button>
            ) : null
          }
        >
          صورة المتجر
        </SubLabel>
        <div className="flex gap-3">
          <Photo src={shownImage} note={sourceText} />
          <PickTile label={`صورة جديدة لـ${row.name} في المتجر`} maxWidth={1600} onPick={(url) => set('shopImage', url)} />
        </div>
      </div>

      <Field
        label="الوصف (من الكتالوج)"
        value={draft.description}
        onChange={(v) => set('description', v)}
        placeholder={shop.catalogueDescription ?? 'وصف المرتبة'}
        multiline
        rows={4}
        maxLength={2000}
        hint={
          shop.descriptionOverride
            ? shop.catalogueDescription
              ? 'وصف معدَّل هنا. امسحه ليعود وصف الكتالوج.'
              : 'وصف مكتوب هنا - لا وصف لها في الكتالوج المطبوع.'
            : shop.catalogueDescription
              ? 'وصف الكتالوج المطبوع. التعديل هنا يحلّ محله في المتجر.'
              : 'لا وصف لها في الكتالوج المطبوع، فلا يظهر وصف في المتجر. ما يُكتب هنا يظهر بعد الحفظ.'
        }
      />

      <div className="flex flex-col gap-2">
        <SubLabel
          aside={
            !followsCatalogue && shop.catalogueFeatures.length ? (
              <button type="button" onClick={() => set('features', shop.catalogueFeatures)} className="text-[12.5px] font-semibold text-dark-ocean underline underline-offset-4">
                أيقونات الكتالوج
              </button>
            ) : null
          }
        >
          المميزات (أيقونات الكتالوج)
        </SubLabel>
        <div className="flex flex-wrap gap-2">
          {draft.features.map((k) => (
            <Chip key={k} label={`إزالة ${FEATURE_LABELS[k] ?? k}`} onRemove={() => set('features', draft.features.filter((x) => x !== k))}>
              {FEATURE_LABELS[k] ?? k}
            </Chip>
          ))}
          {remaining.length ? (
            adding ? (
              <select
                autoFocus
                defaultValue=""
                onBlur={() => setAdding(false)}
                onChange={(e) => {
                  if (e.target.value) set('features', [...draft.features, e.target.value]);
                  setAdding(false);
                }}
                aria-label="إضافة ميزة"
                className="h-8 rounded-full bg-white px-3 text-[13px] shadow-[inset_0_0_0_1px_#E4E6EE]"
              >
                <option value="" disabled>
                  اختر ميزة
                </option>
                {remaining.map((k) => (
                  <option key={k} value={k}>
                    {FEATURE_LABELS[k]}
                  </option>
                ))}
              </select>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-semibold text-[#3B3E4C] shadow-[inset_0_0_0_1px_#E4E6EE] hover:bg-[#F5F6FA]">
                <Icon name="plus" size={14} />
                إضافة
              </button>
            )
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F5F6FA] px-3.5 py-2.5">
        <span className="flex flex-col">
          <b className="text-sm">ظاهرة في المتجر</b>
          <span className="text-[12.5px] text-[#5F6373]">المخفية لا تظهر في الموقع والتطبيق، ولا تُطلب.</span>
        </span>
        <Switch checked={draft.enabled} onChange={(v) => set('enabled', v)} label={`${row.name} ظاهرة في المتجر`} />
      </div>
    </section>
  );
}

function OdooSection({ row, draft, set, data }: { row: PanelProduct; draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; data: ProductsPayload }) {
  const [tagText, setTagText] = useState('');
  const known = useMemo(() => new Map(data.tags.map((t) => [t.name.trim().toLowerCase(), t])), [data.tags]);
  const head = <SectionHead tone="odoo" title="في أودو" line="صورة المنتج ووسومه ووصف البيع في سجل المنتج - تُكتب في أودو عند «حفظ» فقط." />;

  if (!data.odoo.connected || data.odoo.error || !row.odoo) {
    const message = !data.odoo.connected
      ? 'أودو غير متصل. يربطه المدير من «الربط والتكاملات»، ثم تُعدَّل هنا صورة المنتج ووسومه ووصفه في أودو.'
      : data.odoo.error
        ? data.odoo.error
        : `${row.name} غير موجودة في أودو بالمعرّف ${row.templateId ?? '—'}.`;
    return (
      <section className="flex flex-col gap-3 border-t border-[#E4E6EE] pt-4">
        {head}
        <p className="flex items-start gap-2.5 rounded-xl bg-[#F4F4F6] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#3B3E4C]" role="status">
          <Icon name="plug" size={18} className="mt-0.5" />
          <span>
            <b className="block">أودو غير متصل</b>
            {message}
          </span>
        </p>
      </section>
    );
  }

  const odoo = row.odoo;
  function addTag(e?: FormEvent) {
    e?.preventDefault();
    const name = tagText.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (name.length > 40) {
      toast.error('الوسم 40 حرفاً كحد أقصى');
      return;
    }
    const existing = known.get(name.toLowerCase());
    const tag = existing ? { id: existing.id, name: existing.name } : { id: null, name };
    if (!draft.tags.some((t) => (t.id !== null && t.id === tag.id) || t.name.toLowerCase() === tag.name.toLowerCase())) set('tags', [...draft.tags, tag]);
    setTagText('');
  }

  return (
    <section className="flex flex-col gap-4 border-t border-[#E4E6EE] pt-4">
      {head}

      <div className="flex flex-col gap-2">
        <SubLabel
          aside={
            draft.odooImage ? (
              <button type="button" onClick={() => set('odooImage', null)} className="text-[12.5px] font-semibold text-dark-ocean underline underline-offset-4">
                تراجع
              </button>
            ) : null
          }
        >
          صورة المنتج (image_1920)
        </SubLabel>
        <div className="flex items-center gap-3">
          <Photo src={draft.odooImage ?? odoo.image} note={draft.odooImage ? 'جديدة' : undefined} />
          <PickTile label={`صورة ${row.name} في أودو`} maxWidth={1920} onPick={(url) => set('odooImage', url)} />
          {!odoo.hasImage && !draft.odooImage ? (
            <span className="flex items-start gap-1.5 text-[12.5px] font-semibold leading-relaxed text-[#A12020]">
              <Icon name="warning" size={15} className="mt-0.5" />
              الصورة ناقصة في أودو
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SubLabel>
          وسوم الاقتراح (<bdi dir="ltr">product tags</bdi> في أودو)
        </SubLabel>
        <div className="flex flex-wrap gap-2">
          {draft.tags.length === 0 ? <span className="text-[13px] text-[#5F6373]">لا وسوم بعد.</span> : null}
          {draft.tags.map((t) => (
            <Chip key={t.id ?? `new-${t.name}`} tone={t.id === null ? 'new' : 'grey'} label={`إزالة الوسم ${t.name}`} onRemove={() => set('tags', draft.tags.filter((x) => x !== t))}>
              {t.name}
              {t.id === null ? <span className="text-[11px] font-normal">(جديد)</span> : null}
            </Chip>
          ))}
        </div>
        <form onSubmit={addTag} className="flex gap-2">
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            list={`odoo-tags-${odoo.templateId}`}
            placeholder="أضف وسماً من أودو أو اكتب جديداً"
            aria-label="إضافة وسم"
            maxLength={60}
            className="h-10 min-w-0 flex-1 rounded-[10px] bg-white px-3 text-sm outline-none shadow-[inset_0_0_0_1px_#E4E6EE] placeholder:text-[#5F6373] focus-visible:shadow-[inset_0_0_0_1.5px_#282868]"
          />
          <datalist id={`odoo-tags-${odoo.templateId}`}>
            {data.tags
              .filter((t) => !draft.tags.some((x) => x.id === t.id))
              .map((t) => (
                <option key={t.id} value={t.name} />
              ))}
          </datalist>
          <Button type="submit" variant="outline" size="sm" className="h-10" disabled={!tagText.trim()}>
            <Icon name="plus" size={16} />
            إضافة
          </Button>
        </form>
      </div>

      <Field
        label="وصف البيع في أودو (description_sale)"
        value={draft.descriptionSale}
        onChange={(v) => set('descriptionSale', v)}
        placeholder="يظهر في عروض الأسعار وأوامر البيع في أودو"
        multiline
        rows={3}
        maxLength={2000}
      />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-[#F5F6FA] px-3.5 py-3 text-[13px]">
        <ReadOnly label="السعر">{odoo.listPrice !== null ? money(row.shop?.priceFrom ?? odoo.listPrice) : '—'}</ReadOnly>
        <ReadOnly label="المقاسات">{row.shop ? counted(row.shop.sizes, ['مقاس واحد', 'مقاسان', 'مقاسات', 'مقاساً']) : '—'}</ReadOnly>
        <ReadOnly label="المخزون">{row.shop?.stock !== null && row.shop?.stock !== undefined ? `${row.shop.stock} قطعة` : '—'}</ReadOnly>
        <ReadOnly label="الضمان">{row.shop ? years(row.shop.warrantyYears) : '—'}</ReadOnly>
        <span className="col-span-2 flex items-center gap-1.5 text-[12px] text-[#5F6373]">
          <Icon name="lock" size={14} />
          للقراءة فقط - تُعدَّل في أودو
          {odoo.link ? (
            <a href={odoo.link} target="_blank" rel="noreferrer" className="ms-auto font-semibold text-dark-ocean underline underline-offset-4">
              السجل في أودو
            </a>
          ) : null}
        </span>
      </dl>
    </section>
  );
}

function ReadOnly({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-[#5F6373]">{label}</dt>
      <dd className="m-0 font-semibold">{children}</dd>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-[52px]" />
        ))}
      </Card>
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-[92px] w-[200px]" />
        <Skeleton className="h-20" />
        <Skeleton className="h-10" />
      </Card>
    </div>
  );
}
