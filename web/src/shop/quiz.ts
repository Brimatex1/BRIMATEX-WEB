/**
 * «ساعدني أختار» (handoff WebQuiz, WebQuizResult): the three questions, and
 * which mattress their answers point to. Pure - QuizPage only draws.
 *
 * The match is one scoring table: every mattress gets points for each answer,
 * the most points wins, the runner-up is the alternative. Only mattresses that
 * are in the catalogue and can be ordered are considered; a mattress missing
 * from the catalogue simply drops out.
 */
import type { Product, ProductVariant } from '@/types';

import { canOrderVariant, displayName, featuredVariant, parseSize, priceFrom, variantsOf } from './catalog';

export type Sleepers = 'single' | 'couple' | 'child' | 'guest';
export type Position = 'side' | 'back' | 'stomach' | 'restless';
export type Feel = 'soft' | 'medium' | 'firm' | 'unsure';

export interface QuizAnswers {
  sleepers: Sleepers;
  position: Position;
  feel: Feel;
}

export type QuestionId = keyof QuizAnswers;
export type AnswerKey = Sleepers | Position | Feel;

export interface QuizOption {
  key: AnswerKey;
  /** On the option card. */
  label: string;
  /** On the result's summary chip. */
  chip: string;
}

export interface QuizQuestion {
  id: QuestionId;
  title: string;
  hint: string;
  options: QuizOption[];
}

export const QUESTIONS: QuizQuestion[] = [
  {
    id: 'sleepers',
    title: 'لمن المرتبة؟',
    hint: 'نقترح المقاس المناسب حسب من سينام عليها.',
    options: [
      { key: 'single', label: 'لي وحدي', chip: 'لشخص واحد' },
      { key: 'couple', label: 'لشخصين', chip: 'لشخصين' },
      { key: 'child', label: 'لطفل', chip: 'لطفل' },
      { key: 'guest', label: 'لغرفة الضيوف', chip: 'لغرفة الضيوف' },
    ],
  },
  {
    id: 'position',
    title: 'كيف تنام غالباً؟',
    hint: 'وضعية النوم تحدد الصلابة المناسبة لظهرك.',
    options: [
      { key: 'side', label: 'على جنبي', chip: 'على جنبي' },
      { key: 'back', label: 'على ظهري', chip: 'على ظهري' },
      { key: 'stomach', label: 'على بطني', chip: 'على بطني' },
      { key: 'restless', label: 'أتقلّب كثيراً', chip: 'أتقلّب كثيراً' },
    ],
  },
  {
    id: 'feel',
    title: 'أيّ إحساس تفضّل؟',
    hint: 'لا توجد إجابة خاطئة، اختر ما ترتاح عليه عادةً.',
    options: [
      { key: 'soft', label: 'طرية', chip: 'صلابة خفيفة' },
      { key: 'medium', label: 'متوسطة', chip: 'صلابة متوسطة' },
      { key: 'firm', label: 'صلبة', chip: 'صلابة عالية' },
      { key: 'unsure', label: 'لا أعرف', chip: 'أي صلابة' },
    ],
  },
];

/** «صلابة متوسطة» for 'medium' - the result's chips. */
export function chipFor(key: AnswerKey): string {
  for (const q of QUESTIONS) {
    const o = q.options.find((x) => x.key === key);
    if (o) return o.chip;
  }
  return '';
}

/* ───────────── The scoring table ───────────── */

// Placeholder rules until Brimatex supplies the real mapping.
//
// Read from docs/PRODUCTS.md (the catalogue states no firmness, so the feel is
// inferred from the construction):
//  - Side sleepers want a soft top: Memory Foam (كراون، هوتيل) or a Pillow Top
//    (ديلوكس، بالانس).
//  - Stomach sleepers want a firm, even surface: the foam cores and سبورت.
//  - Couples and restless sleepers want pocket springs, which isolate motion
//    (كراون، ديلوكس، سبورت).
//  - A child's or a guest room's mattress leans to the كمفورت tier's prices.
// Points run 0 (poor fit) to 3 (best fit). On equal points the lower price wins.
// Keyed by the catalogue name (displayName). Each row holds one group per
// question, in QUESTIONS order, and one number per option, in option order:
//
//   [ single, couple, child, guest ], [ side, back, stomach, restless ], [ soft, medium, firm, unsure ]
const SCORES: Record<string, [number[], number[], number[]]> = {
  كراون: [[2, 3, 0, 0], [3, 2, 1, 3], [3, 2, 0, 2]],
  ديلوكس: [[2, 3, 0, 0], [2, 3, 1, 3], [2, 3, 1, 2]],
  هوتيل: [[2, 2, 0, 1], [3, 2, 0, 1], [3, 2, 0, 2]],
  سبورت: [[2, 2, 1, 0], [1, 3, 3, 2], [0, 2, 3, 2]],
  بالانس: [[2, 2, 1, 1], [3, 3, 2, 1], [1, 3, 2, 3]],
  كمفورت: [[2, 1, 2, 3], [1, 2, 3, 1], [0, 2, 3, 1]],
  ديلي: [[1, 1, 3, 3], [1, 2, 3, 0], [0, 1, 3, 1]],
  كلاسيك: [[1, 0, 3, 3], [0, 1, 2, 0], [0, 1, 2, 0]],
};

