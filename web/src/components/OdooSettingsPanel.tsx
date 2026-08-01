import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, RefreshCw, ShieldAlert, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { OdooSettings } from '@/types';

interface OdooSettingsPanelProps {
  token: string;
  /** Lets the dashboard reload products after a sync or a connection change. */
  onChanged: () => void;
}

export function OdooSettingsPanel({ token, onChanged }: OdooSettingsPanelProps) {
  const [settings, setSettings] = useState<OdooSettings | null>(null);
  const [form, setForm] = useState({ url: '', db: '', username: '', apiKey: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .adminOdooSettings(token)
      .then(({ odoo }) => {
        if (cancelled) return;
        setSettings(odoo);
        setForm({ url: odoo.url, db: odoo.db, username: odoo.username, apiKey: '' });
      })
      .catch((err) => !cancelled && toast.error(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    setSaving(true);
    setTestResult(null);
    try {
      const { odoo } = await api.adminSaveOdoo(token, form);
      setSettings(odoo);
      setForm((f) => ({ ...f, apiKey: '' }));
      toast.success('حُفظت الإعدادات');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.adminTestOdoo(token);
      const parts = [`المستخدم رقم ${r.uid}`];
      if (r.serverVersion) parts.push(`أودو ${r.serverVersion}`);
      if (typeof r.productCount === 'number') parts.push(`${r.productCount} منتج قابل للبيع`);
      setTestResult(parts.join(' · '));
      toast.success('الاتصال ناجح');
      const { odoo } = await api.adminOdooSettings(token);
      setSettings(odoo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'فشل الاتصال';
      setTestResult(message);
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.adminSync(token);
      toast.success(
        r.source === 'odoo'
          ? `تمت المزامنة — ${r.count} منتج من أودو`
          : `الوضع التجريبي — ${r.count} منتج من ملف المتجر`
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّرت المزامنة');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      const { odoo } = await api.adminClearOdoo(token);
      setSettings(odoo);
      setForm({ url: '', db: '', username: '', apiKey: '' });
      setTestResult(null);
      toast.success('فُصل أودو — عاد المتجر للوضع التجريبي');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الفصل');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">جارٍ تحميل الإعدادات…</p>;
  }

  const insecure =
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Link2 className="size-5 text-accent" aria-hidden="true" />
                ربط أودو
              </CardTitle>
              <CardDescription>
                عند الربط تُجلب المنتجات والأسعار والكميات من أودو بدل ملف المتجر.
              </CardDescription>
            </div>
            <Badge variant={settings?.configured ? 'success' : 'secondary'}>
              {settings?.configured ? 'مربوط' : 'غير مربوط'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {insecure && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <p>
                الموقع يعمل على <strong>http</strong> غير مشفّر. مفتاح أودو سيُرسل بنص واضح
                يمكن اعتراضه. فعّل https قبل إدخاله.
              </p>
            </div>
          )}

          {settings?.fromEnv && (
            <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
              الإعدادات الحالية من ملف البيئة. أي حفظ هنا سيتجاوزها.
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
              <Label htmlFor="odoo-url">عنوان الخادم</Label>
              <Input
                id="odoo-url"
                type="url"
                dir="ltr"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://mycompany.odoo.com"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="odoo-db">قاعدة البيانات</Label>
                <Input
                  id="odoo-db"
                  dir="ltr"
                  value={form.db}
                  onChange={(e) => setForm((f) => ({ ...f, db: e.target.value }))}
                  placeholder="mycompany"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="odoo-user">اسم المستخدم</Label>
                <Input
                  id="odoo-user"
                  dir="ltr"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="odoo-key">
                مفتاح API
                {settings?.hasApiKey && (
                  <span className="ms-2 text-xs font-normal text-muted-foreground">
                    (محفوظ — اتركه فارغاً للإبقاء عليه)
                  </span>
                )}
              </Label>
              <Input
                id="odoo-key"
                type="password"
                dir="ltr"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder={settings?.hasApiKey ? '••••••••••••' : 'المفتاح من إعدادات حسابك في أودو'}
              />
              <p className="text-xs text-muted-foreground">
                يُحفظ على الخادم ولا يُعاد عرضه هنا أبداً.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={saving}>
                حفظ
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void test()}
                disabled={testing || !settings?.configured}
              >
                {testing ? (
                  <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                اختبار الاتصال
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

          {testResult && (
            <p className="rounded-md border bg-muted/50 p-3 text-sm" dir="auto">
              {testResult}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">تحديث البيانات</CardTitle>
          <CardDescription>
            يمسح الذاكرة المؤقتة ويعيد جلب المنتجات فوراً بدل انتظار انتهاء صلاحيتها.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className={syncing ? 'motion-safe:animate-spin' : undefined} aria-hidden="true" />
            مزامنة الآن
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
