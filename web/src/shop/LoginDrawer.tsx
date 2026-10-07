import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Eye, EyeOff, LockKeyhole } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { trackCompleteRegistration } from '@/lib/pixel';
import { cn, toLatinDigits } from '@/lib/utils';

import { PointsIcon } from './loyalty';
import { Link } from './router';
import { useShop } from './state';

const CODE_LENGTH = 6;
const MIN_PASSWORD = 6;
/** The server's per-number wait between two codes (src/lib/otp.js). */
const RESEND_SECONDS = 60;

/** A Libyan mobile: 10 digits starting 09. */
export function isLibyanMobile(phone: string): boolean {
  return /^09\d{8}$/.test(phone);
}

const TITLE = {
  checkout: 'سجّل الدخول لإتمام الطلب',
  favorites: 'سجّل الدخول لتبقى المفضّلة معك',
  account: 'تسجيل الدخول',
  cart: 'سجّل الدخول للإضافة إلى السلة',
} as const;

/**
 * - login: the number and the password - every sign-in, no code.
 * - signup: a new account - the number, the WhatsApp code (once, to prove the
 *   number is theirs), then the name and a password.
 * - reset: «نسيت كلمة المرور» - the number, the code, a new password. An
 *   account opened by code alone (before passwords) sets its first one here.
 */
type Mode = 'login' | 'signup' | 'reset';
type Step = 'phone' | 'code' | 'details';

/**
 * تسجيل الدخول (handoff WebLogin): a drawer from the left over the dimmed
 * page. The owner's rule against fake accounts and orders: a WhatsApp code
 * only when an account is opened or a password forgotten; signing in is the
 * number and the password. A wrong code shakes the boxes once. Signed in, the
 * action that opened it carries on (checkout, a favourite).
 */
