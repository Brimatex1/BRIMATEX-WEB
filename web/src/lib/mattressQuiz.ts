/**
 * The "Which mattress suits you?" quiz - the iOS app's own
 * (brimatex-ios/src/features/mattressQuiz.ts), copied as is so the website and
 * the app ask the same questions and recommend the same mattress. Change one,
 * change both.
 *
 * The content and scoring are copied verbatim from brimatex-mattress-quiz.html,
 * sent by the owner - no question, score or description was added or changed
 * here. The only change: the file said "7 questions" and had four, so the count
 * is now derived from the list.
 *
 * The quiz's eight mattress lines are marketing names, and not all of them are in
 * the live Odoo catalogue. So linking to a real product happens at display time
 * (findCatalogProduct), not here: a line with a product opens its page, and a
 * line without one opens customer care under its name. That way no "Order" button
 * leads nowhere, and when the product is added in Odoo it links by itself.
 */
import type { Product } from '@/types';

export type LineId =
  | 'crown'
  | 'deluxe'
  | 'hotel'
  | 'sport'
  | 'balance'
  | 'comfort'
  | 'daily'
  | 'classic';

export interface MattressLine {
  name: string;
  tier: string;
  tagline: string;
  desc: string;
  /** [key, value] in the order they are displayed. */
  specs: [string, string][];
  why: string[];
}

/** The order is deliberate: on a tie in points the earlier one here wins, as in the original file. */
export const LINE_ORDER: LineId[] = [
  'crown',
  'deluxe',
  'hotel',
  'sport',
  'balance',
  'comfort',
  'daily',
  'classic',
];

