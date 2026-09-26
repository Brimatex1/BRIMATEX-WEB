import { useEffect, useState } from 'react';
import { Factory } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { leadText } from '@/lib/preorder';
import type { PreorderSettings } from '@/types';

/**
 * Pre-orders (src/lib/preorder.js): with them on, a mattress out of stock in
 * Odoo can still be ordered on the website and in the app - the factory makes
 * it to order - and Meta's catalogue lists it as "available for order".
 */
export function PreorderSettingsPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState<PreorderSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .adminPreorderSettings(token)
      .then(({ preorder }) => {
        if (cancelled) return;
        setSettings(preorder);
        setEnabled(preorder.enabled);
        setDays(preorder.days ? String(preorder.days) : '');
      })
      .catch((err) => !cancelled && toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save(nextEnabled = enabled) {
    setSaving(true);
    try {
      const { preorder } = await api.adminSavePreorder(token, nextEnabled, days.trim());
      setSettings(preorder);
      setEnabled(preorder.enabled);
      setDays(preorder.days ? String(preorder.days) : '');
      toast.success(preorder.enabled ? 'الطلب المسبق مفعّل — المراتب النافدة تُطلب الآن' : 'أُوقف الطلب المسبق');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Factory className="size-5 text-accent" aria-hidden="true" />
              الطلب المسبق
            </CardTitle>
            <CardDescription>
              المرتبة النافدة في أودو تبقى قابلة للطلب في الموقع والتطبيق — المصنع يصنعها على الطلب. تظهر
              للزبون «طلب مسبق»، وفي كتالوج ميتا «متاحة للطلب» فتُعرض في الإعلانات.
            </CardDescription>
          </div>
          <Badge variant={settings.enabled ? 'success' : 'secondary'}>{settings.enabled ? 'مفعّل' : 'غير مفعّل'}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="preorder-days">مدة التجهيز (بالأيام)</Label>
            <Input
              id="preorder-days"
              inputMode="numeric"
              dir="ltr"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
              placeholder="7"
              className="max-w-40"
            />
            <p className="text-xs text-muted-foreground">
              يرى الزبون: «{leadText(days ? Number(days) : null)}». اتركها فارغة إن كانت المدة تختلف — يظهر «يُصنع على
              الطلب» بلا رقم.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {settings.enabled ? (
              <>
                <Button type="submit" loading={saving}>
                  حفظ المدة
                </Button>
                <Button type="button" variant="ghost" className="text-destructive" disabled={saving} onClick={() => void save(false)}>
                  إيقاف الطلب المسبق
                </Button>
              </>
            ) : (
              <Button type="button" loading={saving} onClick={() => void save(true)}>
                تفعيل الطلب المسبق
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
