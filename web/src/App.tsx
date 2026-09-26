import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CartScreen } from '@/components/app/CartScreen';
import { WishlistScreen } from '@/components/app/WishlistScreen';
import { CartSheet } from '@/components/store/CartSheet';
import { HomePage } from '@/components/store/HomePage';
import { ProductPage } from '@/components/store/ProductPage';
import { ShopPage } from '@/components/store/ShopPage';
import { SiteFooter } from '@/components/store/SiteFooter';
import { SiteHeader } from '@/components/store/SiteHeader';
import { SupportWidget } from '@/components/SupportWidget';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { usePerks } from '@/hooks/usePerks';
import { useProducts } from '@/hooks/useProducts';
import { useWishlist } from '@/hooks/useWishlist';
import { api } from '@/lib/api';
import { captureClickId, disablePixel, initPixel, setPixelPerson, trackAddToCart, trackPageView, trackViewContent } from '@/lib/pixel';
import { titleFor } from '@/lib/pageTitle';
import { parseRoute, routePath, type Route } from '@/lib/route';
import { tiersOf, type TierFilter } from '@/lib/tiers';
import type { Address, Product, SectionId } from '@/types';

/*
 * Screens a visitor from an ad rarely opens first are fetched when opened, not
 * with the page: the dashboard above all, which only admins ever see. Home,
 * the shop, a product and the cart - the path from an ad to an order - stay in
 * the first download.
 */
const AdminSection = lazy(() => import('@/components/AdminSection').then((m) => ({ default: m.AdminSection })));
const AuthSection = lazy(() => import('@/components/AuthSection').then((m) => ({ default: m.AuthSection })));
const OrdersSection = lazy(() => import('@/components/OrdersSection').then((m) => ({ default: m.OrdersSection })));
const QuizScreen = lazy(() => import('@/components/app/QuizScreen').then((m) => ({ default: m.QuizScreen })));
const VouchersScreen = lazy(() => import('@/components/app/VouchersScreen').then((m) => ({ default: m.VouchersScreen })));
const PointsScreen = lazy(() => import('@/components/app/PointsScreen').then((m) => ({ default: m.PointsScreen })));

/** Shown for the moment a screen above is on its way. */
function ScreenLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="جارٍ التحميل">
      <span className="size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
    </div>
  );
}


