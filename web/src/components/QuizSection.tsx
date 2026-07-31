import { useMemo, useState } from 'react';
import { ArrowRight, RotateCcw, Sparkles } from 'lucide-react';

import { ProductVisual } from '@/components/ProductVisual';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';
import type { Product } from '@/types';

type QuestionId = 'position' | 'feel' | 'width' | 'budget';

interface Choice {
  value: string;
  label: string;
  hint?: string;
}

const QUESTIONS: { id: QuestionId; title: string; choices: Choice[] }[] = [
  {
    id: 'position',
    title: 'كيف تنام غالباً؟',
    choices: [
      { value: 'side', label: 'على الجنب', hint: 'يحتاج ليونة عند الكتف والحوض' },
      { value: 'back', label: 'على الظهر', hint: 'يحتاج دعماً متوازناً' },
      { value: 'front', label: 'على البطن', hint: 'يحتاج سطحاً أكثر صلابة' },
      { value: 'mixed', label: 'أتقلّب كثيراً' },
    ],
  },
  {
    id: 'feel',
    title: 'أي إحساس تفضّل؟',
    choices: [
      { value: 'soft', label: 'طرية' },
      { value: 'medium', label: 'متوسطة' },
      { value: 'firm', label: 'صلبة' },
    ],
  },
  {
    id: 'width',
    title: 'لمن السرير؟',
    choices: [
      { value: 'single', label: 'شخص واحد', hint: 'مقاس فردي' },
      { value: 'couple', label: 'شخصان', hint: 'مقاس مزدوج أو أكبر' },
    ],
  },
  {
    id: 'budget',
    title: 'ما ميزانيتك تقريباً؟',
    choices: [
      { value: 'low', label: 'أقل من 2000 ر.س' },
      { value: 'mid', label: '2000 – 3000 ر.س' },
      { value: 'high', label: 'المهم الأفضل' },
    ],
  },
];

/** Firmness the answers point at, on the catalogue's 1–10 scale. */
function targetFirmness(answers: Partial<Record<QuestionId, string>>): number {
  let target = 5;
  if (answers.position === 'side') target -= 1.5;
  if (answers.position === 'front') target += 2;
  if (answers.position === 'back') target += 0.5;

  if (answers.feel === 'soft') target -= 2;
  if (answers.feel === 'firm') target += 2;
  return Math.min(10, Math.max(1, target));
}

interface Scored {
  product: Product;
  score: number;
  reasons: string[];
}

