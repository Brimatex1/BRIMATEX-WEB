import { useEffect, useId, useState } from 'react';
import { CheckCircle2, Headset, Send, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { onOpenSupport } from '@/lib/support';
import { trackContact } from '@/lib/pixel';
import { cn, phoneIsValid } from '@/lib/utils';
import type { SupportTopic, User } from '@/types';

const TOPICS: { value: SupportTopic; label: string }[] = [
  { value: 'product', label: 'استفسار عن منتج' },
  { value: 'order', label: 'متابعة طلب' },
  { value: 'warranty', label: 'ضمان' },
  { value: 'complaint', label: 'شكوى' },
  { value: 'other', label: 'استفسار عام' },
];

interface SupportWidgetProps {
  user: User | null;
  token: string | null;
  className?: string;
  /**
   * False hides the round launcher while the window is closed - for pages
   * that open it from a button of their own (lib/support.ts).
   */
  launcher?: boolean;
}

type Fields = { name: string; phone: string; topic: SupportTopic | ''; orderName: string; message: string };

/**
 * Customer care, in the page. Replaces the WhatsApp hand-off: the message
 * becomes a ticket in Odoo Helpdesk (team Customer Care), where the team
 * already works, instead of a chat on someone's personal phone.
 *
 * Odoo's own embeddable ticket form needs its Website apps, which this Odoo
 * does not have — so the form lives here and the store server files the ticket.
 */
export function SupportWidget({ user, token, className, launcher = true }: SupportWidgetProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Fields>({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    topic: '',
    orderName: '',
    message: '',
  });
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  // A visitor who signs in after the page loaded shouldn't retype what we know.
  useEffect(() => {
    if (!user) return;
    setFields((f) => ({ ...f, name: f.name || user.name, phone: f.phone || user.phone || '' }));
  }, [user]);

  // Opened from elsewhere on the page (lib/support.ts), possibly with the
  // product the customer is asking about already written in.
  useEffect(
    () =>
      onOpenSupport(({ message }) => {
        if (message) setFields((f) => ({ ...f, message: f.message || message }));
        setOpen(true);
      }),
    []
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const errors = {
    name: fields.name.trim() ? null : 'الاسم مطلوب',
    phone: !fields.phone.trim() ? 'رقم الهاتف مطلوب' : phoneIsValid(fields.phone.trim()) ? null : 'رقم الهاتف غير صالح',
    topic: fields.topic ? null : 'اختر موضوع الرسالة',
    message: fields.message.trim().length >= 10 ? null : 'اكتب رسالتك في 10 أحرف على الأقل',
  };
  const valid = !errors.name && !errors.phone && !errors.topic && !errors.message;
  const show = (key: keyof typeof errors) => (touched ? errors[key] : null);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid || !fields.topic) return;

    setSending(true);
    try {
      const result = await api.createSupportTicket(
        {
          name: fields.name.trim(),
          phone: fields.phone.trim(),
          email: user?.email || undefined,
          topic: fields.topic,
          orderName: fields.topic === 'order' ? fields.orderName.trim() || undefined : undefined,
          message: fields.message.trim(),
        },
        token
      );
      setRef(result.ref);
      trackContact();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إرسال رسالتك الآن. حاول بعد قليل.');
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    setRef(null);
    setTouched(false);
    setFields((f) => ({ ...f, topic: '', orderName: '', message: '' }));
  }

  const fieldId = (key: string) => `${id}-${key}`;

  return (
    <div className={cn('fixed bottom-5 end-5 z-40 flex flex-col items-end gap-3', className)}>
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={fieldId('title')}
          className="w-[22rem] max-w-[calc(100vw-2.5rem)] animate-fade-up overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Headset className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p id={fieldId('title')} className="text-sm font-semibold">
                  خدمة عملاء بريماتكس
                </p>
                <p className="text-xs text-primary-foreground/75">نومك يهمّنا، وسنتصل بك في أقرب وقت</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-primary-foreground/80 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {ref ? (
            <div className="space-y-3 p-5 text-center" role="status">
              <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden="true" />
              <p className="font-semibold">وصلت رسالتك</p>
              <p className="text-sm text-muted-foreground">
                رقم تذكرتك <span className="font-semibold text-foreground" dir="ltr">#{ref}</span>. سيتصل بك فريق خدمة
                العملاء على الرقم الذي كتبته.
              </p>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={startOver}>
                  رسالة أخرى
                </Button>
                <Button type="button" className="flex-1" onClick={() => setOpen(false)}>
                  تم
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={fieldId('name')} className="text-xs">
                    الاسم
                  </Label>
                  <Input
                    id={fieldId('name')}
                    value={fields.name}
                    onChange={(e) => set('name', e.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(show('name'))}
                    aria-describedby={show('name') ? fieldId('name-error') : undefined}
                  />
                  {show('name') && (
                    <p id={fieldId('name-error')} className="text-xs text-destructive">
                      {show('name')}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={fieldId('phone')} className="text-xs">
                    رقم الهاتف
                  </Label>
                  <Input
                    id={fieldId('phone')}
                    type="tel"
                    dir="ltr"
                    placeholder="09xxxxxxxx"
                    value={fields.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    autoComplete="tel"
                    aria-invalid={Boolean(show('phone'))}
                    aria-describedby={show('phone') ? fieldId('phone-error') : undefined}
                  />
                  {show('phone') && (
                    <p id={fieldId('phone-error')} className="text-xs text-destructive">
                      {show('phone')}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={fieldId('topic')} className="text-xs">
                  الموضوع
                </Label>
                <Select value={fields.topic} onValueChange={(v) => set('topic', v as SupportTopic)}>
                  <SelectTrigger
                    id={fieldId('topic')}
                    aria-invalid={Boolean(show('topic'))}
                    aria-describedby={show('topic') ? fieldId('topic-error') : undefined}
                  >
                    <SelectValue placeholder="اختر الموضوع" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOPICS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {show('topic') && (
                  <p id={fieldId('topic-error')} className="text-xs text-destructive">
                    {show('topic')}
                  </p>
                )}
              </div>

              {fields.topic === 'order' && (
                <div className="space-y-1">
                  <Label htmlFor={fieldId('order')} className="text-xs">
                    رقم الطلب <span className="font-normal text-muted-foreground">(إن وُجد)</span>
                  </Label>
                  <Input
                    id={fieldId('order')}
                    dir="ltr"
                    placeholder="S00123"
                    value={fields.orderName}
                    onChange={(e) => set('orderName', e.target.value)}
                    maxLength={40}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor={fieldId('message')} className="text-xs">
                  رسالتك
                </Label>
                <Textarea
                  id={fieldId('message')}
                  rows={4}
                  maxLength={2000}
                  placeholder="اكتب ما تحتاجه وسنعود إليك"
                  value={fields.message}
                  onChange={(e) => set('message', e.target.value)}
                  aria-invalid={Boolean(show('message'))}
                  aria-describedby={show('message') ? fieldId('message-error') : undefined}
                />
                {show('message') && (
                  <p id={fieldId('message-error')} className="text-xs text-destructive">
                    {show('message')}
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={sending}>
                <Send className="size-4" aria-hidden="true" />
                {sending ? 'جارٍ الإرسال…' : 'إرسال إلى خدمة العملاء'}
              </Button>
            </form>
          )}
        </div>
      )}

      {(launcher || open) && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'إغلاق خدمة العملاء' : 'تواصل مع خدمة العملاء'}
        aria-expanded={open}
        className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? <X className="size-6" aria-hidden="true" /> : <Headset className="size-7" aria-hidden="true" />}
      </button>
      )}
    </div>
  );
}
