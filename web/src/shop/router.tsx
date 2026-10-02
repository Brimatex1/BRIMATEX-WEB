import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

import { isTierKey } from '@/lib/tiers';

/**
 * The storefront's addresses (the 2026 web handoff, docs/SCREENS.md), kept to
 * what ads, the Meta catalogue and search engines already know:
 *
 *   /                                  home
 *   /mattresses  /mattresses/:tier     a tier, or every mattress (filters in the query)
 *   /offers  /search?q=                discounted ones; search results
 *   /product/:id[?size=180x200&height=24]   a mattress (the Meta catalogue links by id)
 *   /product/:id/reviews               its reviews
 *   /compare?ids=7990,6139             up to three side by side
 *   /cart  /checkout  /checkout/success?order=
 *   /account  /account/orders/:name  /account/orders/:name/issue
 *   /account/addresses|favorites|warranty|loyalty|coupons|notifications|settings
 *   /account/reviews/new?product=&order=
 *   /quiz  /showroom  /help  /privacy  /terms
 *
 * Old addresses still work: /shop?category= becomes /mattresses/:tier,
 * /wishlist the favorites, /orders the account, /points and /vouchers the
 * loyalty add-on's نقاطي and قسائمي.
 * No router library: the server answers every non-API path with the app
 * shell, so the History API is all it takes.
 */
export type Route =
  | { name: 'home' }
  | { name: 'category'; tier: string | null }
  | { name: 'offers' }
  | { name: 'search'; query: string }
  | { name: 'product'; id: number }
  | { name: 'compare'; ids: number[] }
  | { name: 'reviews'; productId: number }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'confirmed'; order: string }
  | { name: 'account'; section: AccountSection }
  | { name: 'order'; orderName: string }
  | { name: 'issue'; orderName: string }
  | { name: 'reviewWrite'; productId: number; orderName: string | null }
  | { name: 'quiz' }
  | { name: 'showroom' }
  | { name: 'help' }
  | { name: 'legal'; page: 'privacy' | 'terms' }
  | { name: 'notFound' };

export type AccountSection = 'orders' | 'addresses' | 'favorites' | 'warranty' | 'loyalty' | 'coupons' | 'notifications' | 'settings';
const ACCOUNT_SECTIONS: AccountSection[] = ['orders', 'addresses', 'favorites', 'warranty', 'loyalty', 'coupons', 'notifications', 'settings'];

export function parse(pathname: string, search: string): Route {
  const path = decodeURI(pathname).replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(search);
  let m: RegExpMatchArray | null;

  if (path === '/') return { name: 'home' };
  if (path === '/mattresses') return { name: 'category', tier: null };
  if ((m = path.match(/^\/mattresses\/([a-z]+)$/))) return isTierKey(m[1]) ? { name: 'category', tier: m[1] } : { name: 'notFound' };
  if (path === '/shop') {
    // The old shop address: a tier, a search, or all of them.
    const category = q.get('category');
    const query = q.get('q')?.trim();
    if (query) return { name: 'search', query };
    return { name: 'category', tier: isTierKey(category) && category !== 'all' ? category : null };
  }
  if (path === '/offers') return { name: 'offers' };
  if (path === '/search') return { name: 'search', query: q.get('q')?.trim() ?? '' };
  if ((m = path.match(/^\/product\/(\d+)$/))) return { name: 'product', id: Number(m[1]) };
  if ((m = path.match(/^\/product\/(\d+)\/reviews$/))) return { name: 'reviews', productId: Number(m[1]) };
  if (path === '/compare') {
    const ids = (q.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return { name: 'compare', ids: [...new Set(ids)].slice(0, 3) };
  }
  if (path === '/cart') return { name: 'cart' };
  if (path === '/checkout') return { name: 'checkout' };
  if (path === '/checkout/success') return { name: 'confirmed', order: q.get('order') ?? '' };
  if (path === '/account' || path === '/orders') return { name: 'account', section: 'orders' };
  if (path === '/points') return { name: 'account', section: 'loyalty' };
  if (path === '/vouchers') return { name: 'account', section: 'coupons' };
  if (path === '/wishlist') return { name: 'account', section: 'favorites' };
  if ((m = path.match(/^\/account\/([a-z]+)$/)) && ACCOUNT_SECTIONS.includes(m[1] as AccountSection)) return { name: 'account', section: m[1] as AccountSection };
  if ((m = path.match(/^\/account\/orders\/([^/]+)$/))) return { name: 'order', orderName: m[1] };
  if ((m = path.match(/^\/account\/orders\/([^/]+)\/issue$/))) return { name: 'issue', orderName: m[1] };
  if (path === '/account/reviews/new') {
    const productId = Number(q.get('product'));
    return Number.isInteger(productId) && productId > 0 ? { name: 'reviewWrite', productId, orderName: q.get('order') } : { name: 'notFound' };
  }
  if (path === '/quiz') return { name: 'quiz' };
  if (path === '/showroom') return { name: 'showroom' };
  if (path === '/help') return { name: 'help' };
  if (path === '/privacy') return { name: 'legal', page: 'privacy' };
  if (path === '/terms') return { name: 'legal', page: 'terms' };
  return { name: 'notFound' };
}

/** The address of a route (its query parameters added by the caller where it has some). */
export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'category':
      return route.tier ? `/mattresses/${route.tier}` : '/mattresses';
    case 'offers':
      return '/offers';
    case 'search':
      return route.query ? `/search?q=${encodeURIComponent(route.query)}` : '/search';
    case 'product':
      return `/product/${route.id}`;
    case 'reviews':
      return `/product/${route.productId}/reviews`;
    case 'compare':
      return route.ids.length ? `/compare?ids=${route.ids.join(',')}` : '/compare';
    case 'cart':
      return '/cart';
    case 'checkout':
      return '/checkout';
    case 'confirmed':
      return `/checkout/success?order=${encodeURIComponent(route.order)}`;
    case 'account':
      return route.section === 'orders' ? '/account' : `/account/${route.section}`;
    case 'order':
      return `/account/orders/${encodeURIComponent(route.orderName)}`;
    case 'issue':
      return `/account/orders/${encodeURIComponent(route.orderName)}/issue`;
    case 'reviewWrite':
      return `/account/reviews/new?product=${route.productId}${route.orderName ? `&order=${encodeURIComponent(route.orderName)}` : ''}`;
    case 'quiz':
      return '/quiz';
    case 'showroom':
      return '/showroom';
    case 'help':
      return '/help';
    case 'legal':
      return `/${route.page}`;
    case 'notFound':
      return '/';
  }
}