export function LoginDrawer() {
  const shop = useShop();
  const { open, reason } = shop.loginDrawer;
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [proof, setProof] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [shake, setShake] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  // Every opening starts at the sign-in.
  useEffect(() => {
    if (!open) return;
    go('login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  /** Another path - the number stays, the rest is cleared. */
  function go(next: Mode) {
    setMode(next);
    setStep('phone');
    setPassword('');
    setCode('');
    setName('');
    setProof('');
    setError(null);
  }

  function phoneOk(): boolean {
    if (isLibyanMobile(phone)) return true;
    setError('رقم الهاتف يتكوّن من 10 أرقام ويبدأ بـ 09.');
    return false;
  }

  function done(token: string, user: Parameters<typeof shop.auth.signIn>[1]) {
    shop.auth.signIn(token, user);
    shop.closeLogin(true);
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!phoneOk()) return;
    if (!password) {
      setError('اكتب كلمة المرور.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(phone, password);
      done(r.token, r.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الدخول');
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!phoneOk()) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await api.requestSignupOtp(phone);
      else await api.requestPasswordOtp(phone);
      setResendIn(RESEND_SECONDS);
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
      const token = mode === 'signup' ? (await api.verifySignupOtp(phone, value)).signupToken : (await api.verifyPasswordOtp(phone, value)).resetToken;
      setProof(token);
      setStep('details');
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
    if (mode === 'signup' && name.trim().length < 2) {
      setError('اكتب اسمك');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`كلمة المرور ${MIN_PASSWORD} أحرف على الأقل.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const r = await api.registerVerified(name.trim(), password, proof);
        // A new account, now that the WhatsApp code proved the number.
        trackCompleteRegistration();
        done(r.token, r.user);
      } else {
        const r = await api.resetPassword(proof, password);
        done(r.token, r.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  const minutes = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;
  const fieldClass = (bad: boolean) => cn('h-[52px] w-full rounded-lg border bg-background px-4 text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-ring', bad ? 'border-destructive' : 'border-input');
  const linkClass = 'text-sm font-bold text-brand-text underline underline-offset-4';

  const title =
    mode === 'signup' ? (step === 'details' ? 'مرحباً بك' : 'حساب جديد') : mode === 'reset' ? (step === 'details' ? 'كلمة مرور جديدة' : 'نسيت كلمة المرور') : TITLE[reason];
  const line =
    mode === 'signup'
      ? step === 'details'
        ? 'اسمك على طلباتك وفاتورتك، وكلمة مرور تدخل بها في كل مرة.'
        : 'نرسل رمزاً على واتساب مرة واحدة لنتأكد أن الرقم رقمك.'
      : mode === 'reset'
        ? step === 'details'
          ? 'اختر كلمة مرور جديدة - تدخل بها من الآن.'
          : 'نرسل رمزاً على واتساب إلى رقمك، ثم تختار كلمة مرور جديدة.'
        : shop.config?.guestBrowsing === false
          ? 'التصفّح والمفضّلة متاحان دون حساب. نطلب الدخول للإضافة إلى السلة وإتمام الطلب.'
          : 'التصفّح والإضافة إلى السلة والمفضّلة متاحة دون حساب. نطلب الدخول لإتمام الطلب فقط.';

  const phoneField = (
    <label className="flex flex-col gap-2">
      <b className="text-[15px]">رقم الهاتف</b>
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
  );

  const passwordField = (label: string, autoComplete: 'current-password' | 'new-password', autoFocus = false) => (
    <label className="flex flex-col gap-2">
      <b className="text-[15px]">{label}</b>
      <span className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          dir="ltr"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'login-error' : undefined}
          className={cn(fieldClass(Boolean(error)), 'pl-12 text-start')}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute inset-y-0 end-0 grid w-12 place-items-center text-muted-foreground hover:text-foreground"
          aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        >
          {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </span>
    </label>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && shop.closeLogin(false)}>
      <SheetContent side="left" className="flex w-full flex-col gap-5 overflow-y-auto p-6 pt-14 sm:max-w-[520px] sm:p-10 sm:pt-16">
        <span className="grid size-12 place-items-center rounded-full bg-image-bg text-brand-text" aria-hidden>
          <LockKeyhole className="size-6" strokeWidth={1.8} />
        </span>
        <SheetTitle className="font-display text-2xl font-bold sm:text-[28px]">{title}</SheetTitle>
        <SheetDescription className="text-[15px] leading-relaxed text-muted-foreground">{line}</SheetDescription>
        {/* The loyalty add-on's one line for guests - shown even while the program is off. */}
        {mode === 'login' ? (
          <p className="-mt-2 flex items-center gap-2 text-[15px] font-bold text-brand-text">
            <PointsIcon className="size-[18px]" />
            اجمع النقاط مع كل طلب واحصل على قسائم خصم.
          </p>
        ) : null}

        {mode === 'login' ? (
          <form onSubmit={signIn} className="flex flex-col gap-4">
            {phoneField}
            {passwordField('كلمة المرور', 'current-password')}
            <button type="button" className={cn(linkClass, 'self-start')} onClick={() => go('reset')}>
              نسيت كلمة المرور؟
            </button>
            {error ? <ErrorLine text={error} /> : null}
            <Button type="submit" size="store" loading={busy}>
              دخول
            </Button>
            <p className="text-center text-[15px]">
              ما عندك حساب؟{' '}
              <button type="button" className={linkClass} onClick={() => go('signup')}>
                أنشئ حساباً
              </button>
            </p>
          </form>
        ) : null}

        {mode !== 'login' && step === 'phone' ? (
          <form onSubmit={sendCode} className="flex animate-step-in flex-col gap-4">
            {phoneField}
            <span className="text-[13px] text-muted-foreground">
              {mode === 'signup' ? 'اكتب رقماً عليه واتساب، فالرمز يوصلك هناك. نستعمله للدخول والتواصل بخصوص طلباتك فقط.' : 'الرقم الذي فتحت به حسابك - يوصلك الرمز على واتساب.'}
            </span>
            {error ? <ErrorLine text={error} /> : null}
            <Button type="submit" size="store" loading={busy}>
              أرسل الرمز
            </Button>
          </form>
        ) : null}

        {mode !== 'login' && step === 'code' ? (
          <div className="flex animate-step-in flex-col gap-4">
            <div className="flex flex-col gap-2">
              <b className="text-[15px]">رقم الهاتف</b>
              <div className="flex items-center justify-between rounded-lg bg-image-bg px-4 py-3">
                <bdi dir="ltr" className="tabular-nums">
                  {phone.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3')}
                </bdi>
                <button type="button" className={linkClass} onClick={() => setStep('phone')}>
                  تغيير
                </button>
              </div>
            </div>
            <b className="text-[15px]">رمز التحقق</b>
            <span className="-mt-2 text-sm text-muted-foreground">
              {mode === 'signup'
                ? 'أرسلنا رمزاً من 6 أرقام على واتساب. إن كان الرقم مسجّلاً من قبل فلن يصلك رمز - سجّل الدخول، أو «نسيت كلمة المرور».'
                : 'أرسلنا رمزاً من 6 أرقام على واتساب. إن لم يكن للرقم حساب فلن يصلك رمز - أنشئ حساباً.'}
            </span>
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

        {mode !== 'login' && step === 'details' ? (
          <form onSubmit={finish} className="flex animate-step-in flex-col gap-4">
            {mode === 'signup' ? (
              <label className="flex flex-col gap-2">
                <b className="text-[15px]">الاسم الكامل</b>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  autoComplete="name"
                  autoFocus
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'login-error' : undefined}
                  className={fieldClass(Boolean(error))}
                />
              </label>
            ) : null}
            {passwordField(mode === 'signup' ? 'كلمة المرور' : 'كلمة المرور الجديدة', 'new-password', mode === 'reset')}
            <span className="-mt-2 text-[13px] text-muted-foreground">{MIN_PASSWORD} أحرف أو أرقام على الأقل.</span>
            {error ? <ErrorLine text={error} /> : null}
            <Button type="submit" size="store" loading={busy}>
              {mode === 'signup' ? 'إنشاء الحساب' : 'حفظ والدخول'}
            </Button>
          </form>
        ) : null}

        {mode !== 'login' ? (
          <button type="button" className={cn(linkClass, 'self-center')} onClick={() => go('login')}>
            رجوع إلى تسجيل الدخول
          </button>
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
