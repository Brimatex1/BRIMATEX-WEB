import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Lock, MapPin, Package, ShieldCheck, Truck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { OrderSummary } from '@/types';

import { CITIES } from '../CityDialog';
import { useTitle } from '../hooks';
import { Link } from '../router';
import { useShop } from '../state';
import { EmptyState, Skeleton } from '../ui';
import { currentStep, isCancelled } from '../orders';
import { AccountLayout, useMyOrders } from './AccountLayout';

/* ───────────── العناوين ───────────── */

/**
 * العناوين (handoff WebAddresses): the saved addresses, the first one used
 * first at checkout; «+ عنوان جديد» with the checkout's fields. The server
 * keeps a city and an address only (no names, no edit, no default flag), so
 * the drawings' «تعديل» and «اجعله الافتراضي» wait for it.
 */
export function AddressesPage() {
  const shop = useShop();
  useTitle('العناوين');
  const user = shop.auth.user;
  const [adding, setAdding] = useState(false);
  const [city, setCity] = useState(shop.city ?? 'طرابلس');
  const [area, setArea] = useState('');
  const [street, setStreet] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addresses = user?.addresses ?? [];

  async function save() {
    if (!shop.auth.token || !user) return;
    if (!area.trim() || street.trim().length < 3) return setError('أدخل المنطقة وأقرب معلم.');
    setBusy(true);
    setError(null);
    try {
      const { address } = await api.addAddress(shop.auth.token, `${area.trim()}، ${street.trim()}`, city);
      shop.auth.patchUser({ addresses: [...addresses, address] });
      setAdding(false);
      setArea('');
      setStreet('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حفظ العنوان');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!shop.auth.token) return;
    try {
      await api.removeAddress(shop.auth.token, id);
      shop.auth.patchUser({ addresses: addresses.filter((a) => a.id !== id) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف العنوان');
    }
  }

  const field = 'h-[52px] w-full rounded-lg border border-input bg-background px-4 text-base outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <AccountLayout section="addresses" crumbs={[{ label: 'العناوين' }]}>
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
        <h1 className="font-display text-[28px] font-bold lg:text-[36px]">العناوين</h1>
        <Button variant="outline" size="sm" className="h-10 px-5" onClick={() => setAdding(true)}>
          + عنوان جديد
        </Button>
      </div>
      {addresses.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {addresses.map((a, i) => (
            <div key={a.id} className={cn('flex flex-col gap-1.5 rounded-lg p-5', i === 0 ? 'border-2 border-foreground' : 'border border-border')}>
              <span className="flex items-center gap-2">
                <b className="text-base">{a.city}</b>
                {i === 0 ? <span className="rounded-full bg-image-bg px-2.5 py-0.5 text-xs font-bold">الافتراضي</span> : null}
              </span>
              <span className="text-[15px] text-muted-foreground">{a.address}</span>
              <button type="button" className="mt-2 self-start text-sm font-bold text-destructive underline underline-offset-4" onClick={() => void remove(a.id)}>
                حذف
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<MapPin />} title="لا توجد عناوين محفوظة" body="احفظ عنوانك عند إتمام الطلب، أو أضفه من هنا." action="+ عنوان جديد" onAction={() => setAdding(true)} />
      )}
      <p className="mt-6 text-sm text-muted-foreground">العنوان الافتراضي يُستخدم تلقائياً عند إتمام الطلب، ويمكنك تغييره هناك.</p>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-xl font-bold">عنوان جديد</DialogTitle>
          <DialogDescription className="sr-only">المدينة والمنطقة وأقرب معلم</DialogDescription>
          <label className="flex flex-col gap-1.5">
            <b className="text-sm">المدينة</b>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={field}>
              {[...new Set([city, ...CITIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <b className="text-sm">المنطقة</b>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="مثال: حي الأندلس" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <b className="text-sm">الشارع وأقرب معلم</b>
            <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="مثال: قرب جامع…، الدور الثاني" className={field} />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button size="store" loading={busy} onClick={() => void save()}>
            حفظ العنوان
          </Button>
        </DialogContent>
      </Dialog>
    </AccountLayout>
  );
}

/* ───────────── الإعدادات ───────────── */

/** A square-ish photo, shrunk to 512 px - the server checks the bytes (src/lib/avatar.js). */
function toAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف ليس صورة'));
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.min(512, side);
        canvas.getContext('2d')?.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * الإعدادات (reference-ios Settings, in a web layout): the photo, the name -
 * editable - the number, which is the login and is not edited, the delivery
 * city, appearance and the legal pages. The app's notification switches have
 * no web counterpart (web orders get WhatsApp / SMS from Odoo), so none here.
 */
export function SettingsPage() {
  const shop = useShop();
  useTitle('الإعدادات');
  const user = shop.auth.user;
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  // The session is read after the first paint: the field takes the name once it arrives.
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function saveName() {
    if (!shop.auth.token || name.trim().length < 2) return;
    setSaving(true);
    try {
      const { user: next } = await api.updateName(shop.auth.token, name.trim());
      shop.auth.patchUser({ name: next.name });
      toast.success('حُفظ الاسم');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ الاسم');
    } finally {
      setSaving(false);
    }
  }

  async function changePhoto(f: File | undefined) {
    if (!f || !shop.auth.token) return;
    setPhotoBusy(true);
    try {
      const { avatarUrl } = await api.uploadAvatar(shop.auth.token, await toAvatar(f));
      shop.auth.patchUser({ avatarUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    } finally {
      setPhotoBusy(false);
      if (file.current) file.current.value = '';
    }
  }

  async function removePhoto() {
    if (!shop.auth.token) return;
    try {
      await api.removeAvatar(shop.auth.token);
      shop.auth.patchUser({ avatarUrl: null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر إزالة الصورة');
    }
  }

  const row = 'flex flex-wrap items-center justify-between gap-4 border-b border-border py-5';
  return (
    <AccountLayout section="settings" crumbs={[{ label: 'الإعدادات' }]}>
      <h1 className="pb-4 font-display text-[28px] font-bold lg:text-[36px]">الإعدادات</h1>
      <section className="flex max-w-2xl flex-col">
        <b className="pb-1 pt-2 text-lg">بياناتي</b>
        <div className={row}>
          <span className="flex items-center gap-4">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-14 rounded-full object-cover" /> : <span className="grid size-14 place-items-center rounded-full bg-porcelain text-xl font-bold text-dark-ocean">{user?.name.trim().charAt(0)}</span>}
            <span className="flex flex-col">
              <b>الصورة الشخصية</b>
              <span className="text-sm text-muted-foreground">تظهر في حسابك وبجانب تقييماتك.</span>
            </span>
          </span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" className="h-10 px-4" loading={photoBusy} onClick={() => file.current?.click()}>
              تغيير
            </Button>
            {user?.avatarUrl ? (
              <Button variant="ghost" size="sm" className="h-10 px-4 text-destructive" onClick={() => void removePhoto()}>
                <X className="size-4" />
                إزالة
              </Button>
            ) : null}
          </span>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void changePhoto(e.target.files?.[0])} />
        </div>
        <div className={row}>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <b>الاسم</b>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-12 max-w-sm rounded-lg border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <Button size="sm" className="h-10 px-5" disabled={name.trim() === user?.name || name.trim().length < 2} loading={saving} onClick={() => void saveName()}>
            حفظ
          </Button>
        </div>
        <div className={row}>
          <span className="flex flex-col gap-1">
            <b>رقم واتساب</b>
            <span className="text-sm text-muted-foreground">رقمك هو حسابك، ولا يمكن تغييره.</span>
          </span>
          <span className="flex items-center gap-2">
            <bdi dir="ltr" className="tabular-nums">
              {user?.phone}
            </bdi>
            <Lock className="size-4 text-muted-foreground" aria-hidden />
          </span>
        </div>
        <div className={row}>
          <b>مدينة التوصيل</b>
          <button type="button" className="text-[15px] font-bold text-brand-text underline underline-offset-4" onClick={() => shop.setCityDialogOpen(true)}>
            {shop.city ?? 'اختر مدينتك'}
          </button>
        </div>
        <b className="pb-1 pt-8 text-lg">الموقع</b>
        <div className={row}>
          <b>المظهر</b>
          <span className="text-muted-foreground">يتبع إعداد جهازك (فاتح أو داكن)</span>
        </div>
        <div className={row}>
          <Link to={{ name: 'legal', page: 'privacy' }} className="font-bold hover:underline">
            سياسة الخصوصية
          </Link>
        </div>
        <div className={row}>
          <Link to={{ name: 'legal', page: 'terms' }} className="font-bold hover:underline">
            الشروط والأحكام
          </Link>
        </div>
      </section>
    </AccountLayout>
  );
}

/* ───────────── الإشعارات ───────────── */

interface Notice {
  key: string;
  icon: typeof Bell;
  title: string;
  body: string;
  at: Date;
  order: OrderSummary;
}

/** What happened to each order, newest first - the moments WhatsApp / SMS announce (docs/NOTIFICATIONS.md). */
function noticesOf(orders: OrderSummary[]): Notice[] {
  const list: Notice[] = [];
  for (const o of orders) {
    const placed = new Date(o.placedAt);
    if (isCancelled(o)) {
      list.push({ key: `${o.orderName}:x`, icon: X, title: 'تم إلغاء طلبك', body: `أُلغي طلبك رقم ${o.orderName}، ولا يوجد أي مبلغ مستحق عليك.`, at: placed, order: o });
      continue;
    }
    const step = currentStep(o);
    if (step >= 2) list.push({ key: `${o.orderName}:c`, icon: CheckCircle2, title: 'تم تأكيد طلبك', body: `طلبك رقم ${o.orderName} مؤكد${o.deliveryText ? `، والتوصيل ${o.deliveryText}` : ''}.`, at: placed, order: o });
    if (step >= 3 && o.shippedAt) list.push({ key: `${o.orderName}:s`, icon: Truck, title: 'طلبك في الطريق', body: `يصلك طلبك رقم ${o.orderName}. الدفع عند الاستلام.`, at: new Date(o.shippedAt), order: o });
    if (step === 4) list.push({ key: `${o.orderName}:d`, icon: ShieldCheck, title: 'تم تسليم طلبك', body: `وصل طلبك رقم ${o.orderName}. نتمنى لك نوماً هانئاً.`, at: new Date(o.paidAt ?? o.shippedAt ?? o.placedAt), order: o });
  }
  return list.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function groupOf(at: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (at >= today) return 'اليوم';
  if (today.getTime() - at.getTime() < 6 * 86400000) return 'هذا الأسبوع';
  return 'أقدم';
}

/** الإشعارات (reference-ios Notifications): the orders' moments, today, this week and older. */
export function NotificationsPage() {
  useTitle('الإشعارات');
  const { orders } = useMyOrders();
  const notices = noticesOf(orders ?? []);
  const groups = notices.reduce<{ title: string; items: Notice[] }[]>((acc, n) => {
    const g = groupOf(n.at);
    const last = acc[acc.length - 1];
    if (last?.title === g) last.items.push(n);
    else acc.push({ title: g, items: [n] });
    return acc;
  }, []);
  return (
    <AccountLayout section="notifications" crumbs={[{ label: 'الإشعارات' }]}>
      <h1 className="pb-4 font-display text-[28px] font-bold lg:text-[36px]">الإشعارات</h1>
      {orders === null ? (
        <Skeleton className="h-40" />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Bell />} title="لا توجد إشعارات بعد" body="ستجد هنا حالة طلباتك: التأكيد والخروج للتوصيل والتسليم." />
      ) : (
        <div className="flex max-w-2xl flex-col gap-6">
          {groups.map((g) => (
            <section key={g.title}>
              <b className="text-sm text-muted-foreground">{g.title}</b>
              {g.items.map(({ key, icon: Icon, title, body, at, order }) => (
                <Link key={key} to={{ name: 'order', orderName: order.orderName }} className="flex gap-4 border-b border-border py-4 hover:bg-accent/50">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-image-bg text-brand-text">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <b className="text-[15px]">{title}</b>
                    <span className="text-sm text-muted-foreground">{body}</span>
                    <span className="text-xs text-text-tertiary">{at.toLocaleDateString('ar-LY', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                  </span>
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}
    </AccountLayout>
  );
}

/** Not built yet: warranty (phase 4). */
export function AccountComingPage({ section, title }: { section: 'warranty'; title: string }) {
  useTitle(title);
  return (
    <AccountLayout section={section} crumbs={[{ label: title }]}>
      <h1 className="pb-4 font-display text-[28px] font-bold lg:text-[36px]">{title}</h1>
      <EmptyState icon={<Package />} title="قريباً" body="هذه الصفحة في المرحلة التالية." />
    </AccountLayout>
  );
}
