import { useEffect, useState } from 'react';
import { MessageCircle, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { WhatsappSupportSettings } from '@/types';

interface WhatsAppSettingsPanelProps {
  token: string;
}

export function WhatsAppSettingsPanel({ token }: WhatsAppSettingsPanelProps) {
  const [settings, setSettings] = useState<WhatsappSupportSettings | null>(null);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .adminWhatsappSupportSettings(token)
      .then(({ whatsappSupport }) => {
        if (cancelled) return;
        setSettings(whatsappSupport);
        setPhone(whatsappSupport.phone ?? '');
        setMessage(whatsappSupport.message ?? '');
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
      const { whatsappSupport } = await api.adminSaveWhatsappSupport(token, phone.trim(), message);
      setSettings(whatsappSupport);
      setPhone(whatsappSupport.phone ?? '');
      setMessage(whatsappSupport.message ?? '');
      toast.success('حُفظ رقم واتساب — سيظهر زر الدعم المباشر في الصفحة الرئيسية');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      const { whatsappSupport } = await api.adminClearWhatsappSupport(token);
      setSettings(whatsappSupport);
      setPhone('');
      setMessage(whatsappSupport.message ?? '');
      toast.success('أُخفي زر واتساب');
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
              <MessageCircle className="size-5 text-accent" aria-hidden="true" />
              دعم واتساب المباشر
            </CardTitle>
            <CardDescription>
              أدخل رقم واتساب الخاص بالمتجر بالصيغة الدولية — يظهر زر عائم في الصفحة الرئيسية يفتح
              محادثة مباشرة مع العميل.
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
            <Label htmlFor="whatsapp-phone">رقم واتساب</Label>
            <Input
              id="whatsapp-phone"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+218911234567"
            />
            <p className="text-xs text-muted-foreground">
              بالصيغة الدولية مع رمز الدولة (مثال: 218 لليبيا)، بدون مسافات.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp-message">رسالة الترحيب</Label>
            <Textarea
              id="whatsapp-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="مرحباً، لدي استفسار بخصوص منتجات بريماتكس."
            />
            <p className="text-xs text-muted-foreground">
              تُملأ تلقائياً في محادثة واتساب عند ضغط العميل على الزر.
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
