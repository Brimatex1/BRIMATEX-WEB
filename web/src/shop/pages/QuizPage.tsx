import { useEffect, useMemo, useRef, useState } from 'react';
import { Baby, BedDouble, BedSingle, BrickWall, CircleHelp, Feather, Layers, Sofa, User, Users, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { displayName, parseSize, sizeText, tierOf } from '../catalog';
import { useTitle } from '../hooks';
import { photoOf } from '../ProductCard';
import { QUESTIONS, chipFor, recommend, type AnswerKey, type QuizAnswers, type QuizPick } from '../quiz';
import { Link, useRouter } from '../router';
import { useShop } from '../state';
import { Container, EmptyState, Price, Skeleton, SizeText, TierTag } from '../ui';

/** One icon per option card (the handoff draws a bed on each). */
const ICONS: Record<AnswerKey, LucideIcon> = {
  single: User,
  couple: Users,
  child: Baby,
  guest: Sofa,
  side: BedSingle,
  back: BedSingle,
  stomach: BedSingle,
  restless: BedDouble,
  soft: Feather,
  medium: Layers,
  firm: BrickWall,
  unsure: CircleHelp,
};

type Draft = Partial<QuizAnswers>;

/** /product/12?size=180x200&height=28 - the product page opens on the suggested size. */
function productHref(pick: QuizPick): string {
  const p = parseSize(pick.variant);
  const query = p.width !== null ? `?size=${p.width}x${p.length}${p.height ? `&height=${p.height}` : ''}` : '';
  return `/product/${pick.product.id}${query}`;
}

/**
 * ساعدني أختار (handoff WebQuiz, WebQuizResult): three questions, one per step,
 * with a progress bar; then the best match with a line on why, «أضف … إلى
 * السلة», «جرّبها في الصالة» and one alternative. The answers live in this
 * page's state only; the matching rules are in ../quiz.ts.
 */
export function QuizPage() {
  useTitle('ساعدني أختار');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Draft>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // A new step moves focus to its question, so a screen reader hears it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const done = step >= QUESTIONS.length;

  function restart() {
    setAnswers({});
    setStep(0);
  }

  if (done) return <Result answers={answers as QuizAnswers} onRestart={restart} headingRef={heading} />;

  const question = QUESTIONS[step];
  const chosen = answers[question.id];
  const last = step === QUESTIONS.length - 1;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-[22px] px-4 pb-16 pt-8 lg:px-10 lg:pt-14">
      <div className="flex items-center gap-4">
        <span
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="التقدّم في الأسئلة"
          aria-valuemin={1}
          aria-valuemax={QUESTIONS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`السؤال ${step + 1} من ${QUESTIONS.length}`}
        >
          <span className="block h-full rounded-full bg-primary transition-[width] duration-base ease-out-strong" style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {step + 1} من {QUESTIONS.length}
        </span>
      </div>

      {/* A new question comes in from below (static under reduced motion). */}
      <div key={question.id} className="flex animate-fade-up flex-col gap-[22px] motion-reduce:animate-none">
        <div className="flex flex-col gap-2">
          <h2 ref={heading} tabIndex={-1} className="font-display text-[28px] font-bold leading-tight focus:outline-none lg:text-[40px]">
            {question.title}
          </h2>
          <p className="text-[15px] text-muted-foreground lg:text-[17px]">{question.hint}</p>
        </div>

        <div role="radiogroup" aria-label={question.title} className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5">
          {question.options.map((o) => {
            const Icon = ICONS[o.key];
            const selected = chosen === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAnswers((a) => ({ ...a, [question.id]: o.key }))}
                className={cn(
                  'flex h-[120px] flex-col items-center justify-center gap-3 rounded-lg border px-2 text-center text-base font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-40 lg:gap-3.5 lg:text-[17px]',
                  selected ? 'border-foreground bg-image-bg shadow-[inset_0_0_0_1px_hsl(var(--foreground))]' : 'border-border hover:border-foreground'
                )}
              >
                <Icon className="size-9 text-brand-text lg:size-11" strokeWidth={1.6} aria-hidden />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="outline" size="store" onClick={() => setStep((s) => s - 1)}>
            السابق
          </Button>
        ) : (
          <span />
        )}
        <Button size="store" className="px-12" disabled={!chosen} onClick={() => setStep((s) => s + 1)}>
          {last ? 'اعرض اقتراحنا' : 'التالي'}
        </Button>
      </div>
    </div>
  );
}

