import { useCallback, useEffect, useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';

import { panelApi, PanelError, type PanelMe, type Section } from './api';
import { Loading, NoAccess, PanelLogin } from './Gate';
import { OrdersPage } from './pages/OrdersPage';
import { HomeBannersPage } from './pages/HomeBannersPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { SettingsPage } from './pages/SettingsPage';
import { navigate, parseSection, sectionHref, useLocation } from './router';
import { Shell } from './Shell';

const TITLE: Record<Section, string> = {
  overview: 'نظرة عامة',
  orders: 'الطلبات',
  home: 'الواجهة والبانرات',
  push: 'الإشعارات',
  quiz: 'ساعدني أختار',
  products: 'المراتب',
  reviews: 'التقييمات',
  integrations: 'الربط والتكاملات',
  settings: 'الإعدادات',
};

/**
 * The admin panel at /admin (design/brimatex-admin). The session is the
 * storefront's - the token from the phone sign-in, in localStorage - and the
 * server decides who is staff and which sections they open (/api/panel/me).
 */
export default function PanelApp() {
  const auth = useAuth();
  const { pathname, search } = useLocation();
  const [me, setMe] = useState<PanelMe | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(() => {
    if (!auth.token) return;
    setState('loading');
    panelApi
      .me(auth.token)
      .then((m) => {
        setMe(m);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof PanelError && err.status === 403) setState('denied');
        else if (err instanceof PanelError && err.status === 401) auth.signOut();
        else {
          setError(err instanceof Error ? err.message : 'تعذّر التحميل');
          setState('error');
        }
      });
  }, [auth.token, auth.signOut]);
  useEffect(loadMe, [loadMe]);

  const section = parseSection(pathname);
  // An address outside the role (or one the panel lacks) opens the role's first section.
  const allowed = me && section && me.sections.includes(section) ? section : null;
  useEffect(() => {
    if (me && !allowed && me.sections.length) navigate(sectionHref(me.sections[0]), { replace: true });
  }, [me, allowed]);

  useEffect(() => {
    document.title = `${allowed ? TITLE[allowed] : 'الإدارة'} · إدارة بريماتكس`;
  }, [allowed]);

  /** A sidebar count after an action on the page (an order confirmed, a review decided). */
  const adjustBadge = useCallback((badge: keyof PanelMe['badges'], delta: number) => {
    setMe((m) => {
      const value = m?.badges[badge];
      return m && value != null ? { ...m, badges: { ...m.badges, [badge]: Math.max(0, value + delta) } } : m;
    });
  }, []);
  const adjustOrders = useCallback((delta: number) => adjustBadge('orders', delta), [adjustBadge]);
  const adjustReviews = useCallback((delta: number) => adjustBadge('reviews', delta), [adjustBadge]);

  let body: JSX.Element;
  if (auth.checking || (auth.token && state === 'loading')) body = <Loading />;
  else if (!auth.token || !auth.user) body = <PanelLogin onSignedIn={auth.signIn} />;
  else if (state === 'denied') body = <NoAccess name={auth.user.name} onSignOut={auth.signOut} />;
  else if (state === 'error' || !me) {
    body = (
      <div dir="rtl" className="grid min-h-[100svh] place-items-center bg-[#F5F6FA] font-sans">
        <p className="flex flex-col items-center gap-3 text-sm text-[#A12020]">
          {error}
          <button type="button" className="font-semibold text-dark-ocean underline" onClick={loadMe}>
            إعادة المحاولة
          </button>
        </p>
      </div>
    );
  } else if (!allowed) body = <Loading />;
  else {
    const token = auth.token;
    body = (
      <Shell me={me} current={allowed} onSignOut={auth.signOut}>
        {allowed === 'overview' ? <OverviewPage me={me} token={token} /> : null}
        {allowed === 'orders' ? <OrdersPage me={me} token={token} search={search} onBadgeChange={adjustOrders} /> : null}
        {allowed === 'reviews' ? <ReviewsPage me={me} token={token} search={search} onBadgeChange={adjustReviews} /> : null}
        {allowed === 'integrations' ? <IntegrationsPage me={me} token={token} /> : null}
        {allowed === 'settings' ? <SettingsPage me={me} token={token} /> : null}
        {allowed === 'home' ? <HomeBannersPage me={me} token={token} /> : null}
        {allowed === 'push' || allowed === 'quiz' || allowed === 'products' ? <PlaceholderPage me={me} section={allowed} /> : null}
      </Shell>
    );
  }

  return (
    <>
      {body}
      <Toaster />
    </>
  );
}
