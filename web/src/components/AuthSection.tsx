import { useState } from 'react';
import { Heart, Package, Star, Ticket } from 'lucide-react';
import { toast } from 'sonner';

import { AddressBook } from '@/components/AddressBook';
import { OtpCodeStep } from '@/components/OtpCodeStep';
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
  onGoToVouchers: () => void;
  onGoToPoints: () => void;
  /** Null until loyalty has loaded. */
  pointsBalance: number | null;
}

const MIN_PASSWORD = 6;

/** Returned by run() when a server call failed and its error was already shown. */
const FAILED = Symbol('failed');

/**
 * The signed-out card walks one of three paths:
 *   sign in:   login
 *   sign up:   register -> signup-code (WhatsApp code) -> signed in
 *   recovery:  recover-phone -> recover-code -> recover-password -> signed in
 */
type Step =
  | { kind: 'login' }
  | { kind: 'register' }
  | { kind: 'signup-code'; phone: string }
  | { kind: 'recover-phone' }
  | { kind: 'recover-code'; phone: string }
  | { kind: 'recover-password'; resetToken: string };

const STEP_COPY: Record<Step['kind'], { title: string; description: string }> = {
  login: { title: 'تسجيل الدخول', description: 'اختياري — لحفظ سجل طلباتك وعناوينك.' },
  register: { title: 'إنشاء حساب', description: 'يستغرق أقل من دقيقة.' },
  'signup-code': {
    title: 'تأكيد رقم الهاتف',
    description: 'أرسلنا رمزاً من 6 أرقام على واتساب — أدخله لإكمال إنشاء الحساب.',
  },
  'recover-phone': {
    title: 'استعادة الحساب',
    description: 'أدخل رقم هاتفك المسجّل، وسنرسل لك رمزاً على واتساب.',
  },
  'recover-code': {
    title: 'أدخل الرمز',
    description: 'إن كان الرقم مسجّلاً فسيصلك رمز من 6 أرقام على واتساب خلال لحظات.',
  },
  'recover-password': {
    title: 'كلمة مرور جديدة',
    description: 'اختر كلمة مرور جديدة — ستُسجَّل خروجك من الأجهزة الأخرى.',
  },
};

