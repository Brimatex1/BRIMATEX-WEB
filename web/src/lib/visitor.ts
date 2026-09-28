// The browser's stable first-party visitor ID - the `brx_vid` cookie the
// server sets on every page (src/lib/visitor.js), for Meta's external_id.
// If the cookie is missing (blocked, or a cached page), the copy kept in
// storage stands in, or a new one is made and written both ways.

const COOKIE = 'brx_vid';
const VALID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

function readCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)brx_vid=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]).trim().toLowerCase() : '';
  return VALID.test(value) ? value : null;
}

function writeCookie(id: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${id}; Max-Age=${YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

function newId(): string {
  if (crypto?.randomUUID) return crypto.randomUUID();
  // Older browsers: a v4 UUID from random bytes.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let cached: string | null = null;

/** This browser's visitor ID - the same every visit. Null only where storage and cookies are both blocked. */
export function visitorId(): string | null {
  if (cached) return cached;
  try {
    let id = readCookie();
    if (!id) {
      const stored = localStorage.getItem(COOKIE);
      id = stored && VALID.test(stored) ? stored : newId();
      writeCookie(id);
    }
    localStorage.setItem(COOKIE, id);
    cached = id;
    return id;
  } catch {
    return null;
  }
}