/** What the sleeping position asks of a mattress - the first half of the reason line. */
const NEED: Record<Position, string> = {
  side: 'من ينام على جنبه يحتاج سطحاً يلين تحت الكتف والورك.',
  back: 'من ينام على ظهره يحتاج دعماً متوازناً يحفظ استقامة العمود الفقري.',
  stomach: 'من ينام على بطنه يحتاج سطحاً ثابتاً لا ينحني معه أسفل الظهر.',
  restless: 'من يتقلّب كثيراً يحتاج سطحاً ثابتاً لا ينقل الحركة.',
};

/** How each mattress answers it, from its layers - the second half. */
const WHY: Record<string, string> = {
  كراون: 'وكراون تجمع طبقة ميموري فوم في الأعلى مع نوابض منفصلة تعزل الحركة.',
  ديلوكس: 'وديلوكس بنوابض منفصلة تعزل الحركة ووسادة علوية تمنح نعومة مريحة.',
  هوتيل: 'وهوتيل بوسادة علوية من الميموري فوم تتكيف مع انحناءات الجسم فوق قلب إسفنج ضغط 30.',
  سبورت: 'وسبورت بنوابض منفصلة وإسفنج عالي الكثافة يمنحان دعماً ثابتاً على الوجهين.',
  بالانس: 'وبالانس بوسادة علوية فوق نوابض بونيل وإطار إسفنج يمنحان دعماً متوسطاً متوازناً.',
  كمفورت: 'وكمفورت بقلب إسفنج ضغط 30 يمنح دعماً ثابتاً، وتعمل على الوجهين.',
  ديلي: 'وديلي بإسفنج ضغط 28 يمنح دعماً ثابتاً يدوم، وتعمل على الوجهين.',
  كلاسيك: 'وكلاسيك بإسفنج مضغوط يعمل على الوجهين، خيار اقتصادي للاستخدام اليومي.',
};

/** The size each answer opens on, first that can be ordered wins (width × length, cm). */
const PREFERRED_SIZES: Record<Sleepers, [number, number][]> = {
  couple: [
    [180, 200],
    [160, 200],
    [200, 200],
  ],
  single: [
    [120, 200],
    [100, 200],
    [90, 190],
  ],
  child: [
    [90, 190],
    [100, 200],
  ],
  guest: [
    [120, 200],
    [100, 200],
    [90, 190],
  ],
};

/* ───────────── The match ───────────── */

export interface QuizPick {
  product: Product;
  /** The size to add to the cart: one that can be ordered, matched to who sleeps on it. */
  variant: ProductVariant;
  score: number;
}

export interface QuizResult {
  /** Null when no mattress in the table is in the catalogue and orderable. */
  best: QuizPick | null;
  alternative: QuizPick | null;
  /** One line tying the answers to the mattress's layers; '' without a best. */
  reason: string;
}

function scoreOf(name: string, answers: QuizAnswers): number | null {
  const row = SCORES[name];
  if (!row) return null;
  return QUESTIONS.reduce((sum, q, i) => sum + (row[i][q.options.findIndex((o) => o.key === answers[q.id])] ?? 0), 0);
}

function variantFor(product: Product, sleepers: Sleepers): ProductVariant | null {
  const featured = featuredVariant(product);
  const orderable = variantsOf(product).filter(canOrderVariant);
  for (const [w, l] of PREFERRED_SIZES[sleepers]) {
    const matches = orderable.filter((v) => {
      const p = parseSize(v);
      return p.width === w && p.length === l;
    });
    if (matches.length) return matches.find((v) => parseSize(v).height === parseSize(featured).height) ?? matches[0];
  }
  return canOrderVariant(featured) ? featured : null;
}

export function recommend(answers: QuizAnswers, products: Product[]): QuizResult {
  const picks: QuizPick[] = [];
  for (const product of products) {
    const score = scoreOf(displayName(product), answers);
    if (score === null) continue;
    const variant = variantFor(product, answers.sleepers);
    if (!variant) continue;
    picks.push({ product, variant, score });
  }
  picks.sort((a, b) => b.score - a.score || priceFrom(a.product) - priceFrom(b.product));
  const [best = null, alternative = null] = picks;
  const reason = best ? `${NEED[answers.position]} ${WHY[displayName(best.product)] ?? ''}`.trim() : '';
  return { best, alternative, reason };
}