function Result({ answers, onRestart, headingRef }: { answers: QuizAnswers; onRestart: () => void; headingRef: React.RefObject<HTMLHeadingElement> }) {
  const shop = useShop();
  const { go } = useRouter();
  const result = useMemo(() => recommend(answers, shop.products), [answers, shop.products]);
  const { best, alternative, reason } = result;

  const header = (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-3">
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-[28px] font-bold leading-tight focus:outline-none lg:text-[40px]">
          اقتراحنا لك
        </h2>
        <ul className="flex flex-wrap gap-2" aria-label="إجاباتك">
          {QUESTIONS.map((q) => (
            <li key={q.id} className="inline-flex h-9 items-center rounded-full bg-image-bg px-3.5 text-sm font-semibold">
              {chipFor(answers[q.id])}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onRestart} className="text-[15px] font-bold underline underline-offset-4 hover:text-brand-text">
        إعادة الاختبار
      </button>
    </div>
  );

  if (!best) {
    if (shop.loading) {
      return (
        <Container className="pb-16 pt-8 lg:pt-12">
          {header}
          <div className="grid border-2 border-border lg:grid-cols-[1fr_1.4fr]">
            <div className="flex flex-col gap-4 p-6 lg:p-10">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-12" />
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-[54px] rounded-full" />
            </div>
            <Skeleton className="aspect-[4/3] lg:order-last lg:aspect-auto lg:h-[460px]" />
          </div>
        </Container>
      );
    }
    return (
      <Container className="pb-16 pt-8 lg:pt-12">
        {header}
        {shop.error ? (
          <EmptyState icon={<BedDouble />} title="تعذّر تحميل المراتب" body="تحقّق من اتصالك ثم حاول مرة أخرى." action="إعادة المحاولة" onAction={() => void shop.reload()} />
        ) : (
          <EmptyState icon={<BedDouble />} title="لا توجد مرتبة متوفّرة لهذه الإجابات الآن" body="تصفّح كل المراتب، أو زر صالة العرض لتجربتها بنفسك." action="كل المراتب" onAction={() => go({ name: 'category', tier: null })} />
        )}
      </Container>
    );
  }

  const name = displayName(best.product);
  const tier = tierOf(best.product);
  const size = parseSize(best.variant);

  return (
    <Container className="pb-16 pt-8 lg:pt-12">
      {header}

      <div className="grid animate-fade-up border-2 border-foreground motion-reduce:animate-none lg:grid-cols-[1fr_1.4fr]">
        <div className="relative aspect-[4/3] min-w-0 overflow-hidden bg-image-bg lg:order-last lg:aspect-auto lg:h-full lg:min-h-[460px]">
          <img src={photoOf(best.product)} alt={`مرتبة ${name}`} className="absolute inset-0 size-full object-cover" />
        </div>
        <div className="flex flex-col justify-center gap-3.5 p-5 sm:p-8 lg:p-10">
          <span className="text-sm font-bold text-success">الأنسب لك</span>
          {tier ? <TierTag tier={tier} className="self-start" /> : null}
          <h3 className="font-display text-[28px] font-bold leading-tight lg:text-[34px]">{name}</h3>
          {reason ? <p className="text-[15px] leading-relaxed text-muted-foreground lg:text-base">{reason}</p> : null}
          <div className="flex flex-col gap-1.5">
            <Price amount={best.variant.price} size="page" />
            {size.width !== null ? (
              <span className="text-[13px] text-muted-foreground">
                مقاس <SizeText>{sizeText(size)}</SizeText> سم{size.height !== null ? ` · ارتفاع ${size.height} سم` : ''}
              </span>
            ) : null}
          </div>
          <Button size="store" className="mt-2 h-[54px] w-full" onClick={() => shop.addToCart(best.product, best.variant)}>
            أضف {name} إلى السلة
          </Button>
          <Button asChild variant="outline" size="store" className="w-full">
            <Link to={{ name: 'showroom' }}>جرّبها في الصالة</Link>
          </Button>
          <Link to={productHref(best)} className="self-start text-sm font-bold text-brand-text underline underline-offset-4">
            تفاصيل المرتبة
          </Link>
        </div>
      </div>

      {alternative ? (
        <section className="mt-10">
          <h2 className="mb-4 text-[21px] font-bold lg:text-[22px]">خيار آخر</h2>
          <AlternativeRow pick={alternative} />
        </section>
      ) : null}
    </Container>
  );
}

function AlternativeRow({ pick }: { pick: QuizPick }) {
  const tier = tierOf(pick.product);
  const height = parseSize(pick.variant).height;
  const name = displayName(pick.product);
  return (
    <Link
      to={productHref(pick)}
      className="flex max-w-[640px] items-center gap-4 border border-border p-3 transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-5 sm:p-4"
    >
      <span className="h-[72px] w-24 shrink-0 overflow-hidden bg-image-bg sm:h-[90px] sm:w-[120px]">
        <img src={photoOf(pick.product)} alt="" loading="lazy" className="size-full object-cover" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <b className="text-[15px] sm:text-base">
          {name}
          {height !== null ? ` · ${height} سم` : ''}
        </b>
        {pick.product.tagline ? <span className="truncate text-[13px] text-muted-foreground">{pick.product.tagline}</span> : null}
        {tier ? <TierTag tier={tier} className="self-start" /> : null}
      </span>
      <Price amount={pick.variant.price} size="card" className="shrink-0" />
    </Link>
  );
}