interface Location {
  pathname: string;
  search: string;
}

interface RouterApi {
  route: Route;
  location: Location;
  /** Opens an address inside the shop (a new history entry, at the top of the page). */
  go: (to: string | Route, options?: { replace?: boolean; keepScroll?: boolean }) => void;
  /** Changes only the query (filters, the chosen size) - no new history entry, no scroll. */
  setQuery: (params: Record<string, string | null>) => void;
}

const RouterContext = createContext<RouterApi | null>(null);

function current(): Location {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function RouterProvider({ children, onNavigate }: { children: ReactNode; onNavigate?: (location: Location) => void }) {
  const [location, setLocation] = useState<Location>(current);

  // An old address is shown at its new one, so the bar and the history agree.
  useEffect(() => {
    const canonical = canonicalOf(location);
    if (canonical) {
      window.history.replaceState(null, '', canonical);
      setLocation(current());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPop = () => setLocation(current());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback<RouterApi['go']>(
    (to, options) => {
      const target = typeof to === 'string' ? to : href(to);
      if (target === window.location.pathname + window.location.search) return;
      if (options?.replace) window.history.replaceState(null, '', target);
      else window.history.pushState(null, '', target);
      const next = current();
      setLocation(next);
      if (!options?.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      onNavigate?.(next);
    },
    [onNavigate]
  );

  const setQuery = useCallback<RouterApi['setQuery']>((params) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === '') q.delete(k);
      else q.set(k, v);
    }
    const qs = q.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    setLocation(current());
  }, []);

  const api = useMemo<RouterApi>(() => ({ route: parse(location.pathname, location.search), location, go, setQuery }), [location, go, setQuery]);
  return <RouterContext.Provider value={api}>{children}</RouterContext.Provider>;
}

/** The new address of an old one, or null when it is already current. */
function canonicalOf(location: Location): string | null {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (!['/shop', '/wishlist', '/orders', '/vouchers', '/points'].includes(path)) return null;
  return href(parse(location.pathname, location.search));
}

export function useRouter(): RouterApi {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter outside RouterProvider');
  return ctx;
}

/** An in-shop link: a real <a> (opens in a new tab, readable by crawlers), navigated without a reload. */
export function Link({ to, children, onClick, ...rest }: { to: string | Route; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { go } = useRouter();
  const target = typeof to === 'string' ? to : href(to);
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    e.preventDefault();
    go(target);
  }
  return (
    <a href={target} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
