/** The mattresses this browser opened last, newest first (the empty cart's «شاهدتها مؤخراً»). */
const KEY = 'brimatex:recent';
const MAX = 8;

export function recordViewed(productId: number) {
  try {
    const list = readViewed().filter((id) => id !== productId);
    localStorage.setItem(KEY, JSON.stringify([productId, ...list].slice(0, MAX)));
  } catch {
    /* Private mode: nothing remembered */
  }
}

export function readViewed(): number[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}
