import type { ReactNode } from 'react';
import { MapPin, Phone, ShoppingBasket, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { trackContact } from '@/lib/pixel';

import wave from '../assets/wave-pattern-white.png';
import showroomPhoto from '../assets/photos/sport-grey.jpg';
import { displayName } from '../catalog';
import { PLACEHOLDER, SHOWROOM, showroomHours, showroomMapsUrl, useContact } from '../contact';
import { useTitle } from '../hooks';
import { ProductCard } from '../ProductCard';
import { useShop } from '../state';
import { Container, Skeleton } from '../ui';

/** The four the handoff shows on the floor, one or two per tier; the best rated fill any that are missing. */
const ON_THE_FLOOR = ['ديلوكس', 'بالانس', 'هوتيل', 'كمفورت'];

function Fact({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 shrink-0 text-brand-text [&_svg]:size-7" aria-hidden>
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <b className="text-[17px]">{title}</b>
        <span className="text-[15px] leading-relaxed text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}

/**
 * صالة العرض (handoff WebShowroom, /showroom): «جرّب قبل أن تشتري», the
 * address, hours and phone, directions, and the mattresses on the floor.
 * Hours, the showroom's phone and its map are still pending from the owner
 * (../contact.ts) - the handoff's placeholders stand in for them.
 */
export function ShowroomPage() {
  const shop = useShop();
  useTitle('صالة العرض');

  const named = ON_THE_FLOOR.map((n) => shop.products.find((p) => displayName(p) === n)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const rest = [...shop.products].filter((p) => !named.includes(p)).sort((a, b) => (b.rating?.count ?? 0) - (a.rating?.count ?? 0));
  const floor = [...named, ...rest].slice(0, 4);
  const contact = useContact();
  const call = SHOWROOM.phone ?? contact.phone;

  return (
    <div className="flex flex-col pb-16 lg:pb-24">
      {/* ── Hero ── */}
      <Container className="lg:pt-7">
        <div className="-mx-4 grid lg:mx-0 lg:grid-cols-[1fr_1.3fr] lg:grid-rows-[440px]">
          <div className="relative order-2 flex flex-col justify-center gap-3 overflow-hidden bg-dark-ocean px-5 py-8 text-white lg:order-1 lg:gap-4 lg:p-12">
            <img src={wave} alt="" className="absolute inset-0 size-full object-cover opacity-[.12]" />
            <span className="relative text-sm font-bold text-porcelain">صالة بريماتكس</span>
            <h1 className="relative font-display text-[32px] font-bold leading-tight lg:text-[44px]">جرّب قبل أن تشتري</h1>
            <p className="relative text-base leading-[1.7] text-nebula lg:text-[17px]">جرّب النوم على المرتبة في الصالة قبل اختيارها.</p>
          </div>
          <div className="relative order-1 aspect-[4/3] min-w-0 overflow-hidden bg-image-bg lg:order-2 lg:aspect-auto">
            <img src={showroomPhoto} alt="مرتبة على سرير في غرفة نوم" className="absolute inset-0 size-full object-cover" />
          </div>
        </div>
      </Container>

      {/* ── Where and when ── */}
      <Container className="grid gap-8 pt-8 lg:grid-cols-2 lg:gap-10 lg:pt-12">
        <div className="flex flex-col gap-5">
          <Fact icon={<MapPin strokeWidth={1.8} />} title="العنوان">
            {contact.showroom}
          </Fact>
          <Fact icon={<Store strokeWidth={1.8} />} title="ساعات العمل">
            {showroomHours()}
          </Fact>
          <Fact icon={<Phone strokeWidth={1.8} />} title="الهاتف">
            {SHOWROOM.phone ? <bdi dir="ltr">{SHOWROOM.phone.display}</bdi> : PLACEHOLDER.phone}
          </Fact>
          <Fact icon={<ShoppingBasket strokeWidth={1.8} />} title="الدفع في الصالة">
            نقداً أو بالبطاقة
          </Fact>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="store">
              <a href={showroomMapsUrl()} target="_blank" rel="noopener noreferrer">
                الاتجاهات للصالة
              </a>
            </Button>
            <Button asChild variant="outline" size="store">
              <a href={`tel:${call.tel}`} onClick={() => trackContact('phone')}>
                اتصل بالصالة
              </a>
            </Button>
          </div>
        </div>
        {/* The map waits for the showroom's exact location. */}
        <div className="grid h-60 place-items-center bg-nebula text-[15px] font-bold text-dark-ocean dark:bg-image-bg dark:text-foreground lg:h-[360px]">[خريطة موقع الصالة]</div>
      </Container>

      {/* ── On the floor ── */}
      <Container className="pt-12">
        <h2 className="mb-5 text-2xl font-bold lg:text-[26px]">المعروض في الصالة</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
          {shop.loading && floor.length === 0
            ? [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="aspect-[15/16]" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/3" />
                </div>
              ))
            : floor.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </Container>
    </div>
  );
}
