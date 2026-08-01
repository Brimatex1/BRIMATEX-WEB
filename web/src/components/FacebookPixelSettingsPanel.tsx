import { useEffect, useState } from 'react';
import { Facebook, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { FacebookPixelSettings } from '@/types';

interface FacebookPixelSettingsPanelProps {
  token: string;
}

export function FacebookPixelSettingsPanel({ token }: FacebookPixelSettingsPanelProps) {
  const [settings, setSettings] = useState<FacebookPixelSettings | null>(null);
  const [pixelId, setPixelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .adminFacebookPixelSettings(token)
      .then(({ facebookPixel }) => {
        if (cancelled) return;
        setSettings(facebookPixel);
        setPixelId(facebookPixel.pixelId ?? '');
      })
      .catch((err) => !cancelled && toast.error(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    setSaving(true);
    try {
      const { facebookPixel } = await api.adminSaveFacebookPixel(token, pixelId.trim());
      setSettings(facebookPixel);
      setPixelId(facebookPixel.pixelId ?? '');
      toast.success('حُفظ رقم البكسل — سيعمل على كل الصفحات والمنتجات تلقائياً');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
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
      toast.success('فُصل بكسل فيسبوك');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الفصل');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">جارٍ تحميل الإعدادات…</p>;
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Facebook className="size-5 text-accent" aria-hidden="true" />
              بكسل فيسبوك
            </CardTitle>
            <CardDescription>
              أدخل رقم الـ Pixel ID فقط — يُطبَّق تلقائياً على كل الصفحات وكل المنتجات، الحالية
              والتي ستُضاف لاحقاً، بلا أي كود إضافي.
            </CardDescription>
          </div>
          <Badge variant={settings?.configured ? 'success' : 'secondary'}>
            {settings?.configured ? 'مفعّل' : 'غير مفعّل'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {settings?.fromEnv && (
          <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
            القيمة الحالية من ملف البيئة. أي حفظ هنا سيتجاوزها.
          </p>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="fb-pixel-id">رقم الـ Pixel ID</Label>
            <Input
              id="fb-pixel-id"
              inputMode="numeric"
              dir="ltr"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="123456789012345"
            />
            <p className="text-xs text-muted-foreground">
              تجده في Meta Events Manager. أرقام فقط — لصق كود كامل غير مطلوب ولن يُقبل.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={saving}>
              حفظ
            </Button>
            {settings?.configured && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => void disconnect()}
                disabled={saving}
              >
                <Unlink aria-hidden="true" />
                فصل
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
