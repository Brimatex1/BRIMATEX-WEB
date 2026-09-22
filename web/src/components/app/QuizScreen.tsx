import { useMemo, useState } from 'react';
import { BedDouble, Check, ChevronLeft } from 'lucide-react';

import { AppCard, Pill, SectionTitle, StickyBar } from '@/components/app/ui';
import {
  LINES,
  QUESTIONS,
  findCatalogProduct,
  rankLines,
  type Answers,
  type LineId,
} from '@/lib/mattressQuiz';
import { openSupport } from '@/lib/support';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

type Phase = 'intro' | 'quiz' | 'result';

const emptyAnswers = (): Answers => new Array(QUESTIONS.length).fill(null);

interface QuizScreenProps {
  products: Product[];
  /** False until the catalogue has loaded - "order" vs "ask" is not decided before. */
  productsReady: boolean;
  onOpen: (product: Product) => void;
}

/**
 * "Which mattress suits you?" - the iOS app's quiz screen (brimatex-ios/src/
 * screens/QuizScreen.tsx): an intro, the four questions with progress dots
 * and choice rows, then the recommendation with its specs, why it suits you,
 * and two alternatives. The questions and scoring are the app's own
 * (lib/mattressQuiz.ts); this screen only displays them.
 *
 * A recommended line that is in the catalogue opens its product; one that is
 * not yet opens customer care under its name - never an "order" button that
 * leads nowhere.
 */
