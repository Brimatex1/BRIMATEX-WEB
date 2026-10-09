import { lazy, Suspense, useEffect, useRef } from 'react';

import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { captureClickId, disablePixel, forgetPixelPerson, initPixel, setPixelCity, setPixelPerson, trackPageView } from '@/lib/pixel';

import { CityDialog } from './CityDialog';
import { Footer } from './Footer';
import { Header, MinimalHeader } from './Header';
import { RouterProvider, useRouter, type Route } from './router';
import { ShopProvider, useShop } from './state';
import { isShopTier } from './catalog';
import { productHrefForSlug } from './marketing';

import { CartDrawer } from './CartDrawer';
import { LoginDrawer } from './LoginDrawer';
import { CategoryPage } from './pages/CategoryPage';
import { HomePage } from './pages/HomePage';
import { ErrorPage, NotFoundPage, PageErrorBoundary } from './pages/NotFoundPage';
import { ProductPage } from './pages/ProductPage';

/**
 * The pages an ad lands on - the home, a category, a mattress - come with the
 * first download; every other page is its own file, fetched when it is first
 * opened (the whole shop was one 660 KB file). The cart and the checkout are
 * fetched ahead once the page is idle, so going to pay never waits.
 */
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const loadAccountPages = () => import('./account/AccountPages');
const loadCart = () => import('./pages/CartPage');
const loadCheckout = () => import('./pages/CheckoutPage');
const AccountLayout = page(() => import('./account/AccountLayout'), 'AccountLayout');
const AddressesPage = page(loadAccountPages, 'AddressesPage');
const NotificationsPage = page(loadAccountPages, 'NotificationsPage');
const SettingsPage = page(loadAccountPages, 'SettingsPage');
const IssuePage = page(() => import('./account/IssuePage'), 'IssuePage');
const CouponsPage = page(() => import('./account/LoyaltyPages'), 'CouponsPage');
const LoyaltyPage = page(() => import('./account/LoyaltyPages'), 'LoyaltyPage');
const OrderPage = page(() => import('./account/OrderPages'), 'OrderPage');
const OrdersPage = page(() => import('./account/OrderPages'), 'OrdersPage');
const WarrantyPage = page(() => import('./account/WarrantyPage'), 'WarrantyPage');
const CartPage = page(loadCart, 'CartPage');
const CheckoutPage = page(loadCheckout, 'CheckoutPage');
const ComparePage = page(() => import('./pages/ComparePage'), 'ComparePage');
const ConfirmedPage = page(() => import('./pages/ConfirmedPage'), 'ConfirmedPage');
const FavoritesPage = page(() => import('./pages/FavoritesPage'), 'FavoritesPage');
const LegalPage = page(() => import('./pages/LegalPage'), 'LegalPage');
const QuizPage = page(() => import('./pages/QuizPage'), 'QuizPage');
const ReviewsPage = page(() => import('./pages/ReviewsPage'), 'ReviewsPage');
const ReviewWritePage = page(() => import('./pages/ReviewWritePage'), 'ReviewWritePage');
const ShowroomPage = page(() => import('./pages/ShowroomPage'), 'ShowroomPage');
const DeleteAccountPage = page(() => import('./pages/DeleteAccountPage'), 'DeleteAccountPage');
const SupportPage = page(() => import('./pages/SupportPage'), 'SupportPage');

/** The cart and the checkout, fetched while nothing else is happening. */
function usePrefetchCheckout() {
  useEffect(() => {
    const go = () => void Promise.all([loadCart(), loadCheckout()]).catch(() => undefined);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 4000 });
    else window.setTimeout(go, 2500);
  }, []);
}

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
    case 'deleteAccount':
      return <DeleteAccountPage />;
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

  // The delivery city they chose, as their city for Meta until an account gives one.
  // Set before the person below, so the first events already carry it.
  const city = shop.city;
  useEffect(() => {
    void setPixelCity(city ?? null);
  }, [city]);

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
  usePrefetchCheckout();
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
