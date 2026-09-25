import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BedDouble, Check, MessageCircle, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
 * "Which mattress suits you?": an intro, the four questions one card at a
 * time with a progress bar, then the recommendation with its specs, why it
 * suits you, and two alternatives. The questions and scoring are the iOS
 * app's own (lib/mattressQuiz.ts); this screen only displays them.
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
  const step = `سؤال ${current + 1} من ${QUESTIONS.length}`;

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

  return (
    // Bottom padding keeps the content clear of the phone's fixed action bar
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-6 md:px-6 md:pb-10 md:pt-10">
      {phase === 'intro' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center md:p-10">
            <span className="grid size-24 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <BedDouble className="size-12" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">شن المرتبة المناسبة ليك؟</h1>
            <p className="max-w-md leading-7 text-muted-foreground">
              {QUESTIONS.length} أسئلة بسيطة، وبنقترح عليك المرتبة الأقرب لنوم مريح فعلاً — بلا تعقيد ولا مبالغة.
            </p>
          </CardContent>
        </Card>
      )}

      {phase === 'quiz' && (
        <Card>
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{step}</p>
              {/* Radix fills the bar from the left; flipped so it grows from the start in RTL */}
              <Progress value={((current + 1) / QUESTIONS.length) * 100} aria-label={step} />
            </div>
            <h1 id="quiz-question" className="text-xl font-bold leading-8 tracking-tight md:text-2xl">
              {QUESTIONS[current].title}
            </h1>
          </CardHeader>
          <CardContent>
            <RadioGroup
              // Remounted per question so focus and ids start fresh
              key={current}
              dir="rtl"
              value={answers[current] === null ? '' : String(answers[current])}
              onValueChange={(v) => select(Number(v))}
              aria-labelledby="quiz-question"
              className="gap-3"
            >
              {QUESTIONS[current].options.map((option, i) => {
                const id = `quiz-${current}-${i}`;
                return (
                  <Label
                    key={option.label}
                    htmlFor={id}
                    className={cn(
                      'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-4 text-base font-normal leading-6 text-foreground transition-colors hover:bg-muted',
                      'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary has-[[data-state=checked]]:font-semibold',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
                    )}
                  >
                    <RadioGroupItem value={String(i)} id={id} className="size-5 shrink-0" />
                    <span className="flex-1 text-start">{option.label}</span>
                  </Label>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {phase === 'result' && ranked && top && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">النتيجة جاهزة</Badge>
              <Badge>{top.tier}</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{top.name}</h1>
            <p className="text-lg text-muted-foreground">{top.tagline}</p>
            <p className="leading-7">{top.desc}</p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">المواصفات</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                {top.specs.map(([key, value]) => (
                  <div key={key} className="rounded-md bg-muted/60 p-3">
                    <dt className="text-sm text-muted-foreground">{key}</dt>
                    <dd className="mt-0.5 font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{`ليش ${top.name} مناسبة ليك`}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {top.why.map((reason) => (
                  <li key={reason} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                    <p className="flex-1 leading-6">{reason}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="text-xl font-bold">خيارات بديلة تقدر تشوفها</h2>
            {[ranked[1], ranked[2]].map((id) => (
              <Alternative key={id} id={id} product={productsReady ? findCatalogProduct(LINES[id], products) : undefined} onOpen={onOpen} />
            ))}
          </section>

          <Button variant="ghost" onClick={restart} className="w-full text-muted-foreground">
            <RotateCcw /> إعادة الاختبار من جديد
          </Button>
        </div>
      )}

      {/* Phones: a bar fixed at the bottom; larger screens: the buttons in the flow */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        {phase === 'intro' ? (
          <Button size="lg" onClick={() => setPhase('quiz')} className="w-full">
            ابدأ الاختبار <ArrowLeft />
          </Button>
        ) : phase === 'quiz' ? (
          <div className="flex gap-3">
            {current > 0 && (
              <Button size="lg" variant="outline" onClick={back}>
                <ArrowRight /> رجوع
              </Button>
            )}
            <Button size="lg" onClick={next} disabled={answers[current] === null} className="flex-1">
              {last ? 'شوف النتيجة' : 'التالي'} <ArrowLeft />
            </Button>
          </div>
        ) : !top ? null : !productsReady ? (
          <Button size="lg" disabled className="w-full">
            …
          </Button>
        ) : topProduct ? (
          <Button size="lg" variant="accent" onClick={() => onOpen(topProduct)} className="w-full">
            اطلب {top.name} الآن
          </Button>
        ) : (
          // Not in the catalogue yet: ask customer care about it by name.
          <Button
            size="lg"
            onClick={() => openSupport({ message: `أرغب في مرتبة ${top.name} (ترشيح اختبار اختيار المرتبة).\n` })}
            className="w-full"
          >
            <MessageCircle /> اسأل عن {top.name}
          </Button>
        )}
      </div>
    </div>
  );
}

/** An alternative line - clickable only when there is a product for it to open. */
function Alternative({ id, product, onOpen }: { id: LineId; product?: Product; onOpen: (product: Product) => void }) {
  const line = LINES[id];
  // Spans only: a button may hold phrasing content, not a Card's divs
  const body = (
    <>
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{line.name}</span>
          <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{line.tier}</span>
        </span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{line.tagline}</span>
      </span>
      {product && <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" aria-hidden="true" />}
    </>
  );
  // The Card's own look, so the clickable and the static rows match
  const row = 'flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-start text-card-foreground shadow-sm';
  return product ? (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className={cn(row, 'group transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
    >
      {body}
    </button>
  ) : (
    <div className={row}>{body}</div>
  );
}
