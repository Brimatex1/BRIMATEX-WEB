import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, LockKeyhole } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { cn, toLatinDigits } from '@/lib/utils';

import { Link } from './router';
import { useShop } from './state';

const CODE_LENGTH = 6;

/** A Libyan mobile: 10 digits starting 09. */
export function isLibyanMobile(phone: string): boolean {
  return /^09\d{8}$/.test(phone);
}

const TITLE = {
  checkout: 'سجّل الدخول لإتمام الطلب',
  favorites: 'سجّل الدخول لتبقى المفضّلة معك',
  account: 'تسجيل الدخول',
} as const;

/**
 * تسجيل الدخول (handoff WebLogin): a drawer from the left over the dimmed
 * page - the number, the six digits sent on WhatsApp with a resend countdown,
 * and a name the first time. A wrong code shakes the boxes once. Signed in,
 * the action that opened it carries on (checkout, a favourite).
 */
export function LoginDrawer() {
  const shop = useShop();
  const { open, reason } = shop.loginDrawer;
  const [step, setStep] = useState<'phone' | 'code' | 'name'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [shake, setShake] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  // Every opening starts at the number.
  useEffect(() => {
    if (!open) return;
    setStep('phone');
    setCode('');
    setName('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!isLibyanMobile(phone)) {
      setError('رقم الهاتف يتكوّن من 10 أرقام ويبدأ بـ 09.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.requestPhoneCode(phone);
      setResendIn(r.resendIn);
      setStep('code');
      setCode('');
      window.setTimeout(() => codeInput.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال الرمز');
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.verifyPhoneCode(phone, value);
      if ('needsName' in r) {
        setSignupToken(r.signupToken);
        setStep('name');
      } else {
        shop.auth.signIn(r.token, r.user);
        shop.closeLogin(true);
      }
    } catch (err) {
      setShake((n) => n + 1);
      setError(err instanceof Error ? err.message : 'الرمز غير صحيح.');
      setCode('');
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('اكتب اسمك');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.completePhoneSignup(signupToken, name.trim());
      shop.auth.signIn(r.token, r.user);
      shop.closeLogin(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إنشاء الحساب');
    } finally {
      setBusy(false);
    }
  }

  const minutes = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;
  const fieldClass = (bad: boolean) => cn('h-[52px] w-full rounded-lg border bg-background px-4 text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-ring', bad ? 'border-destructive' : 'border-input');

  return (
    <Sheet open={open} onOpenChange={(o) => !o && shop.closeLogin(false)}>
      <SheetContent side="left" className="flex w-full flex-col gap-5 p-6 pt-14 sm:max-w-[520px] sm:p-10 sm:pt-16">
        <span className="grid size-12 place-items-center rounded-full bg-image-bg text-brand-text" aria-hidden>
          <LockKeyhole className="size-6" strokeWidth={1.8} />
        </span>
        <SheetTitle className="font-display text-2xl font-bold sm:text-[28px]">{step === 'name' ? 'مرحباً بك' : TITLE[reason]}</SheetTitle>
        <SheetDescription className="text-[15px] leading-relaxed text-muted-foreground">
          {step === 'name' ? 'ما اسمك؟ نستخدمه على طلباتك وفاتورتك.' : 'التصفّح والإضافة إلى السلة والمفضّلة متاحة دون حساب. نطلب الدخول لإتمام الطلب فقط.'}
        </SheetDescription>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <b className="text-[15px]">رقم واتساب</b>
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 10));
                  setError(null);
                }}
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                placeholder="09X XXX XXXX"
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                className={cn(fieldClass(Boolean(error)), 'text-start tabular-nums placeholder:text-text-tertiary')}
              />
            </label>
            <span className="text-[13px] text-muted-foreground">اكتب رقماً عليه واتساب، فالرمز يوصلك هناك. نستعمله للدخول والتواصل بخصوص طلباتك فقط.</span>
            {error ? <ErrorLine text={error} /> : null}
            <Button type="submit" size="store" loading={busy}>
              أرسل الرمز
            </Button>
          </form>
        ) : null}

        {step === 'code' ? (
          <div className="flex animate-step-in flex-col gap-4">
            <div className="flex flex-col gap-2">
              <b className="text-[15px]">رقم واتساب</b>
              <div className="flex items-center justify-between rounded-lg bg-image-bg px-4 py-3">
                <bdi dir="ltr" className="tabular-nums">
                  {phone.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3')}
                </bdi>
                <button type="button" className="text-sm font-bold text-brand-text underline underline-offset-4" onClick={() => setStep('phone')}>
                  تغيير
                </button>
              </div>
            </div>
            <b className="text-[15px]">رمز التحقق</b>
            <span className="-mt-2 text-sm text-muted-foreground">أرسلنا رمزاً من 6 أرقام على واتساب إلى رقمك.</span>
            {/* One real input under six boxes: paste, autofill and the keyboard all work. */}
            <div className="relative" dir="ltr" onClick={() => codeInput.current?.focus()}>
              {/* The boxes shake (a new key replays it); the input under them stays, focused. */}
              <div key={shake} className={cn('grid grid-cols-6 gap-2', shake > 0 && 'animate-shake motion-reduce:animate-none')} aria-hidden>
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'grid h-[60px] place-items-center rounded-lg border bg-background text-2xl font-bold tabular-nums',
                      error ? 'border-destructive' : i === code.length ? 'border-2 border-foreground' : 'border-input'
                    )}
                  >
                    {code[i] ?? ''}
                  </span>
                ))}
              </div>
              <input
                ref={codeInput}
                value={code}
                onChange={(e) => {
                  const v = toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, CODE_LENGTH);
                  setCode(v);
                  setError(null);
                  if (v.length === CODE_LENGTH) void verify(v);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                aria-label={`رمز التحقق، ${code.length} من 6 أرقام`}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                className="absolute inset-0 opacity-0"
              />
            </div>
            {error ? <ErrorLine text={error} /> : null}
            <button type="button" disabled={resendIn > 0 || busy} onClick={() => void sendCode()} className={cn('self-center text-sm', resendIn > 0 ? 'text-muted-foreground' : 'font-bold text-brand-text underline underline-offset-4')}>
              {resendIn > 0 ? (
                <>
                  إعادة الإرسال بعد <bdi dir="ltr">{minutes}</bdi>
                </>
              ) : (
                'إعادة إرسال الرمز'
              )}
            </button>
            <Button size="store" loading={busy} disabled={code.length !== CODE_LENGTH} onClick={() => void verify()}>
              تأكيد
            </Button>
          </div>
        ) : null}

        {step === 'name' ? (
          <form onSubmit={finish} className="flex animate-step-in flex-col gap-4">
            <label className="flex flex-col gap-2">
              <b className="text-[15px]">الاسم الكامل</b>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} className={fieldClass(Boolean(error))} />
            </label>
            {error ? <ErrorLine text={error} /> : null}
            <Button type="submit" size="store" loading={busy}>
              متابعة
            </Button>
          </form>
        ) : null}

        <span className="mt-auto text-[13px] text-muted-foreground">
          بالمتابعة توافق على{' '}
          <Link to={{ name: 'legal', page: 'terms' }} className="underline" onClick={() => shop.closeLogin(false)}>
            الشروط والأحكام
          </Link>{' '}
          و
          <Link to={{ name: 'legal', page: 'privacy' }} className="underline" onClick={() => shop.closeLogin(false)}>
            سياسة الخصوصية
          </Link>
          .
        </span>
      </SheetContent>
    </Sheet>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p id="login-error" role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
