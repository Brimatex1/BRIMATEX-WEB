import { useEffect, useState } from 'react';
import { Facebook, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { ConversionsApiStatus, FacebookPixelSettings } from '@/types';

interface FacebookPixelSettingsPanelProps {
  token: string;
}

export function FacebookPixelSettingsPanel({ token }: FacebookPixelSettingsPanelProps) {
  const [settings, setSettings] = useState<FacebookPixelSettings | null>(null);
  const [pixelId, setPixelId] = useState('');
  const [rate, setRate] = useState('');
  const [capi, setCapi] = useState<ConversionsApiStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .adminFacebookPixelSettings(token)
      .then(({ facebookPixel, conversionsApi }) => {
        if (cancelled) return;
        setSettings(facebookPixel);
        setCapi(conversionsApi);
        setPixelId(facebookPixel.pixelId ?? '');
        setRate(facebookPixel.lydPerUsd ? String(facebookPixel.lydPerUsd) : '');
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
      const { facebookPixel } = await api.adminSaveFacebookPixel(token, pixelId.trim(), rate.trim());
      setSettings(facebookPixel);
      setPixelId(facebookPixel.pixelId ?? '');
      setRate(facebookPixel.lydPerUsd ? String(facebookPixel.lydPerUsd) : '');
      toast.success('حُفظ رقم البكسل — سيعمل على كل الصفحات والمنتجات تلقائياً');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const result = await api.adminTestConversionsApi(token);
      if (result.ok) toast.success(`الاتصال بميتا سليم — «${result.datasetName ?? result.datasetId}»`);
      else toast.error(`ميتا رفضت: ${result.error}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الاختبار');
    } finally {
      setTesting(false);
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

          <div className="space-y-1.5">
            <Label htmlFor="fb-lyd-rate">سعر الصرف لإعلانات ميتا (دينار لكل دولار)</Label>
            <Input
              id="fb-lyd-rate"
              inputMode="decimal"
              dir="ltr"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="4.85"
            />
            <p className="text-xs text-muted-foreground">
              ميتا لا تقبل الدينار الليبي، فتُرسَل قيم المشتريات إليها بالدولار بهذا السعر. الزبون
              لا يرى الدولار أبداً — الأسعار في الموقع تبقى بالدينار. اتركه فارغاً لإرسالها بالدينار.
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

        <div className="space-y-1.5 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Conversions API (من الخادم)</p>
            <Badge variant={capi?.configured ? 'success' : 'secondary'}>
              {capi?.configured ? (capi.testMode ? 'وضع الاختبار' : 'مفعّل') : 'غير مفعّل'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            يرسل كل عملية شراء من الموقع إلى ميتا من الخادم مباشرة — لا يحجبها مانع الإعلانات ولا
            قيود آيفون. يُفعَّل بوضع مفتاح FACEBOOK_CAPI_TOKEN في ملف .env على الخادم.
          </p>
          {capi?.lastResult && (
            <p className={capi.lastResult.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
              آخر إرسال ({new Date(capi.lastResult.at).toLocaleString('ar-LY')}):{' '}
              {capi.lastResult.ok ? 'وصل إلى ميتا' : `رُفض — ${capi.lastResult.error}`}
            </p>
          )}
          {capi?.configured && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={testing}
              onClick={() => void testConnection()}
            >
              اختبار الاتصال بميتا
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
