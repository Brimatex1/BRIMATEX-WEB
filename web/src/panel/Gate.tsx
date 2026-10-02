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
 * Not signed in: the storefront's sign-in with a code - the number, then the
 * six digits sent on WhatsApp (the same calls as shop/LoginDrawer). The panel
 * has no accounts of its own: a staff member is a customer account with a
 * role, so a number with no account is told so rather than signed up.
 */
export function PanelLogin({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!/^09\d{8}$/.test(phone)) {
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
        setError('لا يوجد حساب بهذا الرقم. اطلب من المدير إضافتك إلى فريق الإدارة.');
        setStep('phone');
      } else {
        onSignedIn(r.token, r.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'الرمز غير صحيح.');
      setCode('');
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-12 w-full rounded-[10px] bg-[#F5F6FA] px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-dark-ocean/40';
  const minutes = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`;

  return (
    <Frame>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[22px] font-bold">الدخول إلى لوحة الإدارة</h1>
        <p className="text-sm text-[#5F6373]">
          {step === 'phone' ? 'أدخل رقم هاتفك، وسنرسل إليك رمز الدخول عبر واتساب.' : `أرسلنا رمزاً من 6 أرقام إلى واتساب ${phone}.`}
        </p>
      </div>
      {step === 'phone' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
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
          {error ? <p className="text-sm text-[#A12020]">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'جارٍ الإرسال…' : 'أرسل الرمز'}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[#5F6373]">رمز الدخول</span>
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
            {busy ? 'جارٍ التحقق…' : 'دخول'}
          </Button>
          <div className="flex items-center justify-between text-[13.5px]">
            <button type="button" className="font-semibold text-dark-ocean underline" onClick={() => setStep('phone')}>
              تغيير الرقم
            </button>
            {resendIn > 0 ? (
              <span className="text-[#5F6373]">إعادة الإرسال بعد {minutes}</span>
            ) : (
              <button type="button" className="font-semibold text-dark-ocean underline" onClick={() => void sendCode()}>
                أعد إرسال الرمز
              </button>
            )}
          </div>
        </form>
      )}
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
