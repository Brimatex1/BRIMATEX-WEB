import type { Category, SectionId } from '@/types';

/**
 * Every screen has its own address, so an ad, a WhatsApp message or a Meta
 * catalogue item can link straight to it, and the phone's back button walks
 * the visitor's own history instead of leaving the site.
 *
 *   /                          home
 *   /shop?category=mattress&q= shop, optionally filtered
 *   /product/12                one product
 *   /quiz  /cart  /account  /wishlist  /orders  /admin
 *
 * No router library: the server already answers every non-API path with the
 * app shell (serveStatic in src/server.js), so the History API is all it takes.
 */
export interface Route {
  section: SectionId;
  productId?: number;
  category?: Category | 'all';
  query?: string;
}

const PATHS: Record<Exclude<SectionId, 'home' | 'product'>, string> = {
  shop: '/shop',
  quiz: '/quiz',
  cart: '/cart',
  auth: '/account',
  wishlist: '/wishlist',
  orders: '/orders',
  admin: '/admin',
};

const CATEGORIES: readonly (Category | 'all')[] = ['all', 'mattress', 'pillow', 'bedding'];

export function parseRoute(location: Pick<Location, 'pathname' | 'search'>): Route {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(location.search);

  const product = path.match(/^\/product\/(\d+)$/);
  if (product) return { section: 'product', productId: Number(product[1]) };

  const section = (Object.keys(PATHS) as (keyof typeof PATHS)[]).find((s) => PATHS[s] === path);
  if (section === 'shop') {
    const category = params.get('category') as Category | 'all' | null;
    return {
      section,
      category: category && CATEGORIES.includes(category) ? category : 'all',
      query: params.get('q') ?? '',
    };
  }
  // Unknown paths fall back to home rather than a dead end.
  return { section: section ?? 'home' };
}

/**
 * The address for a route. Query parameters the visitor arrived with (utm_*,
 * fbclid) are left behind on purpose: the Pixel reads them once, on landing.
 */
export function routePath(route: Route): string {
  if (route.section === 'home') return '/';
  if (route.section === 'product') return `/product/${route.productId}`;
  const base = PATHS[route.section];
  if (route.section !== 'shop') return base;
  const params = new URLSearchParams();
  if (route.category && route.category !== 'all') params.set('category', route.category);
  if (route.query?.trim()) params.set('q', route.query.trim());
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
