import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';

import { AdminSection } from '@/components/AdminSection';
import { AuthSection } from '@/components/AuthSection';
import { BrimatexLogo } from '@/components/BrimatexLogo';
import { Header } from '@/components/Header';
import { CartScreen } from '@/components/app/CartScreen';
import { Catalogue } from '@/components/app/Catalogue';
import { HomeScreen } from '@/components/app/HomeScreen';
import { ProductScreen } from '@/components/app/ProductScreen';
import { TabBar } from '@/components/app/TabBar';
import { TopBar } from '@/components/app/TopBar';
import { WishlistScreen } from '@/components/app/WishlistScreen';
import { OrdersSection } from '@/components/OrdersSection';
import { QuizSection } from '@/components/QuizSection';
import { SocialLinks } from '@/components/SocialLinks';
import { SupportWidget } from '@/components/SupportWidget';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useIsPhone } from '@/hooks/useIsPhone';
import { useProducts } from '@/hooks/useProducts';
import { useWishlist } from '@/hooks/useWishlist';
import { api } from '@/lib/api';
import { captureClickId, disablePixel, initPixel, trackAddToCart, trackPageView, trackViewContent } from '@/lib/pixel';
import { parseRoute, routePath, type Route } from '@/lib/route';
import type { Address, Category, Product, SectionId } from '@/types';

const DEFAULT_TITLE = document.title;

/**
 * Phone screen titles, as the iOS app's headers show them. Home has none - it
 * draws its own header, as in the app. Sections not listed here are tabs,
 * which get a title but no back arrow.
 */
const PHONE_TITLE: Partial<Record<SectionId, string>> = {
  product: 'تفاصيل المنتج',
  quiz: 'ساعدني أختار',
  wishlist: 'المفضّلة',
  cart: 'السلة',
  auth: 'حسابي',
  orders: 'طلباتي',
  admin: 'لوحة التحكم',
};
/** Screens pushed on top of a tab: they get a back arrow. */
const PUSHED: SectionId[] = ['shop', 'product', 'quiz', 'orders', 'admin'];

