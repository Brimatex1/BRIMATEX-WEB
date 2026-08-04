import { useState } from 'react';
import { Send, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface WhatsAppButtonProps {
  /** International format, digits only (e.g. "218911234567"). */
  phone: string;
  message: string;
  className?: string;
}

/**
 * Floating direct-support widget. Only rendered when the admin has set a
 * number (see WhatsAppSettingsPanel) — no dead button pointing nowhere.
 *
 * WhatsApp has no embeddable web-chat SDK for a personal/business number —
 * every site that offers "chat with us on WhatsApp" opens the real app or
 * web.whatsapp.com with the message pre-filled, which is what this does.
 * The box here is the closest thing to in-page chat: pick/edit the message,
 * then hand off to WhatsApp to actually send it.
 */
export function WhatsAppButton({ phone, message, className }: WhatsAppButtonProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(message);
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;

  function startChat() {
    const text = draft.trim() || message;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  return (
    <div className={cn('fixed bottom-5 end-5 z-40 flex flex-col items-end gap-3', className)}>
      {open && (
        <div className="w-80 max-w-[calc(100vw-2.5rem)] animate-fade-up overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between gap-2 bg-[#25D366] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                <WhatsAppIcon className="size-5" />
                <span
                  className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-[#25D366] bg-[#4ADE80]"
                  aria-hidden="true"
                />
              </span>
              <div>
                <p className="text-sm font-semibold">بريماتكس — الدعم المباشر</p>
                <p className="text-xs text-white/80">متصل الآن</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="shrink-0 rounded-full p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              aria-label="رسالتك"
              className="text-sm"
            />
            <Button
              type="button"
              onClick={startChat}
              className="w-full bg-[#25D366] text-white hover:bg-[#20bd5a]"
            >
              <Send className="size-4" aria-hidden="true" />
              بدء المحادثة على واتساب
            </Button>
            <p className="text-center text-xs text-muted-foreground">سيُفتح واتساب لإكمال المحادثة</p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'إغلاق محادثة واتساب' : 'تواصل معنا عبر واتساب'}
        aria-expanded={open}
        className="relative flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#20bd5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? (
          <X className="size-6" aria-hidden="true" />
        ) : (
          <>
            <WhatsAppIcon className="size-8" />
            <span
              className="absolute bottom-0.5 end-0.5 size-3.5 rounded-full border-2 border-white bg-[#4ADE80]"
              aria-hidden="true"
            />
          </>
        )}
      </button>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true" focusable="false">
      <path d="M16.01 3C9.38 3 4 8.38 4 15.01c0 2.39.7 4.62 1.9 6.5L4 29l7.66-1.85a11.9 11.9 0 0 0 4.35.82h.01c6.63 0 12.01-5.38 12.01-12.01C28.03 8.38 22.65 3 16.01 3Zm0 21.85h-.01a9.9 9.9 0 0 1-5.05-1.39l-.36-.21-4.55 1.1 1.12-4.44-.24-.37a9.87 9.87 0 0 1-1.53-5.32c0-5.47 4.45-9.92 9.93-9.92a9.86 9.86 0 0 1 9.92 9.92c0 5.47-4.45 9.93-9.93 9.93Zm5.44-7.44c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.7.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}
