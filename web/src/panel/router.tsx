import { useCallback, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

import type { Section } from './api';

/**
 * The panel's addresses - one per section, like the storefront's router
 * (shop/router.tsx): no library, the server answers each with the app shell.
 *
 *   /admin            نظرة عامة
 *   /admin/orders     الطلبات (filters in the query)
 *   /admin/home  /admin/push  /admin/quiz  /admin/products
 *   /admin/reviews (the filter in the query)  /admin/integrations  /admin/settings
 *
 * /admin/classic is the old dashboard - main.tsx mounts that one instead.
 */
const PATHS: Record<Section, string> = {
  overview: '/admin',
  orders: '/admin/orders',
  home: '/admin/home',
  push: '/admin/push',
  quiz: '/admin/quiz',
  products: '/admin/products',
  reviews: '/admin/reviews',
  integrations: '/admin/integrations',
  settings: '/admin/settings',
};

export function sectionHref(section: Section, query?: Record<string, string>): string {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString() : '';
  return qs ? `${PATHS[section]}?${qs}` : PATHS[section];
}

/** The section an address opens, or null for one the panel does not have. */
export function parseSection(pathname: string): Section | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const hit = (Object.entries(PATHS) as [Section, string][]).find(([, p]) => p === path);
  return hit ? hit[0] : null;
}

const EVENT = 'panel:navigate';

export function navigate(to: string, { replace = false } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
  if (!replace) window.scrollTo({ top: 0 });
}

/** The current address, re-read on every navigation (links, back and forward). */
export function useLocation() {
  const read = () => ({ pathname: window.location.pathname, search: window.location.search });
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener('popstate', on);
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener(EVENT, on);
    };
  }, []);
  return loc;
}

/** Changes the query of the current address, keeping the path. */
export function useQueryUpdater() {
  return useCallback((changes: Record<string, string | number | null>, { replace = false } = {}) => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    const qs = params.toString();
    navigate(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { replace });
  }, []);
}

/** An <a> that moves inside the panel without reloading (a modified click still opens a tab). */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!href.startsWith('/admin') || href.startsWith('/admin/classic')) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
