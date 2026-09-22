import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { Banner } from '@/types';

/** Wide enough for a large screen, small enough to load fast on a phone. */
const MAX_WIDTH = 1600;

/**
 * Shrinks the picked picture to at most 1600 px wide and re-encodes it as
 * JPEG - a photo from a camera or a designer is often 5-10 MB, the server
 * takes 3. Read as a data: URL because the page's CSP does not allow blob:.
 */
function toJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('تعذّر قراءة الصورة — اختر صورة JPEG أو PNG'));
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = () => {
      const img = new Image();
      img.onerror = fail;
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('المتصفح لا يدعم معالجة الصور'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * The home page's sliding banners: add a picture, give it a link inside the
 * shop, reorder, delete. The website and the app read the same list.
 */
export function BannersPanel({ token }: { token: string }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [max, setMax] = useState(5);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [newLink, setNewLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  function show(list: Banner[]) {
    setBanners(list);
    setLinks(Object.fromEntries(list.map((b) => [b.id, b.link])));
  }

  useEffect(() => {
    api
      .adminBanners(token)
      .then((r) => {
        show(r.banners);
        setMax(r.max);
      })
      .catch((err) => toast.error(err.message))
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
      const { banner } = await api.adminAddBanner(token, await toJpeg(file), newLink.trim());
      show([...banners, banner]);
      setNewLink('');
      if (input.current) input.current.value = '';
    }, 'أُضيفت الصورة');

  const move = (index: number, by: number) =>
    run(async () => {
      const ids = banners.map((b) => b.id);
      [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
      show((await api.adminReorderBanners(token, ids)).banners);
    });

  const saveLink = (b: Banner) =>
    run(async () => {
      const { banner } = await api.adminSetBannerLink(token, b.id, (links[b.id] ?? '').trim());
      show(banners.map((x) => (x.id === b.id ? banner : x)));
    }, 'حُفظ الرابط');

  const remove = (b: Banner) =>
    run(async () => show((await api.adminDeleteBanner(token, b.id)).banners), 'حُذفت الصورة');

  return (
    <Card>
      <CardHeader>
        <CardTitle>صور الإعلانات</CardTitle>
        <CardDescription>
          تتحرك في الصفحة الرئيسية للموقع والتطبيق مكان الإعلان. الأفضل 3 صور عرضية بمقاس 1600×900. الرابط اختياري
          ويكون داخل المتجر، مثل <span dir="ltr">/shop?category=premium</span> أو <span dir="ltr">/product/5852</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {!loading && banners.length === 0 && (
          <p className="text-sm text-muted-foreground">لا صور بعد — يظهر نص الإعلان المعتاد لين تضيف صورة.</p>
        )}

        {banners.map((b, i) => (
          <div key={b.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
            <img src={b.imageUrl} alt="" className="aspect-video w-full rounded-md object-cover sm:w-48" />
            <div className="flex flex-1 flex-col gap-2">
              <span className="text-sm font-semibold">الصورة {i + 1}</span>
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  value={links[b.id] ?? ''}
                  onChange={(e) => setLinks({ ...links, [b.id]: e.target.value })}
                  placeholder="/shop?category=premium"
                  aria-label={`رابط الصورة ${i + 1}`}
                />
                <Button size="sm" variant="outline" disabled={busy || (links[b.id] ?? '') === b.link} onClick={() => void saveLink(b)}>
                  حفظ
                </Button>
              </div>
            </div>
            <div className="flex gap-1 sm:flex-col">
              <Button size="icon" variant="ghost" disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label="للأمام">
                <ArrowUp className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" disabled={busy || i === banners.length - 1} onClick={() => void move(i, 1)} aria-label="للخلف">
                <ArrowDown className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" disabled={busy} onClick={() => void remove(b)} aria-label="حذف">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}

        {!loading && banners.length < max && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row">
            <Input
              dir="ltr"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="رابط اختياري: /shop?category=premium"
              aria-label="رابط الصورة الجديدة"
            />
            <Button disabled={busy} onClick={() => input.current?.click()}>
              <ImagePlus className="size-4" />
              {busy ? 'جارٍ الرفع…' : 'إضافة صورة'}
            </Button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void add(e.target.files?.[0])}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