export default function App() {
  // The first screen comes from the address, so a link from an ad lands on it.
  const [landing] = useState(() => parseRoute(window.location));
  const [section, setSection] = useState<SectionId>(landing.section);
  const [selectedId, setSelectedId] = useState<number | null>(landing.productId ?? null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [shopCategory, setShopCategory] = useState<Category | 'all'>(landing.category ?? 'all');
  const [shopQuery, setShopQuery] = useState(landing.query ?? '');

  // One design at every size - the iOS app's (components/app). Phones also
  // get the app's navigation chrome: a top bar per screen and the tab bar.
  const isPhone = useIsPhone();
  /** Screens opened inside the site this visit - "back" leaves it only at zero. */
  const depth = useRef(0);

  const catalogue = useProducts();
  const cart = useCart();
  const auth = useAuth();
  const wishlist = useWishlist(auth.token, auth.user);

  // Loads the admin-configured Pixel ID (if any). The first PageView is queued
  // now, before the ViewContent of a product landing, so Meta receives them in
  // page order once the Pixel is up. A no-op when unconfigured — see lib/pixel.ts.
  useEffect(() => {
    captureClickId();
    trackPageView();
    api
      .getPixelConfig()
      .then(({ pixelId, lydPerUsd }) => (pixelId ? initPixel(pixelId, lydPerUsd) : disablePixel()))
      .catch(() => disablePixel());

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Puts a route on screen. Shared by in-app navigation and the back button. */
  function show(route: Route) {
    setSection(route.section);
    if (route.productId !== undefined) setSelectedId(route.productId);
    if (route.section === 'shop') {
      setShopCategory(route.category ?? 'all');
      setShopQuery(route.query ?? '');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Every screen change is a virtual page load, so it gets its own PageView.
    trackPageView();
  }

  function go(route: Route) {
    window.history.pushState(null, '', routePath(route));
    depth.current += 1;
    show(route);
  }

  /**
   * The top bar's back arrow. Within the visit it is the browser's back; a
   * visitor who landed straight on this page (an ad, a shared link) has
   * nothing behind it on this site, so it goes home instead of leaving.
   */
  function back() {
    if (depth.current > 0) window.history.back();
    else navigate('home');
  }

  function navigate(next: SectionId) {
    go({ section: next });
  }

  // The browser's back and forward buttons move between screens, not off the site.
  useEffect(() => {
    const onPop = () => {
      depth.current = Math.max(0, depth.current - 1);
      show(parseRoute(window.location));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters typed in the shop update its address in place - no history entry per keystroke.
  useEffect(() => {
    if (section !== 'shop') return;
    const path = routePath({ section: 'shop', category: shopCategory, query: shopQuery });
    if (path !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', path);
    }
  }, [section, shopCategory, shopQuery]);

  function openProduct(product: Product) {
    go({ section: 'product', productId: product.id });
  }

  /** The quiz's "browse everything" - the catalogue, optionally filtered. */
  function shopCategoryFrom(category: Category | 'all') {
    go({ section: 'shop', category, query: '' });
  }

  function handleAdd(product: Product) {
    const existing = cart.lines.find((l) => l.id === product.id);
    cart.add(product);
    toast.success(existing ? `تم تحديث الكمية: ${product.name}` : `تمت إضافة: ${product.name}`);
    trackAddToCart(product);

    setJustAddedId(product.id);
    window.setTimeout(() => setJustAddedId((id) => (id === product.id ? null : id)), 1200);
  }

  async function handleToggleWishlist(product: Product) {
    if (!auth.user) {
      toast.error('سجّل الدخول لحفظ المفضلة');
      navigate('auth');
      return;
    }
    try {
      const nowSaved = await wishlist.toggle(product.id);
      toast.success(nowSaved ? `أُضيف للمفضلة: ${product.name}` : `أُزيل من المفضلة: ${product.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث المفضلة');
    }
  }

  function handleAddressesChange(addresses: Address[]) {
    auth.patchUser({ addresses });
  }

  const selected = catalogue.products.find((p) => p.id === selectedId) ?? null;

  // ViewContent fires here rather than on click, so a visitor who lands on a
  // product straight from an ad counts too - once the catalogue has loaded.
  const viewedId = section === 'product' ? selected?.id : undefined;
  useEffect(() => {
    if (!selected || viewedId === undefined) return;
    trackViewContent(selected);
    document.title = `${selected.name} — بريماتكس`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedId]);

  const productRelated = selected
    ? catalogue.products.filter((p) => p.id !== selected.id && p.category === selected.category)
    : [];

  return (
    // The app's look everywhere: white screens, Plex, and .app-skin for the
    // pages built from the shared primitives (index.css).
    <div className="app-skin min-h-[100svh] bg-white font-app">
      {/* start-0/top-0 even while hidden: sr-only is absolute but without an
          inset it keeps its static position, which in RTL lands past the right
          edge and adds ~20px of horizontal scroll on narrow screens. */}
      <a
        href="#main"
        className="sr-only absolute top-0 start-0 focus:not-sr-only focus:z-50 focus:rounded-b-md focus:bg-primary focus:px-6 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        تخطّي إلى المحتوى
      </a>

      {isPhone ? (
        section !== 'home' && (
          <TopBar
            title={section === 'shop' ? (shopQuery.trim() ? 'نتائج البحث' : 'كل المنتجات') : (PHONE_TITLE[section] ?? '')}
            onBack={PUSHED.includes(section) ? back : undefined}
          />
        )
      ) : (
        <Header
          active={section}
          cartCount={cart.count}
          isAdmin={auth.user?.role === 'admin'}
          onNavigate={navigate}
        />
      )}

      <main
        id="main"
        // Phones: clear of the tab bar at the bottom
        className={isPhone ? 'min-h-[100svh] pb-[calc(72px+env(safe-area-inset-bottom))]' : 'min-h-[70vh]'}
      >
        {section === 'home' && (
          <HomeScreen
            user={auth.user}
            products={catalogue.products}
            loading={catalogue.loading}
            error={catalogue.error}
            onReload={catalogue.reload}
            isSaved={wishlist.has}
            wishlistPending={wishlist.pending}
            onOpen={openProduct}
            onToggleWishlist={handleToggleWishlist}
            onNavigate={navigate}
          />
        )}

        {section === 'quiz' && (
          <QuizSection
            products={catalogue.products}
            onAdd={handleAdd}
            onOpenProduct={openProduct}
            onBrowseAll={() => shopCategoryFrom('all')}
          />
        )}

        {section === 'shop' && (
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-4 md:px-8 md:pb-16 md:pt-10">
            {!isPhone && (
              <h1 className="mb-5 text-[34px] font-bold text-app-text">
                {shopQuery.trim() ? 'نتائج البحث' : 'كل المنتجات'}
              </h1>
            )}
            <Catalogue
              products={catalogue.products}
              loading={catalogue.loading}
              error={catalogue.error}
              onReload={catalogue.reload}
              query={shopQuery}
              onQueryChange={setShopQuery}
              category={shopCategory}
              onCategoryChange={setShopCategory}
              isSaved={wishlist.has}
              wishlistPending={wishlist.pending}
              onOpen={openProduct}
              onToggleWishlist={handleToggleWishlist}
            />
          </div>
        )}

        {section === 'product' &&
          (selected ? (
            <ProductScreen
              product={selected}
              related={productRelated}
              justAddedId={justAddedId}
              saved={wishlist.has(selected.id)}
              wishlistPending={wishlist.pending === selected.id}
              onAdd={handleAdd}
              onBuyNow={(p) => {
                handleAdd(p);
                navigate('cart');
              }}
              onToggleWishlist={handleToggleWishlist}
              onOpenProduct={openProduct}
            />
          ) : (
            <p className="px-5 py-24 text-center text-app-muted">
              {catalogue.loading ? 'جارٍ التحميل…' : 'المنتج غير موجود'}
            </p>
          ))}

        {section === 'wishlist' && (
          <WishlistScreen
            user={auth.user}
            products={catalogue.products}
            savedIds={wishlist.ids}
            onAdd={handleAdd}
            onOpen={openProduct}
            onToggleWishlist={handleToggleWishlist}
            onGoToAuth={() => navigate('auth')}
            onContinueShopping={() => navigate('home')}
          />
        )}

        {section === 'orders' && (
          <OrdersSection
            user={auth.user}
            token={auth.token}
            products={catalogue.products}
            onGoToAuth={() => navigate('auth')}
            onContinueShopping={() => navigate('home')}
          />
        )}

        {section === 'cart' && (
          <CartScreen
            lines={cart.lines}
            total={cart.total}
            products={catalogue.products}
            wishlistIds={wishlist.ids}
            user={auth.user}
            token={auth.token}
            onSetQty={cart.setQty}
            onRemove={(id) => {
              cart.remove(id);
              toast.success('تم حذف المنتج');
            }}
            onClear={cart.clear}
            onAdd={handleAdd}
            onOpen={openProduct}
            onToggleWishlist={handleToggleWishlist}
            onContinueShopping={() => navigate('home')}
            onViewOrders={() => navigate('orders')}
          />
        )}

        {section === 'admin' && (
          <AdminSection
            user={auth.user}
            token={auth.token}
            onGoHome={() => navigate('home')}
          />
        )}

        {section === 'auth' && (
          <AuthSection
            user={auth.user}
            token={auth.token}
            checking={auth.checking}
            onSignIn={auth.signIn}
            onSignOut={auth.signOut}
            onAddressesChange={handleAddressesChange}
            onGoToWishlist={() => navigate('wishlist')}
            onGoToOrders={() => navigate('orders')}
          />
        )}
      </main>

      {/* The app has no footer; on phones the tab bar ends the page */}
      {!isPhone && (
        <footer className="bg-app-ocean pt-12 text-center text-sm text-white/80">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-8 pb-8">
            {/* currentColor puts the mark in white here, not the navy it ships as */}
            <BrimatexLogo className="mb-4 h-16 w-auto text-white" />
            <p>تجربة 30 ليلة · توصيل مجاني · ضمان حتى 10 سنوات لبعض المنتجات</p>
            <p className="mt-2 flex items-center gap-1.5 text-white/70">
              <MapPin className="size-4" aria-hidden="true" />
              طرابلس، ليبيا
            </p>
            <SocialLinks className="mt-5" />
          </div>
          <div className="border-t border-white/10 py-4">
            <p className="text-xs text-white/60">
              © 2026 بريماتكس لصناعة الإسفنج الصناعي والمراتب. جميع الحقوق محفوظة.
            </p>
          </div>
        </footer>
      )}

      {/* Not on the dashboard. On a phone the round button stays off the two
          screens with a fixed bottom bar it would cover - the product page
          (which has its own "ask about this product" card, as in the app)
          and the cart. */}
      {section !== 'admin' && (
        <SupportWidget
          launcher={!(isPhone && (section === 'product' || section === 'cart'))}
          user={auth.user}
          token={auth.token}
          // Phones: above the tab bar
          className={isPhone ? 'bottom-[calc(88px+env(safe-area-inset-bottom))]' : undefined}
        />
      )}

      {isPhone && <TabBar active={section} cartCount={cart.count} onNavigate={navigate} />}

      <Toaster />
    </div>
  );
}
