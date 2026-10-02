import { lazy, Suspense, useEffect, useRef } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { captureClickId, disablePixel, forgetPixelPerson, initPixel, setPixelPerson, trackPageView } from '@/lib/pixel';

import { CityDialog } from './CityDialog';
import { Footer } from './Footer';
import { Header, MinimalHeader } from './Header';
import { RouterProvider, useRouter, type Route } from './router';
import { ShopProvider, useShop } from './state';
import { isShopTier } from './catalog';
import { Container } from './ui';

import { CartDrawer } from './CartDrawer';
import { LoginDrawer } from './LoginDrawer';
import { CartPage } from './pages/CartPage';
import { CategoryPage } from './pages/CategoryPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ComparePage } from './pages/ComparePage';
import { ConfirmedPage } from './pages/ConfirmedPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';

const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage })));

/** Pages that keep the customer on the task: no category nav, a slim footer. */
function isFocused(route: Route): boolean {
  return route.name === 'checkout' || route.name === 'confirmed' || route.name === 'quiz';
}

function PageLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="جارٍ التحميل">
      <span className="size-8 animate-spin rounded-full border-[3px] border-image-bg border-t-primary" />
    </div>
  );
}

function Pages() {
  const { route, location } = useRouter();
  if (import.meta.env.DEV && location.pathname === '/dev/ds') return <DesignSystemPage />;
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'category':
      return <CategoryPage key={route.tier ?? 'all'} mode={{ kind: 'tier', tier: isShopTier(route.tier) ? route.tier : null }} />;
    case 'offers':
      return <CategoryPage key="offers" mode={{ kind: 'offers' }} />;
    case 'search':
      return <CategoryPage key={`s:${route.query}`} mode={{ kind: 'search', query: route.query }} />;
    case 'product':
      return <ProductPage key={route.id} id={route.id} />;
    case 'compare':
      return <ComparePage ids={route.ids} />;
    case 'cart':
      return <CartPage />;
    case 'checkout':
      return <CheckoutPage />;
    case 'confirmed':
      return <ConfirmedPage order={route.order} />;
    case 'account':
      // Favourites work signed out (the rest of the account arrives with phase 3).
      if (route.section === 'favorites') return <FavoritesPage />;
      break;
  }
  // The pages arrive phase by phase (design handoff build order).
  return (
    <Container className="py-24 text-center text-muted-foreground">
      <p>هذه الصفحة قيد البناء ({route.name}).</p>
    </Container>
  );
}

/** Meta Pixel and Advanced Matching, as the old storefront did (lib/pixel.ts). */
function Tracking() {
  const shop = useShop();
  useEffect(() => {
    captureClickId();
    trackPageView();
    api
      .getPixelConfig()
      .then(({ pixelId, lydPerUsd }) => (pixelId ? initPixel(pixelId, lydPerUsd) : disablePixel()))
      .catch(() => disablePixel());
  }, []);

  const wasSignedIn = useRef(false);
  const user = shop.auth.user;
  useEffect(() => {
    if (user) void setPixelPerson({ id: user.id, name: user.name, phone: user.phone, city: user.addresses?.[0]?.city });
    else if (wasSignedIn.current) void forgetPixelPerson();
    else void setPixelPerson(null);
    wasSignedIn.current = Boolean(user);
  }, [user]);
  return null;
}

function Layout() {
  const { route } = useRouter();
  const focused = isFocused(route);
  return (
    <div className="flex min-h-[100svh] flex-col bg-background font-sans text-foreground">
      <a href="#main" className="sr-only absolute start-0 top-0 focus:not-sr-only focus:z-50 focus:rounded-b-md focus:bg-primary focus:px-6 focus:py-2 focus:text-sm focus:text-primary-foreground">
        تخطّي إلى المحتوى
      </a>
      {focused ? <MinimalHeader title={route.name === 'checkout' ? 'إتمام الطلب' : route.name === 'quiz' ? 'ساعدني أختار' : 'تم الطلب'} back={route.name === 'checkout' ? { label: 'العودة إلى السلة', to: { name: 'cart' } } : undefined} /> : <Header />}
      <main id="main" className="flex-1">
        <Suspense fallback={<PageLoading />}>
          <Pages />
        </Suspense>
      </main>
      <Footer slim={focused} />
      <CityDialog />
      <CartDrawer />
      <LoginDrawer />
      <Tracking />
      <Toaster position="top-center" dir="rtl" />
    </div>
  );
}

/** The storefront (the 2026 web handoff). The dashboard stays at /admin (AdminApp). */
export function ShopApp() {
  return (
    // Every move inside the shop is a virtual page load, so it gets its own PageView.
    <RouterProvider onNavigate={() => trackPageView()}>
      <ShopProvider>
        <Layout />
      </ShopProvider>
    </RouterProvider>
  );
}
