import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { Stars } from '@/components/store/ProductReviewsSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { AdminReview, Product } from '@/types';

/**
 * Customer reviews, newest first. They show on the product page as soon as
 * they are written - only a customer who bought the product can write one -
 * and any of them can be hidden here (a phone number in the text, an insult)
 * and shown again.
 */
export function ReviewsPanel({ token }: { token: string }) {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.adminReviews(token), api.getProducts().catch(() => ({ products: [] as Product[] }))])
      .then(([r, p]) => {
        setReviews(r.reviews);
        setProducts(p.products);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // A review is of the size bought, so a size's id names its product.
  const nameOf = useMemo(() => {
    const names = new Map<number, string>();
    for (const p of products) {
      names.set(p.id, p.name);
      for (const v of p.variants ?? []) names.set(v.id, `${p.name} — ${v.label}`);
    }
    return (id: number) => names.get(id) ?? `منتج #${id}`;
  }, [products]);

  async function toggle(review: AdminReview) {
    setBusy(review.id);
    try {
      const { hidden } = await api.adminSetReviewHidden(token, review.id, !review.hidden);
      setReviews((list) => list.map((r) => (r.id === review.id ? { ...r, hidden } : r)));
      toast.success(hidden ? 'أُخفي التقييم من صفحة المنتج' : 'التقييم ظاهر في صفحة المنتج');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>تقييمات الزبائن</CardTitle>
        <CardDescription>
          يظهر التقييم في صفحة المنتج أول ما يكتبه الزبون، ولا يقدر يكتبه إلا من اشترى المنتج. أخفِ أي تقييم فيه رقم هاتف
          أو كلام غير لائق.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {!loading && reviews.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تقييمات بعد.</p>}
        {reviews.map((r) => (
          <div key={r.id} className={`rounded-lg border p-3 ${r.hidden ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} size={14} />
                {r.hidden && <Badge variant="secondary">مخفي</Badge>}
              </div>
              <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void toggle(r)}>
                {r.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                {r.hidden ? 'إظهار' : 'إخفاء'}
              </Button>
            </div>
            {r.comment && <p className="mt-2 text-sm leading-6">{r.comment}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              {r.name}
              {r.phone && (
                <>
                  {' · '}
                  <span dir="ltr">{r.phone}</span>
                </>
              )}
              {' · '}
              {nameOf(r.productId)} · <span dir="ltr">{r.orderName}</span> ·{' '}
              {new Date(r.createdAt).toLocaleDateString('ar-LY')}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
