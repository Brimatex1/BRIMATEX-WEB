import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { displayName, lineParts } from '../catalog';
import { useTitle } from '../hooks';
import { formatPoints, Minus, PointsIcon, pointsFor } from '../loyalty';
import { photoOf } from '../ProductCard';
import { Link } from '../router';
import { lineItem, useShop } from '../state';
import { AFTER_MARK, Container, Price, SizeText, SuccessMark } from '../ui';
import { SummaryRow } from './CartPage';
import { LAST_ORDER_KEY, type PlacedOrder } from './CheckoutPage';

function readPlaced(order: string): PlacedOrder | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY) || 'null') as PlacedOrder | null;
    return p && p.orderName === order ? p : null;
  } catch {
    return null;
  }
}

/**
 * تم الطلب (handoff WebConfirmed): «استلمنا طلبك», track it or keep shopping,
 * and the order's summary. Opened again later, it reads the order from the
 * customer's own orders - nobody else's.
 */
export function ConfirmedPage({ order }: { order: string }) {
  const shop = useShop();
  useTitle('تم الطلب');
  const [placed, setPlaced] = useState<PlacedOrder | null>(() => readPlaced(order));
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (placed || !shop.auth.token) return;
    api
      .getOrders(shop.auth.token)
      .then(({ orders }) => {
        const o = orders.find((x) => x.orderName === order);
        if (!o) return setMissing(true);
        setPlaced({
          orderName: o.orderName,
          total: o.total,
          when: o.deliveryText ?? (o.method === 'pickup' ? 'استلام من الصالة' : ''),
          address: o.method === 'pickup' ? 'صالة العرض · حي الأندلس' : `${o.city} · ${o.address.split('،')[0]}`,
          payment: o.paymentText ? `${o.paymentText} عند الاستلام` : 'عند الاستلام',
          phone: shop.auth.user?.phone ?? '',
          lines: o.items.map((i) => ({ productId: i.productId, quantity: i.quantity, price: 0 })),
        });
      })
      .catch(() => setMissing(true));
  }, [placed, order, shop.auth.token, shop.auth.user?.phone]);

  // The loyalty add-on: what this order will earn once delivered (hidden while the program says nothing).
  const willEarn = placed ? pointsFor(placed.total, shop.loyalty.info) : null;

  if (!placed) {
    return (
      <Container className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-lg font-bold">{missing || (!shop.auth.checking && !shop.auth.user) ? 'لم نجد هذا الطلب في حسابك.' : 'جارٍ التحميل…'}</p>
        <Button asChild variant="outline" size="store">
          <Link to={{ name: 'account', section: 'orders' }}>طلباتي</Link>
        </Button>
      </Container>
    );
  }

  return (
    <Container className="grid gap-10 py-10 lg:grid-cols-[1fr_440px] lg:gap-16 lg:py-16">
      <div className="flex flex-col items-start gap-5">
        <SuccessMark />
        <h1 className={cn('font-display text-[28px] font-bold lg:text-[40px]', AFTER_MARK)}>استلمنا طلبك</h1>
        <p className={cn('text-base leading-relaxed text-muted-foreground lg:text-lg', AFTER_MARK)}>سنُعلمك عند تجهيز المراتب وخروجها للتوصيل. يتصل بك السائق قبل الوصول.</p>
        <div className={cn('flex flex-wrap gap-3', AFTER_MARK)}>
          <Button asChild size="store">
            <Link to={{ name: 'order', orderName: placed.orderName }}>تتبّع الطلب</Link>
          </Button>
          <Button asChild variant="outline" size="store">
            <Link to={{ name: 'home' }}>متابعة التسوّق</Link>
          </Button>
        </div>
        {willEarn ? (
          <p className={cn('flex items-center gap-3 self-stretch bg-image-bg px-4 py-3.5 text-[15px] sm:self-start', AFTER_MARK)}>
            <PointsIcon className="text-brand-text" />
            <span>
              ستحصل على{' '}
              <b>
                <bdi dir="ltr" className="tabular-nums">
                  {formatPoints(willEarn)}
                </bdi>{' '}
                نقطة
              </b>{' '}
              بعد استلام طلبك.
            </span>
          </p>
        ) : null}
        {/* The handoff says «أرسلنا تفاصيل الطلب في رسالة» - no message is sent on the live shop yet, so it says where the order is. */}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden />
          تجد طلبك وحالته في «طلباتي» في حسابك.
        </p>
      </div>

      <div className="flex h-fit flex-col gap-3 rounded-lg border border-border p-6">
        <b className="text-lg">ملخّص الطلب</b>
        <SummaryRow label="رقم الطلب" value={<bdi dir="ltr">#{placed.orderName}</bdi>} />
        {placed.when ? <SummaryRow label="الموعد" value={placed.when} /> : null}
        <SummaryRow label="العنوان" value={placed.address} />
        <SummaryRow label="الدفع" value={placed.payment} />
        <div className="my-2 flex flex-col gap-3 border-t border-border pt-4">
          {placed.lines.map((l) => {
            const { product, variant } = lineItem(shop.find, l.productId);
            const parts = lineParts(variant);
            return (
              <div key={l.productId} className="flex items-center gap-3">
                {product ? <img src={photoOf(product)} alt="" className="size-14 shrink-0 bg-image-bg object-cover" /> : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-sm">{product ? displayName(product) : `#${l.productId}`}</b>
                  <span className="text-xs text-muted-foreground">
                    {parts.size ? (
                      <>
                        <SizeText>{parts.size}</SizeText> سم ·{' '}
                      </>
                    ) : null}
                    {parts.height ? `ارتفاع ${parts.height} سم · ` : ''}الكمية {l.quantity}
                  </span>
                </span>
                {l.price ? <Price amount={l.price * l.quantity} size="row" className="text-sm" /> : null}
              </div>
            );
          })}
        </div>
        {placed.discount ? (
          <div className="text-success">
            <SummaryRow label={placed.discount.label} value={<Minus amount={placed.discount.amount} />} />
          </div>
        ) : null}
        <SummaryRow strong label="الإجمالي" value={<Price amount={placed.total} />} />
      </div>
    </Container>
  );
}
