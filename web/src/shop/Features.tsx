import { cn } from '@/lib/utils';

/**
 * «المميزات» (the 2026 handoff, docs/PRODUCTS.md): the catalogue's icons for a
 * mattress - warranty, density, its own features, made in Libya - then one
 * line of what every mattress is. The icons are drawn as masks so they take
 * the theme's colour in light and dark (their own fill is a fixed navy, and
 * their inline <style> classes would clash if several were inlined); the
 * flag keeps its colours.
 */
const FILES = import.meta.glob('./assets/feature-icons/*.svg', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;

function fileFor(name: string): string | undefined {
  return FILES[`./assets/feature-icons/${name}.svg`];
}

/** Each icon's label - also the panel's «المراتب» list of icons to choose from. */
export const FEATURE_LABELS: Record<string, string> = {
  'high-density-foam': 'إسفنج عالي الكثافة',
  'premium-quality': 'جودة فاخرة',
  'medical-support': 'دعم طبي',
  'economy-price': 'سعر اقتصادي',
  'made-in-libya': 'صنع في ليبيا',
  'summer-winter': 'صيف شتاء',
  'density-30': 'إسفنج ضغط 30',
  'density-22': 'إسفنج ضغط 22',
  'density-28': 'إسفنج ضغط 28',
  'warranty-10y': 'ضمان 10 سنوات',
  'warranty-7y': 'ضمان 7 سنوات',
  'warranty-6y': 'ضمان 6 سنوات',
  'warranty-5y': 'ضمان 5 سنوات',
  'warranty-4y': 'ضمان 4 سنوات',
  'warranty-3y': 'ضمان 3 سنوات',
  'multi-comfort-layers': 'طبقات الراحة المتعددة',
  'hotel-comfort-layer': 'طبقة الراحة الفندقية',
  'memory-foam': 'ميموري فوم',
  ventilation: 'نظام تهوية',
  'edge-support': 'نظام دعم الحواف',
  'bonnell-springs': 'نوابض بونيل',
  'pocket-springs': 'نوابض منفصلة',
  'deep-sleep': 'نوم عميق',
};

/** The colours of the flag stay; everything else follows the theme. */
const KEEP_COLOURS = new Set(['made-in-libya']);

export function FeatureIcon({ name, className }: { name: string; className?: string }) {
  const url = fileFor(name);
  if (!url) return null;
  if (KEEP_COLOURS.has(name)) return <img src={url} alt="" className={cn('object-contain', className)} />;
  // Quoted: the build inlines small icons as data: addresses, and their spaces
  // and quotes broke an unquoted url() - the mask failed and showed a solid square.
  const mask = `url("${url.replace(/"/g, '%22')}")`;
  return <span aria-hidden className={cn('inline-block bg-brand-text', className)} style={{ maskImage: mask, WebkitMaskImage: mask, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center', WebkitMaskPosition: 'center' }} />;
}

export function Features({ names }: { names: string[] }) {
  const known = names.filter((n) => fileFor(n) && FEATURE_LABELS[n]);
  if (!known.length) return null;
  return (
    <div className="flex flex-col gap-4">
      {/* Three to a row on phones, four on tablets, six on desktop - never wider than the page. */}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
        {known.map((n) => (
          <li key={n} className="flex min-w-0 flex-col items-center gap-2 rounded-lg border border-border px-1.5 py-3 text-center">
            <FeatureIcon name={n} className={n === 'made-in-libya' ? 'size-12 rounded-full dark:bg-white' : 'size-12'} />
            <span className="text-xs font-bold leading-snug">{FEATURE_LABELS[n]}</span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">مضادة للحساسية · مضادة للبكتيريا · قابلة لإعادة التدوير</p>
    </div>
  );
}
