// Product feature icons (web/public/icons/*.svg). Assign a product's icons by
// key in its `iconFeatures` array — see src/data/demo-products.json for
// examples. New products (current or future, demo or Odoo-driven) pick from
// this same catalogue; nothing here is tied to a specific product.

export interface FeatureIcon {
  key: string;
  file: string;
  label: string;
}

export const FEATURE_ICONS: Record<string, FeatureIcon> = {
  'high-density-foam': { key: 'high-density-foam', file: 'high-density-foam.svg', label: 'إسفنج عالي الكثافة' },
  'premium-quality': { key: 'premium-quality', file: 'premium-quality.svg', label: 'جودة فاخرة' },
  'medical-support': { key: 'medical-support', file: 'medical-support.svg', label: 'دعم طبي' },
  'economical-price': { key: 'economical-price', file: 'economical-price.svg', label: 'سعر اقتصادي' },
  'made-in-libya': { key: 'made-in-libya', file: 'made-in-libya.svg', label: 'صنع في ليبيا' },
  'dual-season': { key: 'dual-season', file: 'dual-season.svg', label: 'وجهان صيفي وشتوي' },
  // Foam density/grade, not firmness — e.g. "إسفنج ضغط 30" is how the
  // density is described in product materials.
  'pressure-22': { key: 'pressure-22', file: 'pressure-22.svg', label: 'ضغط إسفنج 22' },
  'pressure-28': { key: 'pressure-28', file: 'pressure-28.svg', label: 'ضغط إسفنج 28' },
  'pressure-30': { key: 'pressure-30', file: 'pressure-30.svg', label: 'ضغط إسفنج 30' },
  'warranty-3': { key: 'warranty-3', file: 'warranty-3.svg', label: 'ضمان 3 سنوات' },
  'warranty-4': { key: 'warranty-4', file: 'warranty-4.svg', label: 'ضمان 4 سنوات' },
  'warranty-5': { key: 'warranty-5', file: 'warranty-5.svg', label: 'ضمان 5 سنوات' },
  'warranty-6': { key: 'warranty-6', file: 'warranty-6.svg', label: 'ضمان 6 سنوات' },
  'warranty-7': { key: 'warranty-7', file: 'warranty-7.svg', label: 'ضمان 7 سنوات' },
  'warranty-10': { key: 'warranty-10', file: 'warranty-10.svg', label: 'ضمان 10 سنوات' },
  'multi-layer-comfort': { key: 'multi-layer-comfort', file: 'multi-layer-comfort.svg', label: 'طبقات راحة متعددة' },
  'hotel-comfort-layer': { key: 'hotel-comfort-layer', file: 'hotel-comfort-layer.svg', label: 'طبقة راحة فندقية' },
  'badge-mark': { key: 'badge-mark', file: 'badge-mark.svg', label: 'علامة موثوقة' },
  'anti-allergy': { key: 'anti-allergy', file: 'anti-allergy.svg', label: 'مضاد للحساسية' },
  'antibacterial': { key: 'antibacterial', file: 'antibacterial.svg', label: 'مضاد للبكتيريا' },
  'memory-foam': { key: 'memory-foam', file: 'memory-foam.svg', label: 'ميموري فوم' },
  'ventilation-system': { key: 'ventilation-system', file: 'ventilation-system.svg', label: 'نظام تهوية' },
  'edge-support': { key: 'edge-support', file: 'edge-support.svg', label: 'دعم الحواف' },
  'bonnell-springs': { key: 'bonnell-springs', file: 'bonnell-springs.svg', label: 'نوابض بونيل' },
  'pocket-springs': { key: 'pocket-springs', file: 'pocket-springs.svg', label: 'نوابض منفصلة' },
  'deep-sleep': { key: 'deep-sleep', file: 'deep-sleep.svg', label: 'نوم عميق' },
  'recycling': { key: 'recycling', file: 'recycling.svg', label: 'إعادة تدوير' },
};

export function iconSrc(file: string) {
  return `/icons/${file}`;
}

/** Drops any keys that no longer exist in the catalogue — a product's list
 * can outlive an icon getting renamed or removed without breaking the page. */
export function resolveFeatureIcons(keys: string[] | undefined): FeatureIcon[] {
  if (!keys?.length) return [];
  return keys.map((k) => FEATURE_ICONS[k]).filter((icon): icon is FeatureIcon => Boolean(icon));
}
