import { useRef, useState } from 'react';
import { ImagePlus, Package, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { displayName, lineParts } from '../catalog';
import { useTitle } from '../hooks';
import { photoOf } from '../ProductCard';
import { Link, useRouter } from '../router';
import { lineItem, useShop } from '../state';
import { AFTER_MARK, EmptyState, SizeText, Skeleton, StatusDot, SuccessMark } from '../ui';
import { AccountLayout, useMyOrders } from './AccountLayout';

type IssueType = 'delay' | 'damaged' | 'wrong' | 'missing' | 'billing' | 'other';

const TYPES: { value: IssueType; label: string }[] = [
  { value: 'delay', label: 'تأخّر التوصيل' },
  { value: 'damaged', label: 'وصلت المرتبة متضرّرة' },
  { value: 'wrong', label: 'مقاس أو منتج مختلف' },
  { value: 'missing', label: 'نقص في الطلب' },
  { value: 'billing', label: 'الدفع أو الفاتورة' },
  { value: 'other', label: 'أخرى' },
];

const MAX_PHOTOS = 4;

/** A photo shrunk to 1280 px and re-encoded as JPEG - the server takes 2 MB each (src/routes/user.js). */
function toJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف ليس صورة'));
      img.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * الإبلاغ عن مشكلة (handoff WebIssue): the kind of problem, which mattress,
 * what happened, up to four photos (required for damage); it becomes a
 * Helpdesk ticket, then «استلمنا بلاغك» (reference-ios IssueSent).
 */
export function IssuePage({ orderName }: { orderName: string }) {
  const shop = useShop();
  const { go } = useRouter();
  useTitle('الإبلاغ عن مشكلة');
  const { orders } = useMyOrders();
  const order = orders?.find((o) => o.orderName === orderName) ?? null;
  const [type, setType] = useState<IssueType | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const crumbs = [
    { label: 'طلباتي', to: { name: 'account' as const, section: 'orders' as const } },
    { label: `طلب #${orderName}`, to: { name: 'order' as const, orderName } },
    { label: 'الإبلاغ عن مشكلة' },
  ];

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    try {
      const next = await Promise.all([...files].slice(0, room).map(toJpeg));
      setPhotos((p) => [...p, ...next].slice(0, MAX_PHOTOS));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إضافة الصورة');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit() {
    if (!order || !shop.auth.token) return;
    if (!type) return setError('اختر نوع المشكلة.');
    if (type === 'damaged' && photos.length === 0) return setError('أضف صورة للضرر.');
    if (text.trim().length < 5) return setError('صف المشكلة في كلمات قليلة.');
    setBusy(true);
    setError(null);
    try {
      const products = order.items
        .filter((i) => picked.includes(i.productId))
        .map((i) => {
          const { product, variant } = lineItem(shop.find, i.productId);
          return `${product ? displayName(product) : i.productId} ${lineParts(variant).size}`.trim();
        });
      const { ref } = await api.reportIssue(shop.auth.token, order.orderName, { type, products, description: text.trim(), photos });
      setSent(ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال البلاغ');
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <AccountLayout section="orders" crumbs={crumbs}>
        {orders === null ? <Skeleton className="h-64" /> : <EmptyState icon={<Package />} title="لم نجد هذا الطلب في حسابك" />}
      </AccountLayout>
    );
  }

  if (sent) {
    return (
      <AccountLayout section="orders" crumbs={crumbs}>
        <div className="flex max-w-lg flex-col items-start gap-4">
          <SuccessMark />
          <h1 className={cn('font-display text-[28px] font-bold', AFTER_MARK)}>استلمنا بلاغك</h1>
          <p className={cn('text-[15px] text-muted-foreground', AFTER_MARK)}>سيتواصل معك فريق خدمة العملاء لترتيب الحل المناسب.</p>
          <div className={cn('flex w-full flex-col gap-2.5 rounded-lg border border-border p-5 text-[15px]', AFTER_MARK)}>
            <span className="flex justify-between">
              <span className="text-muted-foreground">رقم البلاغ</span>
              <bdi dir="ltr">{sent}</bdi>
            </span>
            <span className="flex justify-between">
              <span className="text-muted-foreground">الطلب</span>
              <bdi dir="ltr">#{order.orderName}</bdi>
            </span>
            <span className="flex justify-between">
              <span className="text-muted-foreground">الحالة</span>
              <StatusDot tone="warning">قيد المراجعة</StatusDot>
            </span>
          </div>
          <div className={cn('flex gap-3', AFTER_MARK)}>
            <Button size="store" onClick={() => go({ name: 'order', orderName: order.orderName })}>
              العودة إلى الطلب
            </Button>
            <Button asChild variant="outline" size="store">
              <Link to={{ name: 'account', section: 'orders' }}>طلباتي</Link>
            </Button>
          </div>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout section="orders" crumbs={crumbs}>
      <div className="flex max-w-2xl flex-col gap-7">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-bold lg:text-[36px]">الإبلاغ عن مشكلة</h1>
          <span className="text-[15px] text-muted-foreground">
            طلب <bdi dir="ltr">#{order.orderName}</bdi> · يتواصل معك فريق خدمة العملاء بعد إرسال البلاغ.
          </span>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-lg font-bold">ما المشكلة؟</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <label key={t.value} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-[15px] font-bold', type === t.value ? 'border-2 border-foreground p-[15px]' : 'border-border')}>
                <input type="radio" name="issue-type" className="size-5 accent-foreground" checked={type === t.value} onChange={() => setType(t.value)} />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-lg font-bold">أي منتج؟</legend>
          {order.items.map((it) => {
            const { product, variant } = lineItem(shop.find, it.productId);
            const on = picked.includes(it.productId);
            return (
              <label key={it.productId} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3', on ? 'border-2 border-foreground p-[11px]' : 'border-border')}>
                <input type="checkbox" className="size-5 accent-foreground" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== it.productId) : [...p, it.productId]))} />
                {product ? <img src={photoOf(product)} alt="" className="size-12 bg-image-bg object-cover" /> : null}
                <span className="text-[15px] font-bold">
                  {product ? displayName(product) : `#${it.productId}`} {lineParts(variant).size ? <SizeText>{lineParts(variant).size}</SizeText> : null}
                </span>
              </label>
            );
          })}
        </fieldset>

        <label className="flex flex-col gap-2">
          <b className="text-lg">صف المشكلة</b>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="مثلاً: تمزّق في القماش عند الزاوية…" className="rounded-lg border border-input bg-background p-4 text-base outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring" />
        </label>

        <div className="flex flex-col gap-2">
          <b className="text-lg">الصور</b>
          <span className="text-sm text-muted-foreground">مطلوبة عند وجود ضرر · حتى 4 صور</span>
          <div className="flex flex-wrap gap-3">
            {photos.length < MAX_PHOTOS ? (
              <button type="button" onClick={() => fileInput.current?.click()} className="grid size-24 place-items-center rounded-lg border border-dashed border-input text-sm text-muted-foreground hover:border-foreground">
                <span className="flex flex-col items-center gap-1">
                  <ImagePlus className="size-6" aria-hidden />
                  أضف صورة
                </span>
              </button>
            ) : null}
            {photos.map((src, i) => (
              <span key={i} className="relative">
                <img src={src} alt={`صورة ${i + 1}`} className="size-24 rounded-lg object-cover" />
                <button type="button" aria-label="إزالة الصورة" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -end-2 -top-2 grid size-7 place-items-center rounded-full border border-border bg-background after:absolute after:-inset-2">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files)} />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button size="store" loading={busy} onClick={() => void submit()}>
            إرسال البلاغ
          </Button>
          <Button asChild variant="outline" size="store">
            <Link to={{ name: 'order', orderName: order.orderName }}>إلغاء</Link>
          </Button>
        </div>
      </div>
    </AccountLayout>
  );
}
