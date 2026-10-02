import type { ReactNode } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { MessageSquare, Minus, Phone, Plus, Store } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { trackContact } from '@/lib/pixel';

import { CONTACT, PLACEHOLDER, SHOWROOM, showroomHours, useWhatsAppDigits } from '../contact';
import { useTitle } from '../hooks';
import { Link } from '../router';
import { Container } from '../ui';
import { Breadcrumb } from './CategoryPage';

/**
 * The questions as the handoff lists them. Answers come from the shop's own
 * terms (../legal.ts); a bracketed one is still pending from the owner.
 */
const FAQ: { id: string; q: string; a: ReactNode }[] = [
  { id: 'delivery', q: 'كم يستغرق التوصيل؟', a: 'التوصيل مجاني إلى كل المدن. تختار اليوم والفترة عند إتمام الطلب، ويتصل بك السائق قبل الوصول.' },
  {
    id: 'firmness',
    q: 'كيف أختار صلابة المرتبة؟',
    a: (
      <>
        أجب عن أسئلة{' '}
        <Link to={{ name: 'quiz' }} className="font-bold text-brand-text underline underline-offset-4">
          ساعدني أختار
        </Link>{' '}
        لنقترح عليك المرتبة المناسبة، أو جرّب المراتب بنفسك في صالة العرض، {SHOWROOM.area}.
      </>
    ),
  },
  { id: 'warranty', q: 'ما الذي يشمله الضمان؟', a: 'يبدأ الضمان من تاريخ الشراء، ومدته حسب المرتبة كما تظهر في صفحتها وفي «الضمان» داخل حسابك. [ما لا يشمله الضمان].' },
  { id: 'cancel', q: 'هل يمكنني إلغاء الطلب؟', a: 'نعم، يمكنك إلغاء الطلب من حسابك حتى خروجه للتوصيل.' },
  { id: 'payment', q: 'ما طرق الدفع؟', a: 'الدفع عند الاستلام: نقداً أو ببطاقة مصرفية أو بحوالة مصرفية.' },
];

const CARD = 'flex flex-col gap-2.5 rounded-lg border border-border p-5 transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:p-7';

function Channel({ icon, title, line }: { icon: ReactNode; title: string; line: ReactNode }) {
  return (
    <>
      <span className="text-brand-text [&_svg]:size-7 lg:[&_svg]:size-8" aria-hidden>
        {icon}
      </span>
      <b className="text-[17px] lg:text-lg">{title}</b>
      <span className="text-[15px] text-muted-foreground">{line}</span>
    </>
  );
}

/** تواصل معنا (handoff WebSupport, /help): WhatsApp, a call, the showroom, the hours, then common questions. */
export function SupportPage() {
  useTitle('تواصل معنا');
  const whatsapp = useWhatsAppDigits();

  return (
    <Container className="pb-16 lg:pb-24">
      <Breadcrumb items={[{ label: 'تواصل معنا' }]} />
      <h1 className="font-display text-[28px] font-bold leading-tight lg:text-[40px]">تواصل معنا</h1>
      <p className="mb-6 mt-2.5 text-base text-muted-foreground lg:mb-8 lg:text-[17px]">فريق خدمة العملاء جاهز لمساعدتك في الاختيار والطلبات والضمان.</p>

      <div className="grid gap-3 sm:grid-cols-3 lg:gap-5">
        <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className={CARD} onClick={() => trackContact('whatsapp')}>
          <Channel icon={<MessageSquare strokeWidth={1.8} />} title="محادثة واتساب" line={`نرد عادةً خلال ${CONTACT.replyTime ?? PLACEHOLDER.replyTime}`} />
        </a>
        <a href={`tel:${CONTACT.phone.tel}`} className={CARD} onClick={() => trackContact('phone')}>
          <Channel icon={<Phone strokeWidth={1.8} />} title="اتصل بنا" line={<bdi dir="ltr">{CONTACT.phone.display}</bdi>} />
        </a>
        <Link to={{ name: 'showroom' }} className={CARD}>
          <Channel icon={<Store strokeWidth={1.8} />} title="زيارة صالة العرض" line={`${SHOWROOM.area} · ${SHOWROOM.city}`} />
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-3.5 bg-image-bg px-5 py-4 text-[15px] lg:mt-5 lg:px-6 lg:py-[18px]">
        <Store className="size-[22px] shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        <span>ساعات العمل: {showroomHours()}</span>
      </div>

      <div className="mt-12 grid gap-6 lg:mt-14 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
        <div className="flex flex-col items-start gap-3">
          <h2 className="text-2xl font-bold lg:text-[26px]">أسئلة شائعة</h2>
          <span className="text-[15px] leading-[1.7] text-muted-foreground">لديك طلب؟ تابع حالته أو أبلغ عن مشكلة من حسابك.</span>
          <Button asChild variant="outline" size="store">
            <Link to={{ name: 'account', section: 'orders' }}>طلباتي</Link>
          </Button>
        </div>

        <Accordion type="single" collapsible defaultValue={FAQ[0].id} className="border-t border-border lg:border-t-0">
          {FAQ.map((f) => (
            <AccordionItem key={f.id} value={f.id} className="border-border">
              <AccordionPrimitive.Header className="flex">
                <AccordionPrimitive.Trigger className="group flex flex-1 items-center justify-between gap-4 py-[18px] text-start text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {f.q}
                  <Plus className="size-5 shrink-0 group-data-[state=open]:hidden" strokeWidth={1.8} aria-hidden />
                  <Minus className="hidden size-5 shrink-0 group-data-[state=open]:block" strokeWidth={1.8} aria-hidden />
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionContent className="pb-[18px] text-[15px] leading-[1.7] text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Container>
  );
}