export default function App() {
  // The first screen comes from the address, so a link from an ad lands on it.
  const [landing] = useState(() => parseRoute(window.location));
  const [section, setSection] = useState<SectionId>(landing.section);
  const [selectedId, setSelectedId] = useState<number | null>(landing.productId ?? null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [shopCategory, setShopCategory] = useState<TierFilter>(landing.category ?? 'all');
  const [shopQuery, setShopQuery] = useState(landing.query ?? '');

  /** The cart drawer, opened from the header's bag and after adding a mattress. */
  const [cartOpen, setCartOpen] = useState(false);
  /** Screens opened inside the site this visit - "back" leaves it only at zero. */
  const depth = useRef(0);

  const catalogue = useProducts();
  const cart = useCart();
  const auth = useAuth();
  const wishlist = useWishlist(auth.token, auth.user);
  const loyalty = usePerks(auth.token);

  // Loyalty follows what the customer just did - an order, a saved product -
  // so it is re-read on the screens that show it.
  useEffect(() => {
    if (['home', 'vouchers', 'points', 'cart', 'auth'].includes(section)) void loyalty.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

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

  // Advanced Matching: a signed-in customer is known to the Pixel (hashed, lib/pixelMatch.ts); signing out forgets them.
  useEffect(() => {
    const u = auth.user;
    void setPixelPerson(u ? { id: u.id, name: u.name, phone: u.phone, city: u.addresses?.[0]?.city } : null);
  }, [auth.user]);

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

  function openTier(key?: string) {
    go({ section: 'shop', category: key ?? 'all', query: '' });
  }

  function openProduct(product: Product) {
    go({ section: 'product', productId: product.id });
  }

  function handleAdd(product: Product) {
    const existing = cart.lines.find((l) => l.id === product.id);
    cart.add(product);
    trackAddToCart(product);
    // The drawer shows what was added, and the way to checkout, without leaving the page.
    if (existing) toast.success(`تم تحديث الكمية: ${product.name}`);
    else setCartOpen(true);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedId]);

  // The tab's title follows the screen - worded for search (lib/pageTitle.ts).
  useEffect(() => {
    document.title = titleFor(section, { product: selected, category: shopCategory, products: catalogue.products });
  }, [section, selected, shopCategory, catalogue.products]);

  const productRelated = selected
    ? // "You may also like": the same Odoo tier, so an Elite mattress suggests Elite ones.
      catalogue.products.filter((p) => p.id !== selected.id && (p.tier?.key ?? null) === (selected.tier?.key ?? null))
    : [];
  const tiers = useMemo(() => tiersOf(catalogue.products).map((t) => t.tier), [catalogue.products]);

  return (
    // shadcn/ui's look in Brimatex colours (index.css, components/store).
    <div className="flex min-h-[100svh] flex-col bg-background font-sans text-foreground">
      {/* start-0/top-0 even while hidden: sr-only is absolute but without an
          inset it keeps its static position, which in RTL lands past the right
          edge and adds ~20px of horizontal scroll on narrow screens. */}
      <a
        href="#main"
        className="sr-only absolute top-0 start-0 focus:not-sr-only focus:z-50 focus:rounded-b-md focus:bg-primary focus:px-6 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        تخطّي إلى المحتوى
      </a>

      <SiteHeader
        section={section}
        user={auth.user}
        cartCount={cart.count}
        tiers={tiers}
        onNavigate={navigate}
        onOpenTier={openTier}
        onSearch={(q) => go({ section: 'shop', category: 'all', query: q })}
        onOpenCart={() => setCartOpen(true)}
      />

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        lines={cart.lines}
        total={cart.total}
        products={catalogue.products}
        onSetQty={cart.setQty}
        onRemove={cart.remove}
        onCheckout={() => {
          setCartOpen(false);
          navigate('cart');
        }}
      />

      <main id="main" className="flex-1">
        <Suspense fallback={<ScreenLoading />}>
        {section === 'home' && (
          <HomePage
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
            onOpenTier={openTier}
            // A banner's link is a shop path, read the way an address is.
            onOpenLink={(path) => go(parseRoute(new URL(path, window.location.origin)))}
            perks={loyalty.perks}
          />
        )}

        {section === 'vouchers' && (
          <VouchersScreen
            user={auth.user}
            perks={loyalty.perks}
            onGoToPoints={() => navigate('points')}
            onGoToAuth={() => navigate('auth')}
          />
        )}

        {section === 'points' && (
          <PointsScreen
            user={auth.user}
            token={auth.token}
            perks={loyalty.perks}
            onChanged={loyalty.refresh}
            onGoToVouchers={() => navigate('vouchers')}
            onGoToAuth={() => navigate('auth')}
          />
        )}

        {section === 'quiz' && (
          <QuizScreen products={catalogue.products} productsReady={!catalogue.loading} onOpen={openProduct} />
        )}

        {section === 'shop' && (
            <ShopPage
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
              onGoHome={() => navigate('home')}
            />
        )}

        {section === 'product' &&
          (selected ? (
            <ProductPage
              product={selected}
              related={productRelated}
              justAddedId={justAddedId}
              saved={wishlist.has(selected.id)}
              wishlistPending={wishlist.pending === selected.id}
              isSaved={wishlist.has}
              wishlistPendingId={wishlist.pending}
              onGoHome={() => navigate('home')}
              onOpenShop={openTier}
              onAdd={handleAdd}
              onBuyNow={(p) => {
                handleAdd(p);
                navigate('cart');
              }}
              onToggleWishlist={handleToggleWishlist}
              onOpenProduct={openProduct}
            />
          ) : (
            <p className="px-5 py-24 text-center text-muted-foreground">
              {catalogue.loading ? 'جارٍ التحميل…' : 'المنتج غير موجود'}
            </p>
          ))}

        {section === 'wishlist' && (
          <WishlistScreen
            user={auth.user}
            products={catalogue.products}
            savedIds={wishlist.ids}
            wishlistPending={wishlist.pending}
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
            onClear={() => {
              cart.clear();
              void loyalty.refresh();
            }}
            vouchers={loyalty.activeVouchers}
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
            onGoToVouchers={() => navigate('vouchers')}
            onGoToPoints={() => navigate('points')}
            onAvatarChange={(avatarUrl) => auth.patchUser({ avatarUrl })}
            pointsBalance={loyalty.perks?.points.balance ?? null}
          />
        )}
        </Suspense>
      </main>

      {section !== 'admin' && <SiteFooter tiers={tiers} onNavigate={navigate} onOpenTier={openTier} />}

      {/* The form is on every page but the dashboard. Its floating button
          only where a visitor browses - home and the shop; elsewhere the form
          opens from where the question comes up (lib/support.ts): a product,
          the quiz's result, the cart, an order, a search with no results, the
          footer and the phone menu. */}
      {section !== 'admin' && (
        <SupportWidget
          launcher={section === 'home' || section === 'shop'}
          user={auth.user}
          token={auth.token}
        />
      )}

      <Toaster />
    </div>
  );
}
