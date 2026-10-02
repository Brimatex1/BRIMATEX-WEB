import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';

import { ProductImage } from '@/components/store/ProductCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

const LABELS = ['', 'سيئة', 'مقبولة', 'جيدة', 'جيدة جداً', 'ممتازة'];

/** Five stars to tap - the chosen one and those before it fill. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" role="radiogroup" aria-label="تقييمك" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} من 5 - ${LABELS[n]}`}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="rounded-sm p-0.5 transition-transform duration-150 ease-out-strong active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={cn('size-8 transition-colors', n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted-foreground/30')}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {shown > 0 && <span className="text-sm font-medium text-muted-foreground">{LABELS[shown]}</span>}
    </div>
  );
}

/**
 * "قيّم مرتبتك" for a delivered order: the mattress's photo and name, five
 * stars and an optional word. The server takes a review only for a product in
 * the customer's own order, once per order (src/lib/perks.js); the first one
 * unlocks the reviewer's 5% voucher.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  token,
  orderName,
  product,
  onReviewed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  orderName: string;
  product: Product | null;
  onReviewed: (productId: number) => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!product || !rating) return;
    setSending(true);
    try {
      await api.postReview(token, { productId: product.id, orderName, rating, comment: comment.trim() });
      toast.success('شكراً على تقييمك!', { description: 'نراجع التقييمات قبل نشرها، وسيظهر رأيك في صفحة المرتبة بعد الموافقة.' });
      onReviewed(product.id);
      onOpenChange(false);
      setRating(0);
      setComment('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر إرسال التقييم');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>قيّم مرتبتك</DialogTitle>
          <DialogDescription>كيف كان نومك عليها؟ أول تقييم لك يعطيك قسيمة خصم 5% على طلبك القادم.</DialogDescription>
        </DialogHeader>

        {product && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <ProductImage product={product} className="size-14 shrink-0 rounded-md" />
            <p className="font-semibold">{product.name}</p>
          </div>
        )}

        <StarPicker value={rating} onChange={setRating} />

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="اكتب رأيك إن أحببت: الراحة، الصلابة، التوصيل…"
          aria-label="رأيك (اختياري)"
        />

        <Button onClick={() => void submit()} disabled={!rating || sending} className="w-full">
          {sending ? 'جارٍ الإرسال…' : rating ? 'أرسل التقييم' : 'اختر عدد النجوم أولاً'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