function recommend(products: Product[], answers: Partial<Record<QuestionId, string>>): Scored[] {
  const mattresses = products.filter((p) => p.category === 'mattress');
  const target = targetFirmness(answers);

  return mattresses
    .map((product) => {
      const reasons: string[] = [];
      let score = 100;

      // Firmness match dominates — it is what the sleeper actually feels.
      const level = product.specs?.firmnessLevel;
      if (typeof level === 'number') {
        const gap = Math.abs(level - target);
        score -= gap * 12;
        if (gap <= 1) reasons.push(`درجة الصلابة تطابق ما يناسب نومك (${product.specs?.firmness})`);
      }

      // Width: a couple on a 90cm bed is a bad recommendation regardless of feel.
      const width = product.size?.width ?? 0;
      if (answers.width === 'couple') {
        if (width >= 150) reasons.push(`عرض ${width} سم يكفي لشخصين براحة`);
        else score -= 40;
      } else if (answers.width === 'single') {
        if (width <= 120) reasons.push(`عرض ${width} سم مناسب لشخص واحد`);
        else score -= 12;
      }

      if (answers.budget === 'low') {
        if (product.price < 2000) reasons.push('ضمن ميزانيتك');
        else score -= 30;
      } else if (answers.budget === 'mid') {
        if (product.price >= 2000 && product.price <= 3000) reasons.push('ضمن ميزانيتك');
        else score -= 18;
      } else if (answers.budget === 'high') {
        score += product.price / 400;
      }

      if (answers.position === 'mixed' && /نوابض مغلّفة/.test(product.specs?.material ?? '')) {
        reasons.push('نوابض مغلّفة تقلل إزعاج التقلّب');
      }

      return { product, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

interface QuizSectionProps {
  products: Product[];
  onAdd: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
  onBrowseAll: () => void;
}

export function QuizSection({ products, onAdd, onOpenProduct, onBrowseAll }: QuizSectionProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<QuestionId, string>>>({});

  const done = step >= QUESTIONS.length;
  const ranked = useMemo(
    () => (done ? recommend(products, answers) : []),
    [done, products, answers]
  );

  function choose(id: QuestionId, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setStep((s) => s + 1);
  }

  function restart() {
    setAnswers({});
    setStep(0);
  }

  if (done) {
    const best = ranked[0];
    const alternatives = ranked.slice(1, 3);

    if (!best) {
      return (
        <section className="container max-w-2xl animate-fade-up py-16 text-center">
          <p className="text-muted-foreground">لا توجد مراتب متاحة للترشيح حالياً.</p>
          <Button className="mt-6" onClick={onBrowseAll}>
            تصفّح المجموعة
          </Button>
        </section>
      );
    }

    return (
      <section className="container max-w-4xl animate-fade-up py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">ترشيحنا لك</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold text-primary">
          {best.product.name}
        </h1>

        <div className="mt-8 grid gap-8 md:grid-cols-[1.1fr_1fr]">
          <ProductVisual product={best.product} variant="hero" />

          <div>
            {best.product.tagline && <p className="text-accent">{best.product.tagline}</p>}

            {best.reasons.length > 0 && (
              <>
                <h2 className="mt-5 font-heading text-lg font-semibold text-primary">
                  لماذا هذه تحديداً
                </h2>
                <ul className="mt-3 space-y-2">
                  {best.reasons.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="mt-6">
              <span className="font-heading text-3xl font-semibold tabular text-primary">
                {formatPrice(best.product.price)}
              </span>
              <span className="ms-1 text-sm text-muted-foreground">ر.س</span>
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => onAdd(best.product)}>إضافة للسلة</Button>
              <Button variant="outline" onClick={() => onOpenProduct(best.product)}>
                عرض التفاصيل
              </Button>
            </div>

            <Button variant="ghost" className="mt-3 px-2" onClick={restart}>
              <RotateCcw aria-hidden="true" />
              أعد الاختبار
            </Button>
          </div>
        </div>

        {alternatives.length > 0 && (
          <>
            <h2 className="mt-14 font-heading text-2xl font-semibold text-primary">
              خيارات أخرى قد تناسبك
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {alternatives.map(({ product }) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onOpenProduct(product)}
                  className="group flex gap-4 rounded-xl border p-4 text-start transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ProductVisual product={product} className="w-28 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-primary group-hover:text-accent">
                      {product.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{product.specs?.firmness}</p>
                    <p className="mt-2 tabular text-sm">{formatPrice(product.price)} ر.س</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="mt-10 text-xs text-muted-foreground">
          الترشيح مبني على إجاباتك ومواصفات المجموعة، وليس استشارة طبية. إن كان
          لديك ألم مزمن في الظهر فاستشر مختصاً.
        </p>
      </section>
    );
  }

  const question = QUESTIONS[step];

  return (
    <section className="container max-w-2xl animate-fade-up py-12">
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            السؤال {step + 1} من {QUESTIONS.length}
          </span>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              السابق
            </button>
          )}
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={QUESTIONS.length}
          aria-label="تقدّم الاختبار"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h1 className="font-heading text-3xl font-semibold text-primary">{question.title}</h1>

          <div
            className="mt-6 space-y-3"
            role="group"
            aria-label={question.title}
          >
            {question.choices.map((choice) => {
              const selected = answers[question.id] === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => choose(question.id, choice.value)}
                  aria-pressed={selected}
                  className={cn(
                    'flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-start transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    selected
                      ? 'border-accent bg-accent/10'
                      : 'hover:border-accent/50 hover:bg-muted/60'
                  )}
                >
                  <span>
                    <span className="block font-semibold">{choice.label}</span>
                    {choice.hint && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {choice.hint}
                      </span>
                    )}
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 rotate-180 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