export const LINES: Record<LineId, MattressLine> = {
  crown: {
    name: 'كراون',
    tier: 'إليت',
    tagline: 'قمة الفخامة في عالم النوم',
    desc: 'دعم متوازن يجمع بين الفخامة والراحة الفندقية المطلقة. نظام Pocket Spring يعزل الحركة ويتكيف مع انحناءات جسمك، وفوقه طبقة ميموري فوم تحتضنك بلطف، مع قماش مبرّد عالي الجودة يمنحك إحساساً بالانتعاش طول الليل.',
    specs: [
      ['الضغط', '30'],
      ['الضمان', '10 سنوات'],
      ['نظام الدعم', 'نوابض منفصلة + ميموري فوم'],
      ['الفئة', 'إليت'],
    ],
    why: [
      'تريد أعلى مستوى فخامة وراحة فندقية',
      'تنام مع شريك وتحتاج عزل حركة ممتاز',
      'تحس بالحرارة ليلاً وتحتاج قماش مبرّد',
      'ميزانيتك مفتوحة لتجربة نوم استثنائية',
    ],
  },
  deluxe: {
    name: 'ديلوكس',
    tier: 'بريميوم',
    tagline: 'تجربة نوم متكاملة ومتوازنة',
    desc: 'نظام Pocket Spring يقلل انتقال الحركة ويوفر دعماً متوازناً لكل مناطق جسمك، مدعّم بإطار جانبي قوي لثبات أطول عمرا، وطبقة Pillow Top مريحة تمنحك نعومة ودعماً لعمودك الفقري.',
    specs: [
      ['الضغط', '30'],
      ['الضمان', '7 سنوات'],
      ['نظام الدعم', 'نوابض منفصلة + Pillow Top'],
      ['الفئة', 'بريميوم'],
    ],
    why: [
      'تبي توازن بين الفخامة والسعر',
      'وضعية نومك متغيّرة بين الليالي',
      'تحب الدعم المتوازن مع نعومة إضافية',
    ],
  },
  hotel: {
    name: 'هوتيل',
    tier: 'بريميوم',
    tagline: 'دعم متوازن براحة فندقية راقية',
    desc: 'يجمع بين الدعم المتوازن والراحة الفندقية، بقلب إسفنجي مضغوط يمنح ثباتاً متوازناً، وطبقة Pillow Top Memory Foam تتكيف مع جسمك وتخفف الضغط، مع عزل ممتاز للحركة وقماش عالي الجودة يمنحك نوماً عميقاً وهادئاً.',
    specs: [
      ['الضغط', '30'],
      ['الضمان', '10 سنوات'],
      ['نظام الدعم', 'إسفنج مضغوط + Pillow Top ميموري فوم'],
      ['الفئة', 'بريميوم'],
    ],
    why: [
      'تحب الإحساس الفندقي الفاخر',
      'تنام على جنبك وتحتاج تخفيف ضغط',
      'تعاني من آلام ظهر أو رقبة أحياناً',
    ],
  },
  sport: {
    name: 'سبورت',
    tier: 'بريميوم',
    tagline: 'دعم صحي للرياضيين والنشيطين',
    desc: 'مرتبة رياضية متخصصة بارتفاع 30 سم، مزوّدة بنظام Pocket Spring لعزل الحركة وتقليل الضغط عن عمودك الفقري وعضلاتك، وإسفنج عالي الكثافة يساعد على الاسترخاء والاستشفاء العضلي، بهيكل مزدوج الوجهين لثبات ومتانة طويلة الأمد.',
    specs: [
      ['الضغط', '28'],
      ['الضمان', '5 سنوات'],
      ['نظام الدعم', 'نوابض منفصلة، مزدوج الوجهين'],
      ['الفئة', 'بريميوم'],
    ],
    why: [
      'نشيط بدنياً أو رياضي',
      'تحتاج دعماً أقوى للعمود الفقري والعضلات',
      'تفضل صلابة أعلى تساعد على الاستشفاء',
    ],
  },
  balance: {
    name: 'بالانس',
    tier: 'بريميوم',
    tagline: 'دعم متوازن بنوابض تقليدية موثوقة',
    desc: 'دعم متوازن بتصميم يعتمد على نوابض فولاذية معززة (بونيل) لثبات متوازن ودعم مريح، مع طبقة Pillow Top علوية تمنحك نعومة إضافية وتخفف الضغط عن مفاصلك وعضلاتك لنوم هادئ.',
    specs: [
      ['الضغط', '30'],
      ['الضمان', '5 سنوات'],
      ['نظام الدعم', 'نوابض بونيل + Pillow Top'],
      ['الفئة', 'بريميوم'],
    ],
    why: [
      'تفضل الدعم التقليدي الموثوق بنوابض بونيل',
      'تنام غالباً على ظهرك',
      'تبي صلابة متوسطة بميزانية معقولة',
    ],
  },
  comfort: {
    name: 'كمفورت',
    tier: 'كمفورت',
    tagline: 'راحة يومية بأداء متوازن',
    desc: 'قلب من الإسفنج المضغوط يدعم جسمك بشكل متكامل، بتصميم عملي يعمل على الوجهين لعمر استخدام أطول، مع نظام تهوية وعزل داخلي يساعدك على نوم هادئ ومريح كل ليلة.',
    specs: [
      ['الضغط', '30'],
      ['الضمان', '6 سنوات'],
      ['نظام الدعم', 'إسفنج مضغوط، مزدوج الوجهين'],
      ['الفئة', 'كمفورت'],
    ],
    why: [
      'تريد راحة يومية موثوقة بدون نوابض',
      'ميزانيتك متوسطة',
      'تنام على بطنك أو قليل الحركة ليلاً',
    ],
  },
  daily: {
    name: 'ديلي',
    tier: 'كمفورت',
    tagline: 'دعم ثابت للاستخدام اليومي',
    desc: 'مصممة من الإسفنج المضغوط لتوفير دعم ثابت وراحة يومية تدوم لفترات طويلة، بتصميم مزدوج الوجهين يتيح استخداماً متوازناً ويطيل عمر المرتبة — خيار عملي لكل بيت.',
    specs: [
      ['الضغط', '28'],
      ['الضمان', '4 سنوات'],
      ['نظام الدعم', 'إسفنج مضغوط، مزدوج الوجهين'],
      ['الفئة', 'كمفورت (اقتصادي)'],
    ],
    why: [
      'تبي مرتبة عملية للاستخدام اليومي',
      'ميزانيتك اقتصادية',
      'مناسبة لغرف إضافية أو الضيوف',
    ],
  },
  classic: {
    name: 'كلاسيك',
    tier: 'كمفورت',
    tagline: 'راحة اقتصادية للاستخدام اليومي',
    desc: 'مرتبة اقتصادية بتصميم من طبقات إسفنج مضغوطة ومرنة، تمنح دعماً متوازناً ونوماً مريحاً، وتعمل على الوجهين لزيادة عمر الاستخدام — خيار يجمع بين الراحة والسعر المناسب.',
    specs: [
      ['الضغط', '22'],
      ['الضمان', '—'],
      ['نظام الدعم', 'طبقات إسفنج مرنة، مزدوج الوجهين'],
      ['الفئة', 'كمفورت (الأكثر اقتصادية)'],
    ],
    why: [
      'تبحث عن أرخص خيار متوفر',
      'استخدام مؤقت أو ثانوي',
      'تفضل مرونة بسيطة بميزانية محدودة جداً',
    ],
  },
};

export interface QuizOption {
  label: string;
  points: Partial<Record<LineId, number>>;
}

export interface QuizQuestion {
  title: string;
  options: QuizOption[];
}

