import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Address } from '@/types';

interface AddressBookProps {
  token: string;
  addresses: Address[];
  onChange: (addresses: Address[]) => void;
}

export function AddressBook({ token, addresses, onChange }: AddressBookProps) {
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [fields, setFields] = useState({ city: '', address: '' });
  const [errors, setErrors] = useState<Partial<Record<'city' | 'address', string>>>({});

  function update(key: 'city' | 'address', value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function submit() {
    const next: typeof errors = {};
    if (!fields.city.trim()) next.city = 'المدينة مطلوبة';
    if (!fields.address.trim()) next.address = 'العنوان مطلوب';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const data = await api.addAddress(token, fields.address.trim(), fields.city.trim());
      onChange([...addresses, data.address]);
      setFields({ city: '', address: '' });
      setAdding(false);
      toast.success('تم حفظ العنوان');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ العنوان');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    try {
      await api.removeAddress(token, id);
      onChange(addresses.filter((a) => a.id !== id));
      toast.success('تم حذف العنوان');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف العنوان');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MapPin className="size-5 text-accent" aria-hidden="true" />
          دفتر العناوين
        </CardTitle>
        <CardDescription>
          احفظ عناوينك لتختارها مباشرة عند إتمام الطلب.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {addresses.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">لم تحفظ أي عنوان بعد.</p>
        )}

        {addresses.length > 0 && (
          <ul className="divide-y rounded-md border">
            {addresses.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.city}</p>
                  <p className="truncate text-sm text-muted-foreground">{a.address}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void remove(a.id)}
                  disabled={removing === a.id}
                  aria-label={`حذف عنوان ${a.city}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form
            className="space-y-3 rounded-md border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="addr-city">المدينة</Label>
              <Input
                id="addr-city"
                value={fields.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="طرابلس"
                autoComplete="address-level2"
                aria-invalid={Boolean(errors.city)}
              />
              {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="addr-address">العنوان بالتفصيل</Label>
              <Input
                id="addr-address"
                value={fields.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="الحي، الشارع، رقم المبنى"
                autoComplete="street-address"
                aria-invalid={Boolean(errors.address)}
              />
              {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" loading={submitting}>
                حفظ
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setAdding(false);
                  setErrors({});
                }}
              >
                إلغاء
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            إضافة عنوان
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
