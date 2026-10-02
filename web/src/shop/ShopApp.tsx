import { lazy, Suspense, useEffect, useRef } from 'react';

import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { captureClickId, disablePixel, forgetPixelPerson, initPixel, setPixelPerson, trackPageView } from '@/lib/pixel';

import { CityDialog } from './CityDialog';
import { Footer } from './Footer';
import { Header, MinimalHeader } from './Header';
import { RouterProvider, useRouter, type Route } from './router';
import { ShopProvider, useShop } from './state';
import { isShopTier } from './catalog';
import { productHrefForSlug } from './marketing';

import { AccountLayout } from './account/AccountLayout';
import { AddressesPage, NotificationsPage, SettingsPage } from './account/AccountPages';
import { IssuePage } from './account/IssuePage';
import { CouponsPage, LoyaltyPage } from './account/LoyaltyPages';
import { OrderPage, OrdersPage } from './account/OrderPages';
import { WarrantyPage } from './account/WarrantyPage';
import { CartDrawer } from './CartDrawer';
import { LoginDrawer } from './LoginDrawer';
import { CartPage } from './pages/CartPage';
import { CategoryPage } from './pages/CategoryPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ComparePage } from './pages/ComparePage';
import { ConfirmedPage } from './pages/ConfirmedPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HomePage } from './pages/HomePage';
import { LegalPage } from './pages/LegalPage';
import { ErrorPage, NotFoundPage, PageErrorBoundary } from './pages/NotFoundPage';
import { ProductPage } from './pages/ProductPage';
import { QuizPage } from './pages/QuizPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { ReviewWritePage } from './pages/ReviewWritePage';
import { ShowroomPage } from './pages/ShowroomPage';
import { SupportPage } from './pages/SupportPage';

const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage })));

/** Pages that keep the customer on the task: no category nav, a slim footer. */
function isFocused(route: Route): boolean {
  return route.name === 'checkout' || route.name === 'confirmed' || route.name === 'quiz';
}

/** Pages that are nothing without the catalogue. */
const CATALOGUE_PAGES = new Set<Route['name']>(['home', 'category', 'offers', 'search', 'product', 'marketing', 'compare', 'reviews', 'reviewWrite', 'cart', 'checkout']);

/**
 * /p/<slug>[?variant=]: the mattress the marketing link names, at its own
 * address (/product/<id>?size=) once the catalogue is in - or the 404 page.
 */
function MarketingLink({ slug, variant }: { slug: string; variant: number | null }) {
  const { go } = useRouter();
  const shop = useShop();
  const target = shop.products.length ? productHrefForSlug(slug, variant, shop.products) : null;
  useEffect(() => {
    if (target) go(target, { replace: true });
  }, [target, go]);
  if (target || shop.loading || (!shop.products.length && !shop.error)) return <PageLoading />;
  return <NotFoundPage />;
}

/**
 * Offline (MOTION.md «Offline»): a toast while the connection is gone, then
 * «عاد الاتصال» for two seconds when it is back.
 */
function ConnectionNotice() {
  useEffect(() => {
    const ID = 'connection';
    const off = () => toast.error('لا يوجد اتصال بالإنترنت', { id: ID, duration: Infinity, description: 'تحقّق من الاتصال، وسنكمل من حيث توقفت.' });
    const on = () => toast.success('عاد الاتصال', { id: ID, duration: 2000, description: undefined });
    if (!navigator.onLine) off();
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, []);
  return null;
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
  const shop = useShop();
  if (import.meta.env.DEV && location.pathname === '/dev/ds') return <DesignSystemPage />;
  // The catalogue did not load: say so, with a retry - never an empty grid that looks like «no results».
  if (shop.error && !shop.products.length && CATALOGUE_PAGES.has(route.name)) return <ErrorPage onRetry={() => void shop.reload()} />;
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
    case 'marketing':
      return <MarketingLink slug={route.slug} variant={route.variant} />;
    case 'reviews':
      return <ReviewsPage key={route.productId} productId={route.productId} />;
    case 'reviewWrite':
      return <ReviewWritePage key={`${route.productId}:${route.orderName ?? ''}`} productId={route.productId} orderName={route.orderName} />;
    case 'quiz':
      return <QuizPage />;
    case 'showroom':
      return <ShowroomPage />;
    case 'help':
      return <SupportPage />;
    case 'legal':
      return <LegalPage key={route.page} page={route.page} />;
    case 'notFound':
      return <NotFoundPage />;
    case 'compare':
      return <ComparePage ids={route.ids} />;
    case 'cart':
      return <CartPage />;
    case 'checkout':
      return <CheckoutPage />;
    case 'confirmed':
      return <ConfirmedPage order={route.order} />;
    case 'account':
      switch (route.section) {
        case 'orders':
          return <OrdersPage />;
        case 'addresses':
          return <AddressesPage />;
        case 'settings':
          return <SettingsPage />;
        case 'notifications':
          return <NotificationsPage />;
        case 'warranty':
          return <WarrantyPage />;
        case 'loyalty':
          return <LoyaltyPage />;
        case 'coupons':
          return <CouponsPage />;
        case 'favorites':
          // Favourites work signed out; signed in they sit in the account's frame.
          return shop.auth.user ? (
            <AccountLayout section="favorites" crumbs={[{ label: 'المفضّلة' }]}>
              <FavoritesPage embedded />
            </AccountLayout>
          ) : (
            <FavoritesPage />
          );
      }
      break;
    case 'order':
      return <OrderPage key={route.orderName} orderName={route.orderName} />;
    case 'issue':
      return <IssuePage key={route.orderName} orderName={route.orderName} />;
  }
  return <NotFoundPage />;
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
  const { route, location } = useRouter();
  const focused = isFocused(route);
  return (
    <div className="flex min-h-[100svh] flex-col bg-background font-sans text-foreground">
      <a href="#main" className="sr-only absolute start-0 top-0 focus:not-sr-only focus:z-50 focus:rounded-b-md focus:bg-primary focus:px-6 focus:py-2 focus:text-sm focus:text-primary-foreground">
        تخطّي إلى المحتوى
      </a>
      {focused ? <MinimalHeader title={route.name === 'checkout' ? 'إتمام الطلب' : route.name === 'quiz' ? 'ساعدني أختار' : 'تم الطلب'} back={route.name === 'checkout' ? { label: 'العودة إلى السلة', to: { name: 'cart' } } : route.name === 'quiz' ? { label: 'خروج', to: { name: 'home' } } : undefined} /> : <Header />}
      <main id="main" className="flex-1">
        <PageErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoading />}>
            <Pages />
          </Suspense>
        </PageErrorBoundary>
      </main>
      <Footer slim={focused} />
      <CityDialog />
      <CartDrawer />
      <LoginDrawer />
      <Tracking />
      <ConnectionNotice />
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
