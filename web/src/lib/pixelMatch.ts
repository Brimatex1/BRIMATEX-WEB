// Advanced Matching for the browser Pixel: who the visitor is - phone, name,
// city, and one stable ID - so Meta can tie a view or an add-to-cart to a
// person, not just to a browser.
//
// Hashed here with SHA-256, after the very same normalising the server applies
// to the Conversions API's purchases (src/lib/meta-capi.js) - so a customer is
// one person to Meta whichever path an event took. Meta takes pre-hashed
// values as they are; nothing personal leaves the browser in the clear.

/* ------------------------------------------------------------------ city */
// The customer's city as Meta matches it (user_data.ct): Latin, lowercase, no
// punctuation, no spaces - "طرابلس" -> "tripoli". Mirrors the server's
// src/lib/metaCity.js: the Pixel must hash the same city the Conversions API does.

// Arabic spellings (without "ال", hamzas and taa marbuta evened out) -> Latin.
const CITIES: Record<string, string> = {
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
function evenOut(text: string): string {
  return text
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^ال/, '')
    .trim();
}

export function metaCity(city: string | null | undefined): string {
  const raw = String(city ?? '').trim();
  if (!raw) return '';
  const key = evenOut(raw.replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' '));
  return (CITIES[key] || raw).toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
}

export interface PixelPerson {
  /** The account's ID when signed in - the server's external_id is `user:<id>` too. */
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lowercase, trimmed, hashed - or undefined when empty, so the key is left out. */
async function hashed(value: string | null | undefined): Promise<string | undefined> {
  const v = String(value ?? '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

/** 0912345678 / +218912345678 / 00218912345678 -> 218912345678, as on the server. */
export function toInternational(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00218')) return digits.slice(2);
  if (digits.startsWith('218')) return digits;
  if (digits.startsWith('0')) return `218${digits.slice(1)}`;
  return `218${digits}`;
}

/** The person's hashed fields, in the keys fbq('init') takes. Empty fields are left out. */
export async function matchData(person: PixelPerson): Promise<Record<string, string>> {
  const [first, ...rest] = String(person.name ?? '').trim().split(/\s+/);
  const last = rest.length ? rest[rest.length - 1] : '';
  const digits = String(person.phone ?? '').replace(/\D/g, '');
  const ph = digits ? await sha256(toInternational(digits)) : undefined;

  const data: Record<string, string | undefined> = {
    ph,
    fn: await hashed(first.replace(/[\p{P}\p{S}]/gu, '')),
    ln: await hashed(last.replace(/[\p{P}\p{S}]/gu, '')),
    ct: await hashed(metaCity(person.city)),
    country: await hashed('ly'),
    // The same stable ID as the server: the account when signed in, otherwise the phone.
    external_id: person.id ? await hashed(`user:${person.id}`) : ph,
  };
  return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => Boolean(entry[1])));
}
