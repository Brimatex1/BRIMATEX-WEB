import { useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { OrderSummary, Product } from '@/types';

import { displayName, lineParts, tierOf } from '../catalog';
import { useTitle } from '../hooks';
import { currentStep, isCancelled } from '../orders';
import { photoOf } from '../ProductCard';
import { Link, useRouter } from '../router';
import { lineItem, useShop } from '../state';
import { EmptyState, Skeleton, SizeText, StatusDot, TierTag } from '../ui';
import { AccountLayout, useMyOrders } from './AccountLayout';
import { responsivePhoto } from '@/shop/photoSizes';

interface Covered {
  key: string;
  order: OrderSummary;
  product: Product;
  size: string;
  from: Date;
  until: Date;
}

function dayText(d: Date): string {
  return d.toLocaleDateString('ar-LY', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Each mattress delivered to the customer, its warranty running from the day it arrived. */
function coveredMattresses(orders: OrderSummary[], find: ReturnType<typeof useShop>['find']): Covered[] {
  const out: Covered[] = [];
  for (const order of orders) {
    if (isCancelled(order) || currentStep(order) < 4) continue;
    const from = new Date(order.paidAt ?? order.shippedAt ?? order.placedAt);
    for (const item of order.items) {
      const { product, variant } = lineItem(find, item.productId);
      if (!product?.warrantyYears) continue;
      const until = new Date(from);
      until.setFullYear(until.getFullYear() + product.warrantyYears);
      out.push({ key: `${order.orderName}:${item.productId}`, order, product, size: lineParts(variant).size, from, until });
    }
  }
  return out;
}

function CoverageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ماذا يشمل الضمان؟</DialogTitle>
          <DialogDescription>يغطي الضمان عيوب التصنيع طوال مدته المكتوبة على صفحة المرتبة، ويبدأ من يوم استلامها.</DialogDescription>
        </DialogHeader>
        <p className="text-[15px] text-muted-foreground">
          إن لاحظت عيباً، اطلب معاينة وسيتواصل معك فريق خدمة العملاء. الشروط الكاملة في{' '}
          <Link to={{ name: 'legal', page: 'terms' }} className="font-bold text-foreground underline underline-offset-4">
            الشروط والأحكام
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** «اشتريت من موزّع؟» - the invoice or label number goes to customer service as a warranty request. */
function RegisterBox() {
  const shop = useShop();
  const user = shop.auth.user;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  async function submit() {
    if (!user) return;
    if (code.trim().length < 3) return setError('أدخل رقم الفاتورة أو رقم الملصق.');
    setBusy(true);
    setError(null);
    try {
      const res = await api.createSupportTicket(
        { name: user.name, phone: user.phone ?? '', topic: 'warranty', message: `تسجيل ضمان مرتبة اشتُريت من موزّع.\nرقم الفاتورة أو الملصق: ${code.trim()}` },
        shop.auth.token
      );
      setRef(res.ref);
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال الطلب');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-image-bg p-6 lg:p-7">
      <ShieldCheck className="size-7 text-brand-text" strokeWidth={1.6} aria-hidden />
      <h2 className="text-lg font-bold">اشتريت من موزّع؟</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        أدخل رقم الفاتورة أو الرقم المطبوع على ملصق المرتبة لتسجيل الضمان.
      </p>
      {ref ? (
        <p role="status" className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            وصل طلبك برقم <bdi dir="ltr">{ref}</bdi>، وسيتواصل معك فريق خدمة العملاء لتأكيد التسجيل.
          </span>
        </p>
      ) : null}
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-2">
          <b className="text-sm">رقم الفاتورة أو الملصق</b>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            dir="ltr"
            aria-describedby={error ? 'warranty-error' : undefined}
            placeholder="INV/2026/…"
            className="h-[52px] rounded-lg border border-input bg-background px-4 text-end text-base outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {error ? (
          <p id="warranty-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="store" loading={busy}>
          تسجيل الضمان
        </Button>
      </form>
      <Link to={{ name: 'help' }} className="self-start text-sm font-bold underline underline-offset-4">
        العناية بالمرتبة
      </Link>
    </div>
  );
}

/**
 * الضمان (handoff WebWarranty): the mattresses delivered to the customer with
 * the day it started, the day it ends and whether it still runs; «اطلب
 * معاينة» opens the problem report. Bought from a dealer: register it by the
 * invoice or label number.
 */
export function WarrantyPage() {
  const shop = useShop();
  const { go } = useRouter();
  useTitle('الضمان');
  const { orders } = useMyOrders();
  const [coverage, setCoverage] = useState(false);
  const list = orders ? coveredMattresses(orders, shop.find) : null;
  const now = Date.now();

  return (
    <AccountLayout section="warranty" crumbs={[{ label: 'الضمان' }]}>
      <div className="flex flex-col gap-1 pb-6">
        <h1 className="font-display text-[28px] font-bold lg:text-[40px]">الضمان</h1>
        <span className="text-[15px] text-muted-foreground">مراتبك المسجّلة ومدة ضمان كل منها.</span>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          {!list ? (
            <Skeleton className="h-96" />
          ) : list.length ? (
            list.map((c) => {
              const tier = tierOf(c.product);
              const running = c.until.getTime() > now;
              return (
                <article key={c.key} className="overflow-hidden rounded-lg border border-border">
                  <img {...responsivePhoto(photoOf(c.product), '(min-width: 1024px) 400px, 100vw')} alt="" className="aspect-[2.1] w-full bg-image-bg object-cover" />
                  <div className="flex flex-col gap-2 p-5">
                    {tier ? <TierTag tier={tier} className="self-start" /> : null}
                    <b className="text-lg">
                      {displayName(c.product)} {c.size ? <SizeText>{c.size}</SizeText> : null}
                    </b>
                    <span className="text-sm text-muted-foreground">
                      {c.order.invoiceName ? (
                        <>
                          فاتورة <bdi dir="ltr">#{c.order.invoiceName}</bdi>
                        </>
                      ) : (
                        <>
                          طلب <bdi dir="ltr">#{c.order.orderName}</bdi>
                        </>
                      )}
                    </span>
                    <span className="flex justify-between text-sm">
                      <span className="text-muted-foreground">الشراء</span>
                      <span>{dayText(c.from)}</span>
                    </span>
                    <span className="flex justify-between text-sm">
                      <span className="text-muted-foreground">مضمونة حتى</span>
                      <b>{dayText(c.until)}</b>
                    </span>
                    <StatusDot tone={running ? 'success' : 'destructive'} className="font-bold">
                      {running ? 'الضمان ساري' : 'انتهى الضمان'}
                    </StatusDot>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {running ? (
                        <Button size="sm" className="h-11 px-5" onClick={() => go({ name: 'issue', orderName: c.order.orderName })}>
                          اطلب معاينة
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" className="h-11 px-5" onClick={() => setCoverage(true)}>
                        ماذا يشمل الضمان؟
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <EmptyState icon={<ShieldCheck />} title="لا توجد مراتب مسجّلة بعد" body="يُسجَّل ضمان المرتبة تلقائياً يوم استلامها." />
          )}
        </div>
        <RegisterBox />
      </div>
      <CoverageDialog open={coverage} onOpenChange={setCoverage} />
    </AccountLayout>
  );
}
