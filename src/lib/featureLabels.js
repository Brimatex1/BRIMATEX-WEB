/**
 * The words behind each spec icon, for what the server writes (Meta's product
 * feed) - the same labels the product page shows under the icons
 * (web/src/lib/icons.ts). tests/share.check.js keeps the two in step.
 */
const FEATURE_LABELS = {
  'high-density-foam': 'إسفنج عالي الكثافة',
  'premium-quality': 'جودة فاخرة',
  'medical-support': 'دعم طبي',
  'economical-price': 'سعر اقتصادي',
  'made-in-libya': 'صنع في ليبيا',
  'dual-season': 'وجهان صيفي وشتوي',
  'pressure-22': 'ضغط إسفنج 22',
  'pressure-28': 'ضغط إسفنج 28',
  'pressure-30': 'ضغط إسفنج 30',
  'warranty-3': 'ضمان 3 سنوات',
  'warranty-4': 'ضمان 4 سنوات',
  'warranty-5': 'ضمان 5 سنوات',
  'warranty-6': 'ضمان 6 سنوات',
  'warranty-7': 'ضمان 7 سنوات',
  'warranty-10': 'ضمان 10 سنوات',
  'multi-layer-comfort': 'طبقات راحة متعددة',
  'hotel-comfort-layer': 'طبقة راحة فندقية',
  'badge-mark': 'علامة موثوقة',
  'anti-allergy': 'مضاد للحساسية',
  'antibacterial': 'مضاد للبكتيريا',
  'memory-foam': 'ميموري فوم',
  'ventilation-system': 'نظام تهوية',
  'edge-support': 'دعم الحواف',
  'bonnell-springs': 'نوابض بونيل',
  'pocket-springs': 'نوابض منفصلة',
  'deep-sleep': 'نوم عميق',
  'recycling': 'إعادة تدوير',
};

/** A product's feature labels, in its own order, unknown keys dropped. */
function featureLabels(keys) {
  return (keys || []).map((k) => FEATURE_LABELS[k]).filter(Boolean);
}

module.exports = { FEATURE_LABELS, featureLabels };
