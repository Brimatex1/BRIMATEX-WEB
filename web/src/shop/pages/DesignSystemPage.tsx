import { useState } from 'react';
import { Heart, ShoppingBasket } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { ProductCard } from '../ProductCard';
import { useShop } from '../state';
import { Container, DiscountPrice, EmptyState, Price, QuantityStepper, RatingStars, Skeleton, StatusDot, TierTag } from '../ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-border py-8">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** /dev/ds - the storefront's parts side by side, to check against the handoff. Development builds only. */
export function DesignSystemPage() {
  const shop = useShop();
  const [qty, setQty] = useState(1);
  return (
    <Container className="pb-16">
      <h1 className="pt-10 font-display text-[28px] font-bold lg:text-[40px]">نظام التصميم</h1>

      <Section title="الأزرار">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="xl">
            <ShoppingBasket /> أضف إلى السلة
          </Button>
          <Button size="store">إتمام الطلب</Button>
          <Button size="store" variant="outline">
            متابعة التسوّق
          </Button>
          <Button size="store" variant="link">
            عرض الكل
          </Button>
          <Button size="store" disabled>
            غير متاح
          </Button>
          <Button size="store" loading>
            جارٍ الإرسال
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 bg-dark-ocean p-6">
          <Button size="store" variant="inverse">
            تسوّق بالانس
          </Button>
          <Button size="store" variant="inverse-outline">
            كل المراتب
          </Button>
        </div>
      </Section>

      <Section title="الفئات والحالة">
        <div className="flex flex-wrap items-center gap-3">
          <TierTag tier="elite" />
          <TierTag tier="premium" />
          <TierTag tier="comfort" />
        </div>
        <div className="flex flex-wrap gap-5">
          <StatusDot tone="success">متوفّر للتوصيل</StatusDot>
          <StatusDot tone="warning">قيد التجهيز</StatusDot>
          <StatusDot tone="info">خرج للتوصيل</StatusDot>
          <StatusDot tone="destructive">نفد</StatusDot>
        </div>
      </Section>

      <Section title="الأسعار والتقييم">
        <div className="flex flex-wrap items-end gap-10">
          <Price amount={2515} size="page" />
          <Price amount={1105} />
          <DiscountPrice amount={1990} was={2515} />
          <RatingStars average={4.5} count={12} />
          <QuantityStepper value={qty} onChange={setQty} label="بالانس" />
        </div>
      </Section>

      <Section title="بطاقات المراتب">
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">
          {shop.loading
            ? [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="aspect-square" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/3" />
                </div>
              ))
            : shop.products.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </Section>

      <Section title="حالة فارغة">
        <EmptyState icon={<Heart />} title="قائمة المفضّلة فارغة" body="اضغط على القلب في أي مرتبة لحفظها هنا والرجوع إليها لاحقاً." action="تصفّح المراتب" />
      </Section>
    </Container>
  );
}
