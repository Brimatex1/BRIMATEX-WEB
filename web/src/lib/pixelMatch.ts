// Advanced Matching for the browser Pixel: who the visitor is - phone, name,
// city, and one stable ID - so Meta can tie a view or an add-to-cart to a
// person, not just to a browser.
//
// Hashed here with SHA-256, after the very same normalising the server applies
// to the Conversions API's purchases (src/lib/meta-capi.js) - so a customer is
// one person to Meta whichever path an event took. Meta takes pre-hashed
// values as they are; nothing personal leaves the browser in the clear.

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
    ct: await hashed(String(person.city ?? '').replace(/[\p{P}\p{S}\s]/gu, '')),
    country: await hashed('ly'),
    // The same stable ID as the server: the account when signed in, otherwise the phone.
    external_id: person.id ? await hashed(`user:${person.id}`) : ph,
  };
  return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => Boolean(entry[1])));
}
