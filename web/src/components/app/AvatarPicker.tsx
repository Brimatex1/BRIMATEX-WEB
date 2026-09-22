import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

/** The side of the square the photo is stored at - plenty for a round avatar. */
const SIZE = 512;

/**
 * Crops the picked image to a centred square and re-encodes it as JPEG.
 * Small and fast to upload, and redrawing it drops the file's metadata - the
 * location a phone camera may have written into the original included.
 */
function toSquareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('تعذّر قراءة الصورة — اختر صورة JPEG أو PNG'));
    // Read as a data: URL, not an object URL: the page's Content-Security-Policy
    // allows images from data: but not from blob:, so an object URL never loads.
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = () => {
      const img = new Image();
      img.onerror = fail;
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.min(SIZE, side);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('المتصفح لا يدعم معالجة الصور'));
        ctx.drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          canvas.width,
          canvas.height
        );
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** The round photo, or the first letter of the name on the app's tint. */
export function Avatar({ user, size = 52, className }: { user: User | null; size?: number; className?: string }) {
  const letter = user?.name?.trim().charAt(0) || '؟';
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-app-tint bg-app-tint-soft font-bold text-app-ocean',
        className
      )}
    >
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" /> : letter}
    </span>
  );
}

/**
 * The account's photo with "change" and "remove" - the same photo the app
 * shows, since both read it from the server.
 */
export function AvatarPicker({
  user,
  token,
  onChange,
}: {
  user: User;
  token: string;
  onChange: (avatarUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await toSquareJpeg(file);
      const { avatarUrl } = await api.uploadAvatar(token, dataUrl);
      onChange(avatarUrl);
      toast.success('تم تحديث صورتك');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.removeAvatar(token);
      onChange(null);
      toast.success('أُزيلت الصورة');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر إزالة الصورة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label="تغيير الصورة الشخصية"
        className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ocean"
      >
        <Avatar user={user} size={72} className={cn(busy && 'opacity-50')} />
        <span className="absolute -bottom-0.5 -end-0.5 grid size-7 place-items-center rounded-full bg-app-ocean text-white ring-2 ring-white">
          <Camera className="size-4" aria-hidden="true" />
        </span>
      </button>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="text-sm font-semibold text-app-ocean"
        >
          {busy ? 'جارٍ الرفع…' : user.avatarUrl ? 'تغيير الصورة' : 'أضف صورة'}
        </button>
        {user.avatarUrl && (
          <button type="button" onClick={() => void remove()} disabled={busy} className="text-sm text-app-muted">
            إزالة
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
}
