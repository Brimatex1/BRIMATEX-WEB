import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { CartLine, Customer, OrderResult, User } from '@/types';

type FieldKey = 'name' | 'phone' | 'city' | 'address';

interface CheckoutFormProps {
  lines: CartLine[];
  user: User | null;
  token: string | null;
  onSuccess: (result: OrderResult) => void;
  onCancel: () => void;
}

/** Requires at least 9 digits — a string of separators alone must not pass. */
const PHONE_RE = /^\+?[\d\s-]{9,17}$/;
const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 15;

function phoneIsValid(phone: string): boolean {
  if (!PHONE_RE.test(phone)) return false;
  const digits = phone.replace(/\D/g, '').length;
  return digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS;
}

export function CheckoutForm({ lines, user, token, onSuccess, onCancel }: CheckoutFormProps) {
  const [form, setForm] = useState<Customer & { note: string }>({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    city: '',
    address: '',
    email: '',
    note: '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const savedAddresses = user?.addresses ?? [];

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in errors) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as FieldKey];
        return next;
      });
    }
  }

  function validate(): boolean {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!form.name.trim()) next.name = 'الاسم مطلوب';
    if (!form.phone.trim()) next.phone = 'رقم الجوال مطلوب';
    else if (!phoneIsValid(form.phone.trim())) next.phone = 'رقم الجوال غير صالح';
    if (!form.city.trim()) next.city = 'المدينة مطلوبة';
    if (!form.address.trim()) next.address = 'العنوان مطلوب';

    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0] as FieldKey;
      document.getElementById(`co-${first}`)?.focus();
      toast.error('يرجى تعبئة الحقول المطلوبة');
      return false;
    }
    return true;
  }

  async function submit() {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await api.createOrder(
        {
          name: form.name.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          address: form.address.trim(),
          email: form.email?.trim() || undefined,
        },
        lines,
        form.note.trim(),
        token
      );
      onSuccess(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر إتمام الطلب');
    } finally {
      setSubmitting(false);
    }
  }

  const fieldProps = (key: FieldKey) => ({
    id: `co-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(key, e.target.value),
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `co-${key}-error` : undefined,
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>بيانات التوصيل</CardTitle>
        <CardDescription>لا حاجة لإنشاء حساب — أدخل بياناتك وسنتواصل معك.</CardDescription>
      </CardHeader>

      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {savedAddresses.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">العناوين المحفوظة</p>
              <div className="flex flex-wrap gap-2">
                {savedAddresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, city: a.city, address: a.address }));
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.city;
                        delete next.address;
                        return next;
                      });
                    }}
                    className="min-h-9 rounded-full border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {a.city} — {a.address}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="co-name">
                الاسم الكامل <span className="text-destructive">*</span>
              </Label>
              <Input {...fieldProps('name')} placeholder="اسمك" autoComplete="name" />
              {errors.name && (
                <p id="co-name-error" className="text-xs text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="co-phone">
                رقم الجوال <span className="text-destructive">*</span>
              </Label>
              <Input
                {...fieldProps('phone')}
                type="tel"
                placeholder="05xxxxxxxx"
                autoComplete="tel"
              />
              {errors.phone && (
                <p id="co-phone-error" className="text-xs text-destructive">
                  {errors.phone}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="co-city">
                المدينة <span className="text-destructive">*</span>
              </Label>
              <Input
                {...fieldProps('city')}
                placeholder="الرياض"
                autoComplete="address-level2"
              />
              {errors.city && (
                <p id="co-city-error" className="text-xs text-destructive">
                  {errors.city}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="co-email">
                البريد الإلكتروني{' '}
                <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
              </Label>
              <Input
                id="co-email"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co-address">
              العنوان بالتفصيل <span className="text-destructive">*</span>
            </Label>
            <Input
              {...fieldProps('address')}
              placeholder="الحي، الشارع، رقم المبنى"
              autoComplete="street-address"
            />
            {errors.address && (
              <p id="co-address-error" className="text-xs text-destructive">
                {errors.address}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co-note">
              ملاحظات <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
            </Label>
            <Textarea
              id="co-note"
              rows={2}
              value={form.note}
              onChange={(e) => update('note', e.target.value)}
              placeholder="مثال: التوصيل مساءً"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="flex-1" loading={submitting}>
              {submitting ? 'جارٍ الإرسال…' : 'تأكيد الطلب'}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              رجوع
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            بالضغط على تأكيد الطلب فأنت توافق على الدفع عند الاستلام.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
