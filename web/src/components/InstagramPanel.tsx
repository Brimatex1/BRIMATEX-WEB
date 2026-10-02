import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { toJpeg } from '@/components/BannersPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { InstagramPost } from '@/types';

/**
 * «من إنستغرام بريماتكس» on the home page: up to five pictures, each with
 * its post's address. Set by hand until the account's posts can be read
 * directly (a professional account linked to the Facebook page).
 */
export function InstagramPanel({ token }: { token: string }) {
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [max, setMax] = useState(5);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .adminInstagram(token)
      .then((r) => {
        setPosts(r.posts);
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
      const { post } = await api.adminAddInstagram(token, await toJpeg(file), link.trim());
      setPosts([...posts, post]);
      setLink('');
      if (input.current) input.current.value = '';
    }, 'أُضيفت الصورة');

  const move = (index: number, by: number) =>
    run(async () => {
      const ids = posts.map((p) => p.id);
      [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
      setPosts((await api.adminReorderInstagram(token, ids)).posts);
    });

  const remove = (p: InstagramPost) => run(async () => setPosts((await api.adminDeleteInstagram(token, p.id)).posts), 'حُذفت الصورة');

  return (
    <Card>
      <CardHeader>
        <CardTitle>من إنستغرام بريماتكس</CardTitle>
        <CardDescription>
          حتى 5 صور مربّعة تظهر في الصفحة الرئيسية، وكل صورة تفتح منشورها على إنستغرام. انسخ رابط المنشور من إنستغرام (مشاركة ← نسخ الرابط) ثم اختر صورته. لا تظهر الفقرة في الموقع وهي فارغة.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {!loading && posts.length === 0 && <p className="text-sm text-muted-foreground">لا صور بعد.</p>}

        {posts.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
            <img src={p.imageUrl} alt="" className="size-20 rounded-md object-cover" />
            <a href={p.link} target="_blank" rel="noopener noreferrer" dir="ltr" className="min-w-0 flex-1 truncate text-sm text-highlight underline">
              {p.link}
            </a>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label="للأمام">
                <ArrowUp className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" disabled={busy || i === posts.length - 1} onClick={() => void move(i, 1)} aria-label="للخلف">
                <ArrowDown className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" disabled={busy} onClick={() => void remove(p)} aria-label="حذف">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}

        {!loading && posts.length < max && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row">
            <Input dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.instagram.com/p/…" aria-label="رابط المنشور" />
            <Button disabled={busy || !link.trim()} onClick={() => input.current?.click()}>
              <ImagePlus className="size-4" />
              {busy ? 'جارٍ الرفع…' : 'اختر الصورة'}
            </Button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void add(e.target.files?.[0])} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
