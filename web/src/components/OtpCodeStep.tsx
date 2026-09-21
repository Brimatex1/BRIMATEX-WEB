import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Mirrors the server: codes are 6 digits, resends are one per minute (src/lib/otp.js). */
export const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

interface OtpCodeStepProps {
  phone: string;
  submitting: boolean;
  submitLabel: string;
  onVerify: (code: string) => void;
  /** Resolves once the new code is requested; rejects to keep the countdown off. */
  onResend: () => Promise<void>;
  onBack: () => void;
}

/**
 * The "enter the WhatsApp code" step, shared by sign-up and password recovery.
 * The code was already requested by the parent before this step appears, so
 * the resend countdown starts full.
 */
export function OtpCodeStep({
  phone,
  submitting,
  submitLabel,
  onVerify,
  onResend,
  onBack,
}: OtpCodeStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    setResending(true);
    try {
      await onResend();
      setCode('');
      setError(null);
      setCooldown(RESEND_SECONDS);
    } catch {
      /* the parent already showed the error */
    } finally {
      setResending(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length !== CODE_LENGTH) {
          setError(`الرمز من ${CODE_LENGTH} أرقام`);
          return;
        }
        onVerify(code);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="auth-code">
          رمز التحقق المرسل إلى <span className="tabular" dir="ltr">{phone}</span>
        </Label>
        <Input
          id="auth-code"
          value={code}
          onChange={(e) => {
            // Digits only - pasted codes often carry spaces or Arabic-Indic digits.
            const digits = e.target.value
              .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
              .replace(/\D/g, '')
              .slice(0, CODE_LENGTH);
            setCode(digits);
            setError(null);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          dir="ltr"
          className="text-center text-lg tracking-[0.5em] tabular"
          aria-invalid={Boolean(error)}
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <Button type="submit" className="w-full" loading={submitting}>
        {submitLabel}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Button type="button" variant="link" onClick={onBack} className="h-auto px-1">
          تغيير الرقم
        </Button>
        {cooldown > 0 ? (
          <span className="text-muted-foreground tabular">إعادة الإرسال بعد {cooldown} ث</span>
        ) : (
          <Button
            type="button"
            variant="link"
            onClick={() => void resend()}
            disabled={resending}
            className="h-auto px-1"
          >
            إعادة إرسال الرمز
          </Button>
        )}
      </div>
    </form>
  );
}
