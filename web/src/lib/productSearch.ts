import { resolveFeatureIcons } from '@/lib/icons';
import { normalizeArabic } from '@/lib/mattressQuiz';
import type { Product } from '@/types';

/**
 * The shop's search, as customers type it: «مرتبة طبية», «كمفورت» for
 * كومفورت, «سوست», «160*200». Every word has to be found somewhere in the
 * mattress - its name, tier, features, layers, sizes or description - spelled
 * loosely (hamzas, ة/ه, ى/ي, a missing و or ي), with a few everyday words
 * read as the catalogue says them. The best match comes first: a word in the
 * name counts more than one in the description.
 */

/** Words that say nothing here: every product is a mattress. */
const STOP_WORDS = new Set(['مرتبه', 'مراتب', 'مرتبات', 'فرشه', 'فرش', 'مرتبة', 'سرير', 'ل', 'من', 'في', 'و']);

/** What customers say -> what the catalogue says (normalised). */
const SYNONYMS: Record<string, string[]> = {
  سوست: ['نوابض'],
  سوسته: ['نوابض'],
  زنبرك: ['نوابض'],
  زمبرك: ['نوابض'],
  سبرنج: ['نوابض'],
  طبي: ['طبي'],
  طبيه: ['طبي'],
  فندقي: ['فندقي', 'هوتيل'],
  فندقيه: ['فندقي', 'هوتيل'],
  فندق: ['فندقي', 'هوتيل'],
  رخيص: ['اقتصادي'],
  رخيصه: ['اقتصادي'],
  ميموري: ['ميموري'],
  ميمورى: ['ميموري'],
  مفرد: ['90', '100', '120'],
  فردي: ['90', '100', '120'],
  دبل: ['160', '180', '200'],
  مزدوج: ['160', '180', '200'],
  مزدوجه: ['160', '180', '200'],
  عرسان: ['180', '200'],
  كينج: ['180', '200'],
};

const WEIGHTS = { name: 6, tier: 4, sku: 3, sizes: 3, features: 2, layers: 2, description: 1 } as const;
type Field = keyof typeof WEIGHTS;

function norm(text: string): string {
  return normalizeArabic(String(text || '').toLowerCase());
}

/** The letters without the long vowels - «كمفورت» and «كومفورت» both read «كمفرت». */
function skeleton(word: string): string {
  return word.replace(/[اوي]/g, '');
}

/** A query word as it is compared: no «ال» in front, no ه at the end of a longer word. */
function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.startsWith('ال')) w = w.slice(2);
  if (w.length > 3 && w.endsWith('ه')) w = w.slice(0, -1);
  return w;
}

interface Indexed {
  product: Product;
  fields: Record<Field, string>;
  /** The words of the name, and of the tier, as skeletons - for loose spelling. */
  nameSkeletons: string[];
  tierSkeletons: string[];
}

function index(product: Product): Indexed {
  const sizes = (product.variants ?? []).map((v) => `${v.label} ${v.sku ?? ''}`).join(' ');
  const fields: Record<Field, string> = {
    name: norm(product.name),
    tier: norm(product.tier?.name ?? ''),
    sku: norm(product.sku ?? ''),
    sizes: norm(sizes),
    features: norm(resolveFeatureIcons(product.iconFeatures).map((f) => f.label).join(' ')),
    layers: norm((product.layers ?? []).join(' ')),
    description: norm(product.description ?? ''),
  };
  const skeletons = (text: string) =>
    text
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .map(skeleton)
      .filter((w) => w.length >= 3);
  return { product, fields, nameSkeletons: skeletons(fields.name), tierSkeletons: skeletons(fields.tier) };
}

/** A size typed as «160*200», «160×200», «160 x 200» - the two numbers, smaller first. */
function sizeIn(query: string): [number, number] | null {
  const m = query.match(/(\d{2,3})\s*[*x×X]\s*(\d{2,3})/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return [Math.min(a, b), Math.max(a, b)];
}

function hasSize(product: Product, [w, l]: [number, number]): boolean {
  return (product.variants ?? []).some((v) => {
    const m = v.label.match(/(\d{2,3})\s*[*x×X]\s*(\d{2,3})/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    return Math.min(a, b) === w && Math.max(a, b) === l;
  });
}

/** The score of one query word in one product, 0 when it is nowhere. */
function wordScore(item: Indexed, word: string): number {
  const alternatives = [word, ...(SYNONYMS[word] ?? [])];
  let best = 0;
  for (const alt of alternatives) {
    for (const field of Object.keys(WEIGHTS) as Field[]) {
      if (item.fields[field].includes(alt)) best = Math.max(best, WEIGHTS[field]);
    }
  }
  // Loose spelling, in the name and tier only: «كمفورت», «ديلي», «بالنس» -
  // the mattress named so before the ones filed under a tier named so.
  if (!/^\d+$/.test(word)) {
    const sk = skeleton(word);
    const like = (n: string) => n.includes(sk) || sk.includes(n);
    if (sk.length >= 3 && item.nameSkeletons.some(like)) best = Math.max(best, WEIGHTS.name - 1);
    else if (sk.length >= 3 && item.tierSkeletons.some(like)) best = Math.max(best, WEIGHTS.tier - 1);
  }
  return best;
}

/**
 * The products matching a query, best first; every product, in its order,
 * for an empty one.
 */
export function searchProducts(products: Product[], query: string): Product[] {
  const q = norm(query);
  if (!q) return products;
  const size = sizeIn(q);
  const words = q
    .replace(/(\d{2,3})\s*[*x×X]\s*(\d{2,3})/g, ' ')
    .split(/[\s,،.]+/)
    .map(stem)
    .filter((w) => w && !STOP_WORDS.has(w));

  const scored: { product: Product; score: number; order: number }[] = [];
  products.forEach((product, order) => {
    if (size && !hasSize(product, size)) return;
    const item = index(product);
    let score = size ? WEIGHTS.sizes : 0;
    for (const word of words) {
      const s = wordScore(item, word);
      if (s === 0) return; // every word must be found
      score += s;
    }
    // Only stop words typed («مرتبة»): everything matches.
    scored.push({ product, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.product);
}
