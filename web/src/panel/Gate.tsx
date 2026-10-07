import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { BrimatexLogo } from '@/components/BrimatexLogo';
import { api } from '@/lib/api';
import type { User } from '@/types';
import { cn, toLatinDigits } from '@/lib/utils';

import { Button, Icon, buttonClass } from './ui';

const CODE_LENGTH = 6;

function Frame({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="grid min-h-[100svh] place-items-center bg-[#F5F6FA] px-4 py-10 font-sans text-[#16161F]">
      <div className="flex w-full max-w-[420px] flex-col gap-5 rounded-2xl border border-[#E4E6EE] bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <BrimatexLogo className="h-12 w-[118px] text-dark-ocean" />
          <span className="rounded-md bg-[#F5F6FA] px-2 py-[3px] text-xs font-bold text-[#5F6373]">الإدارة</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Not signed in: the storefront's sign-in (shop/LoginDrawer) - the number and
 * the password; «نسيت كلمة المرور» sends a WhatsApp code, then a new password
 * (the first one, for an account opened by code alone). The panel has no
 * accounts of its own: a staff member is a customer account with a role, so
 * none is opened here.
 */
export function PanelLogin({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  function go(next: 'login' | 'reset') {
    setMode(next);
    setStep('phone');
    setPassword('');
    setCode('');
    setError(null);
  }

  const phoneOk = () => {
    if (/^09\d{8}$/.test(phone)) return true;
    setError('رقم الهاتف يتكوّن من 10 أرقام ويبدأ بـ 09.');
    return false;
  };

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
      onSignedIn(r.token, r.user);
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
      await api.requestPasswordOtp(phone);
      setResendIn(60);
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
      setResetToken((await api.verifyPasswordOtp(phone, value)).resetToken);
      setStep('password');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'الرمز غير صحيح.');
      setCode('');
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('كلمة المرور 6 أحرف على الأقل.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.resetPassword(resetToken, password);
      onSignedIn(r.token, r.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-12 w-full rounded-[10px] bg-[#F5F6FA] px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-dark-ocean/40';
  const link = 'font-semibold text-dark-ocean underline';
  const minutes = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;
  const phoneInput = (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[#5F6373]">رقم الهاتف</span>
      <input
        dir="ltr"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 10))}
        placeholder="09X XXX XXXX"
        className={cn(field, 'text-right')}
        autoFocus
      />
    </label>
  );
  const passwordInput = (label: string, autoComplete: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[#5F6373]">{label}</span>
      <input dir="ltr" type="password" autoComplete={autoComplete} value={password} onChange={(e) => setPassword(e.target.value)} className={cn(field, 'text-right')} />
    </label>
  );

  return (
    <Frame>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[22px] font-bold">{mode === 'login' ? 'الدخول إلى لوحة الإدارة' : 'نسيت كلمة المرور'}</h1>
        <p className="text-sm text-[#5F6373]">
          {mode === 'login'
            ? 'رقم هاتفك وكلمة المرور - نفس حسابك في المتجر.'
            : step === 'phone'
              ? 'نرسل رمزاً على واتساب إلى رقمك، ثم تختار كلمة مرور جديدة.'
              : step === 'code'
                ? `أرسلنا رمزاً من 6 أرقام إلى واتساب ${phone}.`
                : 'اختر كلمة مرور جديدة - تدخل بها من الآن.'}
        </p>
      </div>

      {mode === 'login' ? (
        <form onSubmit={signIn} className="flex flex-col gap-4">
          {phoneInput}
          {passwordInput('كلمة المرور', 'current-password')}
          {error ? <p className="text-sm text-[#A12020]">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </Button>
          <button type="button" className={cn(link, 'self-start text-[13.5px]')} onClick={() => go('reset')}>
            نسيت كلمة المرور؟
          </button>
        </form>
      ) : step === 'phone' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          {phoneInput}
          {error ? <p className="text-sm text-[#A12020]">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'جارٍ الإرسال…' : 'أرسل الرمز'}
          </Button>
        </form>
      ) : step === 'code' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[#5F6373]">رمز التحقق</span>
            <input
              ref={codeInput}
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                const v = toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, CODE_LENGTH);
                setCode(v);
                if (v.length === CODE_LENGTH) void verify(v);
              }}
              className={cn(field, 'text-center tracking-[0.5em]')}
            />
          </label>
          {error ? <p className="text-sm text-[#A12020]">{error}</p> : null}
          <Button type="submit" disabled={busy || code.length !== CODE_LENGTH}>
            {busy ? 'جارٍ التحقق…' : 'تأكيد'}
          </Button>
          <div className="flex items-center justify-between text-[13.5px]">
            <button type="button" className={link} onClick={() => setStep('phone')}>
              تغيير الرقم
            </button>
            {resendIn > 0 ? (
              <span className="text-[#5F6373]">إعادة الإرسال بعد {minutes}</span>
            ) : (
              <button type="button" className={link} onClick={() => void sendCode()}>
                أعد إرسال الرمز
              </button>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={savePassword} className="flex flex-col gap-4">
          {passwordInput('كلمة المرور الجديدة', 'new-password')}
          <span className="-mt-2 text-[12.5px] text-[#5F6373]">6 أحرف أو أرقام على الأقل.</span>
          {error ? <p className="text-sm text-[#A12020]">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ والدخول'}
          </Button>
        </form>
      )}

      {mode === 'reset' ? (
        <button type="button" className={cn(link, 'self-start text-[13.5px]')} onClick={() => go('login')}>
          رجوع إلى الدخول
        </button>
      ) : null}
    </Frame>
  );
}

/** Signed in, but not one of the staff. */
export function NoAccess({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <Frame>
      <span className="grid size-12 place-items-center rounded-full bg-[#FDE8E8] text-[#A12020]">
        <Icon name="lock" size={22} />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[22px] font-bold">ليست لديك صلاحية</h1>
        <p className="text-sm leading-relaxed text-[#5F6373]">
          {name ? `حساب ${name} لا يملك صلاحية الدخول إلى لوحة الإدارة.` : 'حسابك لا يملك صلاحية الدخول إلى لوحة الإدارة.'} اطلب من المدير منحك الصلاحية.
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <a href="/" className={cn(buttonClass('primary'), 'no-underline')}>
          العودة إلى المتجر
        </a>
        <Button variant="outline" onClick={onSignOut}>
          الدخول بحساب آخر
        </Button>
      </div>
    </Frame>
  );
}

/** While the session is being checked. */
export function Loading() {
  return (
    <div className="grid min-h-[100svh] place-items-center bg-[#F5F6FA]" aria-busy>
      <span className="size-8 animate-spin rounded-full border-2 border-[#E4E6EE] border-t-dark-ocean" aria-label="جارٍ التحميل" />
    </div>
  );
}
