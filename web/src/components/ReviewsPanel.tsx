import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { Stars } from '@/components/store/ProductReviewsSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { AdminReview, Product } from '@/types';

/**
 * Customer reviews, those waiting first. A new review waits here until it is
 * published (only a customer who bought the product can write one); any can
 * be hidden later (a phone number in the text, an insult) and shown again.
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

  async function decide(review: AdminReview, hidden: boolean) {
    setBusy(review.id);
    try {
      await api.adminSetReviewHidden(token, review.id, hidden);
      setReviews((list) => list.map((r) => (r.id === review.id ? { ...r, hidden, pending: false } : r)));
      toast.success(hidden ? 'أُخفي التقييم من صفحة المنتج' : 'نُشر التقييم في صفحة المنتج');
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
          التقييم الجديد ينتظر موافقتك قبل ما يظهر في صفحة المنتج، ولا يقدر يكتبه إلا من اشترى المنتج. انشره، أو أخفِه لو
          فيه رقم هاتف أو كلام غير لائق.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {!loading && reviews.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تقييمات بعد.</p>}
        {[...reviews].sort((a, b) => Number(Boolean(b.pending)) - Number(Boolean(a.pending))).map((r) => (
          <div key={r.id} className={`rounded-lg border p-3 ${r.pending ? 'border-accent bg-accent/5' : r.hidden ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} size={14} />
                {r.pending ? <Badge>بانتظار المراجعة</Badge> : r.hidden ? <Badge variant="secondary">مخفي</Badge> : null}
              </div>
              <div className="flex gap-2">
                {r.pending ? (
                  <>
                    <Button size="sm" disabled={busy === r.id} onClick={() => void decide(r, false)}>
                      <Check className="size-4" /> نشر
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void decide(r, true)}>
                      <EyeOff className="size-4" /> إخفاء
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void decide(r, !r.hidden)}>
                    {r.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    {r.hidden ? 'إظهار' : 'إخفاء'}
                  </Button>
                )}
              </div>
            </div>
            {r.title && <p className="mt-2 text-sm font-semibold">{r.title}</p>}
            {r.comment && <p className="mt-2 text-sm leading-6">{r.comment}</p>}
            {r.subRatings && (
              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  r.subRatings.comfort ? `الراحة ${r.subRatings.comfort}/5` : null,
                  r.subRatings.quality ? `الجودة ${r.subRatings.quality}/5` : null,
                  r.subRatings.value ? `قيمة السعر ${r.subRatings.value}/5` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
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
