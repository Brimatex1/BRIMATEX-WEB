import { useEffect, useId, useState } from 'react';
import { CheckCircle2, MessageCircle, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useIsPhone } from '@/hooks/useIsPhone';
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
   * False hides the floating button - for pages that open the form from a
   * button of their own (lib/support.ts), or where a bar sits at the bottom.
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
  const isPhone = useIsPhone();
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
    <>
      {/* The floating button: an icon with its name on larger screens, the icon alone on a phone */}
      {launcher && !open && (
        <Button
          onClick={() => setOpen(true)}
          aria-label="تواصل مع خدمة العملاء"
          className={cn('fixed bottom-5 end-5 z-40 h-12 gap-2 rounded-full px-4 shadow-lg sm:px-5', className)}
        >
          <MessageCircle className="!size-5" aria-hidden="true" />
          <span className="hidden sm:inline">تواصل معنا</span>
        </Button>
      )}

      {/* The form: a drawer from the bottom on a phone, from the side on larger screens - as the cart */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isPhone ? 'bottom' : 'left'}
          className={cn('flex flex-col gap-0 p-0', isPhone ? 'max-h-[92svh] rounded-t-xl' : 'w-full sm:max-w-md')}
        >
          <SheetHeader className="border-b p-5 text-start">
            <SheetTitle className="flex items-center gap-2">
              <MessageCircle className="size-5 text-primary" aria-hidden="true" />
              خدمة عملاء بريماتكس
            </SheetTitle>
            <SheetDescription>اكتب لنا، ويتصل بك فريق خدمة العملاء في أقرب وقت.</SheetDescription>
          </SheetHeader>

          {ref ? (
            <div className="space-y-3 p-6 text-center" role="status">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10">
                <CheckCircle2 className="size-7 text-success" aria-hidden="true" />
              </span>
              <p className="font-semibold">وصلت رسالتك</p>
              <p className="text-sm text-muted-foreground">
                رقم تذكرتك <span className="font-semibold text-foreground" dir="ltr">#{ref}</span>. سيتصل بك فريق خدمة
                العملاء على الرقم الذي كتبته.
              </p>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={startOver}>
                  رسالة أخرى
                </Button>
                <Button type="button" className="flex-1" onClick={() => setOpen(false)}>
                  تم
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId('name')}>الاسم</Label>
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
                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId('phone')}>رقم الهاتف</Label>
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

                <div className="space-y-1.5">
                  <Label id={fieldId('topic-label')}>الموضوع</Label>
                  {/* Buttons rather than a dropdown: one tap each, all visible */}
                  <ToggleGroup
                    type="single"
                    dir="rtl"
                    value={fields.topic}
                    onValueChange={(v) => v && set('topic', v as SupportTopic)}
                    aria-labelledby={fieldId('topic-label')}
                    aria-describedby={show('topic') ? fieldId('topic-error') : undefined}
                    className="flex-wrap justify-start gap-2"
                  >
                    {TOPICS.map((t) => (
                      <ToggleGroupItem
                        key={t.value}
                        value={t.value}
                        className="h-9 rounded-md border px-3 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                      >
                        {t.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {show('topic') && (
                    <p id={fieldId('topic-error')} className="text-xs text-destructive">
                      {show('topic')}
                    </p>
                  )}
                </div>

                {fields.topic === 'order' && (
                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId('order')}>
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

                <div className="space-y-1.5">
                  <Label htmlFor={fieldId('message')}>رسالتك</Label>
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
              </div>

              <div className="border-t p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                <Button type="submit" size="lg" className="w-full" disabled={sending}>
                  <Send aria-hidden="true" />
                  {sending ? 'جارٍ الإرسال…' : 'إرسال إلى خدمة العملاء'}
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
