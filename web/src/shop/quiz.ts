/**
 * «ساعدني أختار» - the factory's rules (the admin handoff's docs/QUIZ.md and
 * quiz-rules.json): three questions; the third picks a pair of mattresses
 * (first choice and alternative); the first two give points to tags, the first
 * choice gets a bonus, and the alternative takes its place only when it still
 * scores higher. The reason line is the catalogue's own sentences.
 *
 * The rules are data, not code: the admin panel edits them, and the website
 * and the app read the same JSON, so all three give the same answer.
 */
import type { Product, ProductVariant } from '@/types';

import { canOrderVariant, displayName, featuredVariant, parseSize, priceFrom, variantsOf } from './catalog';
import DEFAULT_RULES_JSON from './quiz-rules.json';

export interface QuizRuleOption {
  id: string;
  label: string;
  /** Questions 1-2: points per tag. */
  weights?: Record<string, number>;
  /** Question 3: [first choice, alternative] (mattress keys). */
  pair?: [string, string];
  /** Question 3: the need's tag - its reason sentence leads the result. */
  tag?: string | null;
  /** Turned off in the admin panel: not offered. */
  enabled?: boolean;
}

export interface QuizRuleQuestion {
  id: string;
  title: string;
  subtitle?: string;
  options: QuizRuleOption[];
}

export interface QuizRuleMattress {
  name: string;
  tier: string;
  tags: string[];
  /** 0-3: multiplies the `support` weight. */
  support: number;
  reasons: Record<string, string>;
}

export interface QuizRules {
  version: number;
  mattresses: Record<string, QuizRuleMattress>;
  questions: QuizRuleQuestion[];
  first_bonus: number;
}

export const DEFAULT_RULES = DEFAULT_RULES_JSON as unknown as QuizRules;

/**
 * The panel's rules from /api/app/v1/config when they have the shape the engine
 * needs (the server checks them on save), else null - the factory's then apply.
 */
export function usableRules(value: unknown): QuizRules | null {
  const r = value as Partial<QuizRules> | null | undefined;
  if (!r || typeof r !== 'object' || !r.mattresses || typeof r.mattresses !== 'object' || !Array.isArray(r.questions)) return null;
  if (r.questions.map((q) => q?.id).join() !== 'who,position,need') return null;
  if (!r.questions.every((q) => Array.isArray(q.options) && q.options.some((o) => o.enabled !== false))) return null;
  return { version: Number(r.version) || 3, mattresses: r.mattresses, questions: r.questions, first_bonus: Number.isFinite(r.first_bonus) ? Number(r.first_bonus) : 2 };
}

/** Answers by question id: { who, position, need } → option id. */
export type QuizAnswers = Record<string, string>;

export interface QuizOption {
  key: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  title: string;
  hint: string;
  options: QuizOption[];
}

/** The size line under who will sleep on it - the questions' own subtitles where the rules have one. */
const HINTS: Record<string, string> = {
  who: 'نقترح المقاس المناسب حسب من سينام عليها.',
};

export function questionsOf(rules: QuizRules): QuizQuestion[] {
  return rules.questions.map((q) => ({
    id: q.id,
    title: q.title,
    hint: q.subtitle ?? HINTS[q.id] ?? '',
    options: q.options.filter((o) => o.enabled !== false).map((o) => ({ key: o.id, label: o.label })),
  }));
}

/** An answer's label, for the result's chips («لي وحدي · على جنبي · …»). */
export function chipFor(rules: QuizRules, questionId: string, optionId: string | undefined): string {
  return rules.questions.find((q) => q.id === questionId)?.options.find((o) => o.id === optionId)?.label ?? '';
}

/* ───────────── The match ───────────── */

export interface QuizPick {
  product: Product;
  /** The size to add to the cart: one that can be ordered, matched to who sleeps on it. */
  variant: ProductVariant;
  score: number;
}

export interface QuizResult {
  /** Null when none of the rules' mattresses is in the catalogue and orderable. */
  best: QuizPick | null;
  alternative: QuizPick | null;
  /** The catalogue's sentences for the first choice; '' without one. */
  reason: string;
}

