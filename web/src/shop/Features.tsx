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

const LABEL: Record<string, string> = {
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
  return <span aria-hidden className={cn('inline-block bg-brand-text', className)} style={{ maskImage: `url(${url})`, WebkitMaskImage: `url(${url})`, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center', WebkitMaskPosition: 'center' }} />;
}

export function Features({ names }: { names: string[] }) {
  const known = names.filter((n) => fileFor(n) && LABEL[n]);
  if (!known.length) return null;
  return (
    <div className="flex flex-col gap-4">
      {/* Phones: one row that scrolls; desktop: six to a row. */}
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
        {known.map((n) => (
          <li key={n} className="flex w-[92px] shrink-0 flex-col items-center gap-2 rounded-lg border border-border px-2 py-3 text-center lg:w-auto">
            <FeatureIcon name={n} className={n === 'made-in-libya' ? 'size-12 rounded-full dark:bg-white' : 'size-12'} />
            <span className="text-xs font-bold leading-snug">{LABEL[n]}</span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">مضادة للحساسية · مضادة للبكتيريا · قابلة لإعادة التدوير</p>
    </div>
  );
}