export const QUESTIONS: QuizQuestion[] = [
  {
    title: 'شن ميزانيتك التقريبية؟',
    options: [
      { label: 'اقتصادي جداً — أرخص خيار', points: { classic: 3, daily: 1 } },
      { label: 'اقتصادي متوازن — سعر وجودة', points: { daily: 3, comfort: 2, classic: 1 } },
      { label: 'متوسط — جودة أعلى بسعر معقول', points: { comfort: 3, balance: 2, deluxe: 1 } },
      { label: 'مرتفع — تجربة فندقية أو رياضية متقدمة', points: { deluxe: 2, hotel: 2, sport: 2, balance: 1 } },
      { label: 'فخامة كاملة، بلا حدود سعر', points: { crown: 3, hotel: 1, deluxe: 1 } },
    ],
  },
  {
    title: 'شن وضعية نومك الأساسية؟',
    options: [
      { label: 'على الظهر', points: { balance: 1, comfort: 1, sport: 1, hotel: 1 } },
      { label: 'على الجنب', points: { crown: 2, hotel: 2, deluxe: 1 } },
      { label: 'على البطن', points: { daily: 1, comfort: 1, classic: 1 } },
      { label: 'متغيّرة، ما فيها ثبات', points: { deluxe: 1, hotel: 1, balance: 1 } },
    ],
  },
  {
    title: 'عندك احتياج خاص؟',
    options: [
      { label: 'آلام ظهر أو رقبة متكررة', points: { crown: 2, hotel: 2, sport: 2, balance: 1 } },
      { label: 'أنام مع شريك وحركته تزعجني ليلاً', points: { crown: 2, hotel: 1, deluxe: 1, sport: 1 } },
      { label: 'رياضي / نشيط بدنياً بشكل يومي', points: { sport: 3, crown: 1 } },
      { label: 'أحس بالحر أثناء النوم', points: { crown: 2, comfort: 1, hotel: 1 } },
      { label: 'ولا وحدة من ذي', points: {} },
    ],
  },
  {
    title: 'شن درجة الصلابة اللي تفضلها؟',
    options: [
      { label: 'ناعمة / طرية', points: { crown: 2, hotel: 2, deluxe: 1 } },
      { label: 'متوسطة', points: { balance: 2, deluxe: 1, comfort: 1 } },
      { label: 'صلبة / داعمة', points: { sport: 2, daily: 2, comfort: 1 } },
      { label: 'خليها الاختبار يقرر', points: {} },
    ],
  },
];

/** One answer per question: the option index, or null if not answered yet. */
export type Answers = (number | null)[];

export function computeScores(answers: Answers): Record<LineId, number> {
  const scores = Object.fromEntries(LINE_ORDER.map((id) => [id, 0])) as Record<LineId, number>;
  answers.forEach((optionIndex, questionIndex) => {
    if (optionIndex === null) return;
    const points = QUESTIONS[questionIndex]?.options[optionIndex]?.points ?? {};
    for (const [id, value] of Object.entries(points) as [LineId, number][]) {
      scores[id] += value;
    }
  });
  return scores;
}

/**
 * The top pick, then two alternatives. Sorted by points, descending, with ties
 * broken by LINE_ORDER - Array.sort is stable in every modern JS engine, which is
 * what the original file implicitly relied on.
 */
export function rankLines(answers: Answers): [LineId, LineId, LineId] {
  const scores = computeScores(answers);
  const ranked = [...LINE_ORDER].sort((a, b) => scores[b] - scores[a]);
  // Every answer "Skip": Comfort is a balanced default, as in the original.
  if (scores[ranked[0]] === 0) return ['comfort', 'balance', 'deluxe'];
  return [ranked[0], ranked[1], ranked[2]];
}

/** Normalises Arabic spelling for comparison: hamzas, yaa, taa marbuta, diacritics. */
export function normalizeArabic(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '') // diacritics and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The real product matching a line in the quiz, or undefined.
 *
 * An exact match, not a fuzzy one, on purpose: catalogue names are "مرتبة
 * كراون", "مرتبة ريلاكس بيلوتوب"... A fuzzy match would have linked "كمفورت" to
 * any name starting with it, and a wrong link sells the customer a mattress other
 * than the one recommended. Opening customer care is safer than opening the wrong
 * product.
 */
export function findCatalogProduct(line: MattressLine, products: Product[]): Product | undefined {
  const wanted = normalizeArabic(line.name);
  return products.find((p) => {
    const name = normalizeArabic(p.name);
    if (!name.startsWith('مرتبه ')) return false; // no toppers and no blocks
    return name.slice('مرتبه '.length) === wanted;
  });
}