export function QuizScreen({ products, productsReady, onOpen }: QuizScreenProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);

  const ranked = useMemo(() => (phase === 'result' ? rankLines(answers) : null), [phase, answers]);
  const top = ranked ? LINES[ranked[0]] : null;
  const topProduct = top && productsReady ? findCatalogProduct(top, products) : undefined;
  const last = current === QUESTIONS.length - 1;

  const toTop = () => window.scrollTo({ top: 0 });

  function select(index: number) {
    setAnswers((prev) => prev.map((a, i) => (i === current ? index : a)));
  }
  function next() {
    if (answers[current] === null) return;
    if (last) setPhase('result');
    else setCurrent(current + 1);
    toTop();
  }
  function back() {
    setCurrent((c) => Math.max(0, c - 1));
    toTop();
  }
  function restart() {
    setAnswers(emptyAnswers());
    setCurrent(0);
    setPhase('intro');
    toTop();
  }

  const primary = 'w-full rounded-full bg-app-ocean py-4 text-[17px] font-semibold text-white disabled:opacity-45';

  return (
    // Bottom padding keeps the content clear of the fixed action bar (phones)
    <div className="mx-auto max-w-2xl px-5 pb-32 pt-5 md:px-8 md:pb-16 md:pt-10">
      {phase === 'intro' && (
        <div>
          <div className="mb-7 grid h-[220px] place-items-center rounded-[28px] bg-[#e3f2fd]">
            <BedDouble className="size-24 text-app-ocean" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="text-[26px] font-bold text-app-text">شن المرتبة المناسبة ليك؟</h2>
          <p className="mt-3 text-[17px] leading-[30px] text-app-text">
            {QUESTIONS.length} أسئلة بسيطة، وبنقترح عليك المرتبة الأقرب لنوم مريح فعلاً — بلا تعقيد ولا مبالغة.
          </p>
        </div>
      )}

      {phase === 'quiz' && (
        <div>
          <div className="mb-7 flex items-center justify-between">
            <p className="text-base font-medium text-app-muted">
              سؤال {current + 1} من {QUESTIONS.length}
            </p>
            <div className="flex gap-2" aria-hidden="true">
              {QUESTIONS.map((_, i) => (
                <span key={i} className={cn('size-5 rounded-full', i === current ? 'bg-app-ocean' : 'bg-app-tint')} />
              ))}
            </div>
          </div>
          <h2 className="mb-3 text-[28px] font-bold leading-10 text-app-text">{QUESTIONS[current].title}</h2>
          <div role="radiogroup" aria-label={QUESTIONS[current].title}>
            {QUESTIONS[current].options.map((option, i) => {
              const checked = answers[current] === i;
              return (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => select(i)}
                  className={cn(
                    'mt-3 flex min-h-[60px] w-full items-center gap-3 rounded-[14px] p-4 text-start active:opacity-85',
                    checked ? 'bg-app-tint' : 'bg-app-tint-soft'
                  )}
                >
                  <span className={cn('grid size-[26px] shrink-0 place-items-center rounded-full', checked ? 'bg-app-ocean' : 'bg-white')}>
                    {checked && <Check className="size-4 text-white" aria-hidden="true" />}
                  </span>
                  <span className={cn('flex-1 text-[17px] leading-[26px] text-app-text', checked && 'font-semibold')}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase === 'result' && ranked && top && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Pill tone="success">النتيجة جاهزة</Pill>
            <span className="rounded-full bg-app-ocean px-4 py-1.5 text-sm font-medium text-white">{top.tier}</span>
          </div>
          <h2 className="text-[26px] font-bold text-app-text">{top.name}</h2>
          <p className="mt-1 text-[17px] text-app-muted">{top.tagline}</p>
          <p className="mb-5 mt-4 text-base leading-7 text-app-text">{top.desc}</p>

          <AppCard className="mb-4">
            <SectionTitle>المواصفات</SectionTitle>
            <dl className="grid grid-cols-2 gap-4">
              {top.specs.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-sm text-app-muted">{key}</dt>
                  <dd className="mt-0.5 text-base font-semibold text-app-text">{value}</dd>
                </div>
              ))}
            </dl>
          </AppCard>

          <AppCard className="mb-4">
            <SectionTitle>{`ليش ${top.name} مناسبة ليك`}</SectionTitle>
            {top.why.map((reason, i) => (
              <div key={reason} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t border-app-divider')}>
                <p className="flex-1 text-base leading-6 text-app-text">{reason}</p>
                <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-app-success-bg">
                  <Check className="size-[15px] text-app-success" aria-hidden="true" />
                </span>
              </div>
            ))}
          </AppCard>

          <div className="mt-3">
            <SectionTitle>خيارات بديلة تقدر تشوفها</SectionTitle>
          </div>
          {[ranked[1], ranked[2]].map((id) => (
            <Alternative key={id} id={id} product={productsReady ? findCatalogProduct(LINES[id], products) : undefined} onOpen={onOpen} />
          ))}

          <button type="button" onClick={restart} className="mt-5 w-full text-center text-base text-app-muted underline-offset-4 hover:underline">
            إعادة الاختبار من جديد
          </button>
        </div>
      )}

      <StickyBar>
        {phase === 'intro' ? (
          <button type="button" onClick={() => setPhase('quiz')} className={primary}>
            ابدأ الاختبار
          </button>
        ) : phase === 'quiz' ? (
          <div className="flex gap-3">
            {current > 0 && (
              <button type="button" onClick={back} className="rounded-full px-6 py-4 text-[17px] font-semibold text-app-ocean">
                رجوع
              </button>
            )}
            <button type="button" onClick={next} disabled={answers[current] === null} className={cn(primary, 'flex-1')}>
              {last ? 'شوف النتيجة' : 'التالي'}
            </button>
          </div>
        ) : !top ? null : !productsReady ? (
          <button type="button" disabled className={primary}>
            …
          </button>
        ) : topProduct ? (
          <button type="button" onClick={() => onOpen(topProduct)} className={primary}>
            اطلب {top.name} الآن
          </button>
        ) : (
          // Not in the catalogue yet: ask customer care about it by name.
          <button
            type="button"
            onClick={() => openSupport({ message: `أرغب في مرتبة ${top.name} (ترشيح اختبار اختيار المرتبة).\n` })}
            className={primary}
          >
            اسأل عن {top.name}
          </button>
        )}
      </StickyBar>
    </div>
  );
}

/** An alternative line - tappable only when there is a product for it to open. */
function Alternative({ id, product, onOpen }: { id: LineId; product?: Product; onOpen: (product: Product) => void }) {
  const line = LINES[id];
  const body = (
    <>
      <span className="flex-1">
        <span className="block text-[17px] font-semibold text-app-text">
          {line.name} <span className="text-sm font-normal text-app-muted">· {line.tier}</span>
        </span>
        <span className="mt-0.5 block text-sm leading-[21px] text-app-muted">{line.tagline}</span>
      </span>
      {product && (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-app-ocean">
          <ChevronLeft className="size-[18px]" aria-hidden="true" />
        </span>
      )}
    </>
  );
  const row = 'mt-3 flex min-h-[60px] w-full items-center gap-3 rounded-[14px] bg-app-tint-soft p-4 text-start';
  return product ? (
    <button type="button" onClick={() => onOpen(product)} className={cn(row, 'active:opacity-85')}>
      {body}
    </button>
  ) : (
    <div className={row}>{body}</div>
  );
}
