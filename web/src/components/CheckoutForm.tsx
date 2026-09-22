import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { trackingContext } from '@/lib/pixel';
import { discountLabel } from '@/components/app/perks';
import { cn, formatPrice, phoneIsValid } from '@/lib/utils';
import type { CartLine, Customer, OrderResult, User, Voucher } from '@/types';

type FieldKey = 'name' | 'phone' | 'city' | 'address';

interface CheckoutFormProps {
  lines: CartLine[];
  user: User | null;
  token: string | null;
  onSuccess: (result: OrderResult) => void;
  onCancel: () => void;
  /** The signed-in customer's usable vouchers - one can go on the order. */
  vouchers?: Voucher[];
}

/** What a voucher takes off - the server computes the same (src/lib/perks.js). */
function estimateDiscount(v: Voucher, subtotal: number): number {
  const amount = v.unit === '%' ? (subtotal * v.discount) / 100 : v.discount;
  return Math.round(Math.min(subtotal, amount) * 100) / 100;
}

export function CheckoutForm({ lines, user, token, onSuccess, onCancel, vouchers = [] }: CheckoutFormProps) {
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const chosen = vouchers.find((v) => v.code === voucherCode) ?? null;
  const discount = chosen ? estimateDiscount(chosen, subtotal) : 0;
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
    if (!form.phone.trim()) next.phone = 'رقم الهاتف مطلوب';
    else if (!phoneIsValid(form.phone.trim())) next.phone = 'رقم الهاتف غير صالح';
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
        token,
        trackingContext(),
        chosen?.code ?? null
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
                رقم الهاتف <span className="text-destructive">*</span>
              </Label>
              <Input
                {...fieldProps('phone')}
                type="tel"
                placeholder="09xxxxxxxx"
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
                placeholder="طرابلس"
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

          {/* Vouchers, as the app's checkout offers them: pick one, see the total */}
          {vouchers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">القسيمة</p>
              <div className="flex flex-wrap gap-2">
                {vouchers.map((v) => {
                  const on = v.code === voucherCode;
                  return (
                    <button
                      key={v.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setVoucherCode(on ? null : v.code)}
                      className={cn(
                        'rounded-full px-4 py-2.5 text-sm font-medium',
                        on ? 'bg-app-ocean text-white' : 'bg-app-tint-soft text-app-ocean'
                      )}
                    >
                      {v.title} · {discountLabel(v)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1 rounded-[14px] bg-app-input p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-app-muted">المجموع</span>
              <span className="tabular">{formatPrice(subtotal)} د.ل</span>
            </div>
            {chosen && (
              <div className="flex justify-between text-app-success">
                <span>{discountLabel(chosen)}</span>
                <span className="tabular">- {formatPrice(discount)} د.ل</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>الإجمالي</span>
              <span className="tabular">{formatPrice(subtotal - discount)} د.ل</span>
            </div>
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
