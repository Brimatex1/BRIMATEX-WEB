import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { FEATURE_ICONS, iconSrc } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

const ALL_ICONS = Object.values(FEATURE_ICONS);
const MAX_IMAGE_BYTES = 5_000_000;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface OverrideChanges {
  iconFeatures?: string[];
  description?: string | null;
  enabled?: boolean;
  image?: string | null;
}

interface ProductOverridesEditorProps {
  token: string;
  product: Product;
  /** Called with only the fields that were actually saved — image upload and
   * the main save button act independently, so this must not clobber fields
   * the other one hasn't saved yet. */
  onSaved: (productId: number, changes: OverrideChanges) => void;
  onClose: () => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('تعذّرت قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

/** The expanded panel only — the parent (AdminSection) owns open/closed state
 * so it can render this as a full-width table row instead of inside a cell. */
export function ProductOverridesEditor({
  token,
  product,
  onSaved,
  onClose,
}: ProductOverridesEditorProps) {
  const [selectedIcons, setSelectedIcons] = useState<string[]>(product.iconFeatures ?? []);
  const [description, setDescription] = useState(product.description ?? '');
  const [enabled, setEnabled] = useState(product.enabled !== false);
  const [image, setImage] = useState(product.image ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleIcon(key: string) {
    setSelectedIcons((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets picking the same file again re-trigger onChange
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('الصورة يجب أن تكون JPEG أو PNG أو WebP');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('حجم الصورة يتجاوز 5 ميجابايت');
      return;
    }

    setUploadingImage(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await api.adminUploadProductImage(token, product.id, dataUrl);
      setImage(result.imageUrl);
      onSaved(product.id, { image: result.imageUrl });
      toast.success('تم رفع الصورة');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    } finally {
      setUploadingImage(false);
    }
  }

  async function removeImage() {
    setUploadingImage(true);
    try {
      await api.adminRemoveProductImage(token, product.id);
      setImage(null);
      onSaved(product.id, { image: null });
      toast.success('تمت إزالة الصورة');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّرت الإزالة');
    } finally {
      setUploadingImage(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const result = await api.adminSaveProductOverrides(token, product.id, {
        iconKeys: selectedIcons,
        description,
        enabled,
      });
      onSaved(product.id, {
        iconFeatures: result.iconKeys,
        description: result.description,
        enabled: result.enabled,
      });
      toast.success('تم حفظ تعديلات المنتج');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-5 rounded-lg border bg-card p-4">
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`enabled-${product.id}`}>حالة المنتج في المتجر</Label>
          <button
            id={`enabled-${product.id}`}
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              enabled ? 'bg-success' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-5 rounded-full bg-card shadow motion-safe:transition-[inset-inline-start]',
                enabled ? 'end-0.5' : 'start-0.5'
              )}
            />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {enabled
            ? 'ظاهر ومتاح للطلب في المتجر.'
            : 'مخفي عن الزوار — يبقى هنا في اللوحة لإعادة تفعيله لاحقاً.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>صورة المنتج</Label>
        <div className="flex items-center gap-3">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
            {image ? (
              <img src={image} alt="" className="size-full object-cover" />
            ) : (
              <span className="px-1 text-center text-[10px] text-muted-foreground">
                بلا صورة (رسم بديل)
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
            >
              {uploadingImage ? 'جارٍ الرفع...' : image ? 'استبدال الصورة' : 'رفع صورة'}
            </Button>
            {image && (
              <Button type="button" size="sm" variant="ghost" onClick={removeImage} disabled={uploadingImage}>
                إزالة الصورة
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">JPEG أو PNG أو WebP، بحد أقصى 5 ميجابايت.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`desc-${product.id}`}>وصف المنتج</Label>
        <Textarea
          id={`desc-${product.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="اتركه فارغاً لعرض الوصف الأصلي من المصدر (أودو أو ملف المتجر)"
        />
      </div>

      <div>
        <Label>المميزات</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_ICONS.map((icon) => {
            const checked = selectedIcons.includes(icon.key);
            return (
              <button
                key={icon.key}
                type="button"
                onClick={() => toggleIcon(icon.key)}
                aria-pressed={checked}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2 text-start text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  checked ? 'border-accent bg-accent/10 font-semibold text-accent' : 'hover:bg-muted'
                )}
              >
                <img src={iconSrc(icon.file)} alt="" className="size-5 shrink-0" />
                {icon.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'جارٍ الحفظ...' : 'حفظ'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