/** The size each «لمن المرتبة؟» answer opens on, first that can be ordered wins (width × length, cm). */
const PREFERRED_SIZES: Record<string, [number, number][]> = {
  couple: [
    [180, 200],
    [160, 200],
    [200, 200],
  ],
  me: [
    [120, 200],
    [100, 200],
    [90, 190],
  ],
  guest: [
    [90, 190],
    [100, 200],
    [120, 200],
  ],
};

function variantFor(product: Product, who: string | undefined): ProductVariant | null {
  const featured = featuredVariant(product);
  const orderable = variantsOf(product).filter(canOrderVariant);
  for (const [w, l] of PREFERRED_SIZES[who ?? 'me'] ?? PREFERRED_SIZES.me) {
    const matches = orderable.filter((v) => {
      const p = parseSize(v);
      return p.width === w && p.length === l;
    });
    if (matches.length) return matches.find((v) => parseSize(v).height === parseSize(featured).height) ?? matches[0];
  }
  return canOrderVariant(featured) ? featured : orderable[0] ?? null;
}

/** Points from questions 1-2 for one mattress, and which tags gave them (the reference implementation). */
function scoreOf(rules: QuizRules, key: string, answers: QuizAnswers): { s: number; why: Record<string, number> } {
  const m = rules.mattresses[key];
  const why: Record<string, number> = {};
  let s = 0;
  if (!m) return { s, why };
  for (const q of rules.questions) {
    if (q.id === 'need') continue;
    const o = q.options.find((x) => x.id === answers[q.id]);
    for (const [tag, w] of Object.entries(o?.weights ?? {})) {
      const v = tag === 'support' ? w * m.support : m.tags.includes(tag) ? w : 0;
      if (v) {
        s += v;
        why[tag] = (why[tag] ?? 0) + v;
      }
    }
  }
  return { s, why };
}

function reasonFor(rules: QuizRules, key: string, answers: QuizAnswers, needTag: string | null | undefined): string {
  const r = rules.mattresses[key]?.reasons ?? {};
  const first = (needTag && r[needTag]) || r._default;
  const lines = first ? [first] : [];
  const top = Object.entries(scoreOf(rules, key, answers).why)
    .sort((a, b) => b[1] - a[1])
    .find(([tag]) => tag !== needTag && r[tag] && !lines.includes(r[tag]));
  if (top) lines.push(r[top[0]]);
  return lines.join(' ');
}

export function recommend(answers: QuizAnswers, products: Product[], rules: QuizRules = DEFAULT_RULES): QuizResult {
  // Each rule mattress as the shop sells it (by its catalogue name), with the size to suggest.
  const picks = new Map<string, QuizPick>();
  for (const [key, m] of Object.entries(rules.mattresses)) {
    const product = products.find((p) => displayName(p) === m.name);
    if (!product) continue;
    const variant = variantFor(product, answers.who);
    if (!variant) continue;
    picks.set(key, { product, variant, score: scoreOf(rules, key, answers).s });
  }
  if (!picks.size) return { best: null, alternative: null, reason: '' };

  const need = rules.questions.find((q) => q.id === 'need')?.options.find((o) => o.id === answers.need);
  let [first, alt] = need?.pair ?? ['', ''];
  if (scoreOf(rules, alt, answers).s > scoreOf(rules, first, answers).s + rules.first_bonus) [first, alt] = [alt, first];

  // A mattress the rules name but the shop does not sell (yet - كراون): the other takes its place,
  // and the alternative is the best-scoring of the rest (the need's tag counts), cheaper on a tie.
  const ranked = [...picks.entries()]
    .filter(([key]) => key !== first && key !== alt)
    .sort(
      ([ka, a], [kb, b]) =>
        b.score + (need?.tag && rules.mattresses[kb].tags.includes(need.tag) ? 2 : 0) - (a.score + (need?.tag && rules.mattresses[ka].tags.includes(need.tag) ? 2 : 0)) ||
        priceFrom(a.product) - priceFrom(b.product)
    )
    .map(([key]) => key);
  const order = [first, alt, ...ranked].filter((key) => picks.has(key));
  const [bestKey, altKey] = order;

  return {
    best: picks.get(bestKey) ?? null,
    alternative: altKey ? picks.get(altKey) ?? null : null,
    reason: reasonFor(rules, bestKey, answers, need?.pair?.includes(bestKey) ? need?.tag : null),
  };
}
