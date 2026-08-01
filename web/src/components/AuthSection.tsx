import { useState } from 'react';
import { Heart, Package } from 'lucide-react';
import { toast } from 'sonner';

import { AddressBook } from '@/components/AddressBook';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Address, User } from '@/types';

interface AuthSectionProps {
  user: User | null;
  token: string | null;
  checking: boolean;
  onSignIn: (token: string, user: User) => void;
  onSignOut: () => void;
  onAddressesChange: (addresses: Address[]) => void;
  onGoToWishlist: () => void;
  onGoToOrders: () => void;
}

const MIN_PASSWORD = 6;

export function AuthSection({
  user,
  token,
  checking,
  onSignIn,
  onSignOut,
  onAddressesChange,
  onGoToWishlist,
  onGoToOrders,
}: AuthSectionProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState({ name: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'phone' | 'password', string>>>({});

  function update(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function switchMode() {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setErrors({});
  }

  async function submit() {
    const next: typeof errors = {};
    if (mode === 'register' && !fields.name.trim()) next.name = 'الاسم مطلوب';
    if (!fields.phone.trim()) next.phone = 'رقم الهاتف مطلوب';
    if (!fields.password) next.password = 'كلمة المرور مطلوبة';
    else if (mode === 'register' && fields.password.length < MIN_PASSWORD) {
      next.password = `كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل`;
    }

    setErrors(next);
    if (Object.keys(next).length) {
      toast.error(Object.values(next)[0]);
      return;
    }

    setSubmitting(true);
    try {
      const data =
        mode === 'register'
          ? await api.register(fields.name.trim(), fields.phone.trim(), fields.password)
          : await api.login(fields.phone.trim(), fields.password);

      onSignIn(data.token, data.user);
      setFields({ name: '', phone: '', password: '' });
      toast.success(mode === 'register' ? 'تم إنشاء الحساب بنجاح' : 'تم تسجيل الدخول');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر إتمام العملية');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <section className="container max-w-md animate-fade-up py-12">
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            جارٍ التحقق من الجلسة…
          </CardContent>
        </Card>
      </section>
    );
  }

  if (user) {
    return (
      <section className="container max-w-2xl animate-fade-up py-12">
        <Card>
          <CardHeader>
            <CardTitle>{user.name || 'مرحباً بك'}</CardTitle>
            <CardDescription className="tabular">
              رقم الهاتف: {user.phone ?? '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={onGoToOrders}>
                <Package aria-hidden="true" />
                طلباتي
              </Button>
              <Button variant="outline" onClick={onGoToWishlist}>
                <Heart aria-hidden="true" />
                المفضلة
                {user.wishlist && user.wishlist.length > 0 && (
                  <span className="tabular"> ({user.wishlist.length})</span>
                )}
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                onSignOut();
                toast.success('تم تسجيل الخروج');
              }}
            >
              تسجيل الخروج
            </Button>
          </CardContent>
        </Card>

        {token && (
          <AddressBook
            token={token}
            addresses={user.addresses ?? []}
            onChange={onAddressesChange}
          />
        )}
      </section>
    );
  }

  const isRegister = mode === 'register';

  return (
    <section className="container max-w-md animate-fade-up py-12">
      <Card>
        <CardHeader>
          <CardTitle>{isRegister ? 'إنشاء حساب' : 'تسجيل الدخول'}</CardTitle>
          <CardDescription>
            {isRegister ? 'يستغرق أقل من دقيقة.' : 'اختياري — لحفظ سجل طلباتك وعناوينك.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-name">الاسم الكامل</Label>
                <Input
                  id="auth-name"
                  value={fields.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="اسمك"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="auth-phone">رقم الهاتف</Label>
              <Input
                id="auth-phone"
                type="tel"
                value={fields.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="09xxxxxxxx"
                autoComplete="tel"
                aria-invalid={Boolean(errors.phone)}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-password">
                كلمة المرور
                {isRegister && (
                  <span className="ms-1 text-xs font-normal text-muted-foreground">
                    ({MIN_PASSWORD} أحرف على الأقل)
                  </span>
                )}
              </Label>
              <Input
                id="auth-password"
                type="password"
                value={fields.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="••••••••"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full" loading={submitting}>
              {isRegister ? 'تسجيل' : 'دخول'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Button type="button" variant="link" onClick={switchMode} className="h-auto px-1">
                {isRegister ? 'لديّ حساب بالفعل' : 'إنشاء حساب جديد'}
              </Button>
            </p>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