export function AuthSection({
  user,
  token,
  checking,
  onSignIn,
  onSignOut,
  onAddressesChange,
  onGoToWishlist,
  onGoToOrders,
  onGoToVouchers,
  onGoToPoints,
  pointsBalance,
}: AuthSectionProps) {
  const [step, setStep] = useState<Step>({ kind: 'login' });
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

  function go(next: Step) {
    setStep(next);
    setErrors({});
  }

  /**
   * Runs one server call with the shared spinner and error toast.
   * Resolves to the call's result, or FAILED once the error has been shown.
   */
  async function run<T>(action: () => Promise<T>): Promise<T | typeof FAILED> {
    setSubmitting(true);
    try {
      return await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر إتمام العملية');
      return FAILED;
    } finally {
      setSubmitting(false);
    }
  }

  function signedIn(data: { token: string; user: User }, message: string) {
    onSignIn(data.token, data.user);
    setFields({ name: '', phone: '', password: '' });
    setStep({ kind: 'login' });
    toast.success(message);
  }

  /** Field checks for the form-shaped steps; toasts the first problem. */
  function validate(need: { name?: boolean; phone?: boolean; password?: 'any' | 'new' }) {
    const next: typeof errors = {};
    if (need.name && !fields.name.trim()) next.name = 'الاسم مطلوب';
    if (need.phone && !fields.phone.trim()) next.phone = 'رقم الهاتف مطلوب';
    if (need.password && !fields.password) next.password = 'كلمة المرور مطلوبة';
    else if (need.password === 'new' && fields.password.length < MIN_PASSWORD) {
      next.password = `كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل`;
    }
    setErrors(next);
    const first = Object.values(next)[0];
    if (first) toast.error(first);
    return !first;
  }

  async function submitForm() {
    const phone = fields.phone.trim();

    if (step.kind === 'login') {
      if (!validate({ phone: true, password: 'any' })) return;
      const data = await run(() => api.login(phone, fields.password));
      if (data !== FAILED) signedIn(data, 'تم تسجيل الدخول');
    } else if (step.kind === 'register') {
      if (!validate({ name: true, phone: true, password: 'new' })) return;
      if ((await run(() => api.requestSignupOtp(phone))) !== FAILED) {
        setStep({ kind: 'signup-code', phone });
      }
    } else if (step.kind === 'recover-phone') {
      if (!validate({ phone: true })) return;
      if ((await run(() => api.requestPasswordOtp(phone))) !== FAILED) {
        setStep({ kind: 'recover-code', phone });
      }
    } else if (step.kind === 'recover-password') {
      if (!validate({ password: 'new' })) return;
      const data = await run(() => api.resetPassword(step.resetToken, fields.password));
      if (data !== FAILED) signedIn(data, 'تم تغيير كلمة المرور');
      // The token is single-use and burned even when the change fails.
      else go({ kind: 'recover-phone' });
    }
  }

  async function verifyCode(code: string) {
    if (step.kind === 'signup-code') {
      const verified = await run(() => api.verifySignupOtp(step.phone, code));
      if (verified === FAILED) return;
      const data = await run(() =>
        api.registerVerified(fields.name.trim(), fields.password, verified.signupToken)
      );
      if (data !== FAILED) signedIn(data, 'تم إنشاء الحساب بنجاح');
      // The token was spent on the failed attempt - start the sign-up again.
      else go({ kind: 'register' });
    } else if (step.kind === 'recover-code') {
      const verified = await run(() => api.verifyPasswordOtp(step.phone, code));
      if (verified === FAILED) return;
      setFields((prev) => ({ ...prev, password: '' }));
      go({ kind: 'recover-password', resetToken: verified.resetToken });
    }
  }

  /** Rejects on failure so OtpCodeStep keeps its resend button available. */
  async function resendCode(phone: string) {
    const request = step.kind === 'signup-code' ? api.requestSignupOtp : api.requestPasswordOtp;
    if ((await run(() => request(phone))) === FAILED) throw new Error('resend failed');
    toast.success('أُرسل رمز جديد على واتساب');
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
              <Button variant="outline" onClick={onGoToVouchers}>
                <Ticket aria-hidden="true" />
                القسائم
              </Button>
              <Button variant="outline" onClick={onGoToPoints}>
                <Star aria-hidden="true" />
                نقاطي
                {pointsBalance !== null && <span className="tabular"> ({pointsBalance})</span>}
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

  const copy = STEP_COPY[step.kind];
  const isRegister = step.kind === 'register';
  const newPassword = isRegister || step.kind === 'recover-password';
  const showName = isRegister;
  const showPhone = step.kind === 'login' || isRegister || step.kind === 'recover-phone';
  const showPassword = step.kind === 'login' || newPassword;

  return (
    <section className="container max-w-md animate-fade-up py-12">
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>

        <CardContent>
          {step.kind === 'signup-code' || step.kind === 'recover-code' ? (
            <OtpCodeStep
              // A fresh step (and countdown) for every phone number.
              key={`${step.kind}:${step.phone}`}
              phone={step.phone}
              submitting={submitting}
              submitLabel={step.kind === 'signup-code' ? 'تأكيد وإنشاء الحساب' : 'تحقّق'}
              onVerify={(code) => void verifyCode(code)}
              onResend={() => resendCode(step.phone)}
              onBack={() => go({ kind: step.kind === 'signup-code' ? 'register' : 'recover-phone' })}
            />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitForm();
              }}
            >
              {showName && (
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

              {showPhone && (
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
                  {isRegister && (
                    <p className="text-xs text-muted-foreground">
                      سنرسل رمز تأكيد إلى هذا الرقم على واتساب.
                    </p>
                  )}
                </div>
              )}

              {showPassword && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-password">
                      {step.kind === 'recover-password' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}
                      {newPassword && (
                        <span className="ms-1 text-xs font-normal text-muted-foreground">
                          ({MIN_PASSWORD} أحرف على الأقل)
                        </span>
                      )}
                    </Label>
                    {step.kind === 'login' && (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => go({ kind: 'recover-phone' })}
                        className="h-auto px-0 text-xs"
                      >
                        نسيت كلمة المرور؟
                      </Button>
                    )}
                  </div>
                  <Input
                    id="auth-password"
                    type="password"
                    value={fields.password}
                    onChange={(e) => update('password', e.target.value)}
                    placeholder="••••••••"
                    autoComplete={newPassword ? 'new-password' : 'current-password'}
                    aria-invalid={Boolean(errors.password)}
                  />
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
              )}

              <Button type="submit" className="w-full" loading={submitting}>
                {step.kind === 'login'
                  ? 'دخول'
                  : step.kind === 'register'
                    ? 'متابعة'
                    : step.kind === 'recover-phone'
                      ? 'أرسل الرمز'
                      : 'حفظ وتسجيل الدخول'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => go({ kind: step.kind === 'login' ? 'register' : 'login' })}
                  className="h-auto px-1"
                >
                  {step.kind === 'login' ? 'إنشاء حساب جديد' : 'لديّ حساب بالفعل'}
                </Button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
