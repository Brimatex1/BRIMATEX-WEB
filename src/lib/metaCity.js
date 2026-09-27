/**
 * The customer's city as Meta matches it (user_data.ct): "Lowercase only with
 * no punctuation, no special characters, and no spaces", in the Latin
 * alphabet of Meta's examples (paris, london, newyork). Customers type their
 * city in Arabic, so the main Libyan cities are written the way Meta's own
 * location names spell them; any other city goes as typed, normalised.
 *
 * Mirrored by web/src/lib/metaCity.ts - the browser Pixel must hash the same
 * city the server does.
 */
'use strict';

// Arabic spellings (without "ال", hamzas and taa marbuta evened out) -> Latin.
const CITIES = {
  طرابلس: 'tripoli',
  بنغازي: 'benghazi',
  مصراته: 'misrata',
  سبها: 'sabha',
  زاويه: 'zawiya',
  زليتن: 'zliten',
  خمس: 'khoms',
  غريان: 'gharyan',
  سرت: 'sirte',
  اجدابيا: 'ajdabiya',
  بيضاء: 'bayda',
  درنه: 'derna',
  طبرق: 'tobruk',
  صبراته: 'sabratha',
  ترهونه: 'tarhuna',
  زواره: 'zuwara',
  مرج: 'marj',
  يفرن: 'yafran',
  نالوت: 'nalut',
  غدامس: 'ghadamis',
  هون: 'hun',
  اوباري: 'ubari',
  مرزق: 'murzuq',
  كفره: 'kufra',
  'بني وليد': 'baniwalid',
  جنزور: 'janzur',
  تاجوراء: 'tajura',
  تاجورا: 'tajura',
};

/** Letters Meta cannot tell apart once hashed are made equal first: أ/إ/آ -> ا, ة -> ه, ى -> ي. */
function evenOut(text) {
  return text
    .replace(/[ً-ْـ]/g, '') // harakat, tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^ال/, '')
    .trim();
}

/** "طرابلس" -> "tripoli"; "New York" -> "newyork"; "" -> "". */
function metaCity(city) {
  const raw = String(city || '').trim();
  if (!raw) return '';
  const key = evenOut(raw.replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' '));
  const known = CITIES[key];
  return (known || raw).toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
}

module.exports = { metaCity, CITIES };
