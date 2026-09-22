import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';

import { AdminSection } from '@/components/AdminSection';
import { AuthSection } from '@/components/AuthSection';
import { BrimatexLogo } from '@/components/BrimatexLogo';
import { CartSection } from '@/components/CartSection';
import { Header } from '@/components/Header';
import { HomeSection } from '@/components/HomeSection';
import { MobileTabBar } from '@/components/MobileTabBar';
import { OrdersSection } from '@/components/OrdersSection';
import { ProductDetail } from '@/components/ProductDetail';
import { QuizSection } from '@/components/QuizSection';
import { ShopSection } from '@/components/ShopSection';
import { SocialLinks } from '@/components/SocialLinks';
import { SupportWidget } from '@/components/SupportWidget';
import { WishlistSection } from '@/components/WishlistSection';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useProducts } from '@/hooks/useProducts';
import { useWishlist } from '@/hooks/useWishlist';
import { api } from '@/lib/api';
import { captureClickId, disablePixel, initPixel, trackAddToCart, trackPageView, trackViewContent } from '@/lib/pixel';
import { parseRoute, routePath, type Route } from '@/lib/route';
import type { Address, Category, Product, SectionId } from '@/types';

const DEFAULT_TITLE = document.title;

export default function App() {
  // The first screen comes from the address, so a link from an ad lands on it.
  const [landing] = useState(() => parseRoute(window.location));
  const [section, setSection] = useState<SectionId>(landing.section);
  const [selectedId, setSelectedId] = useState<number | null>(landing.productId ?? null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [shopCategory, setShopCategory] = useState<Category | 'all'>(landing.category ?? 'all');
  const [shopQuery, setShopQuery] = useState(landing.query ?? '');
  const [cameFromShop, setCameFromShop] = useState(false);

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
    show(route);
  }

  function navigate(next: SectionId) {
    go({ section: next });
  }

  // The browser's back and forward buttons move between screens, not off the site.
  useEffect(() => {
    const onPop = () => show(parseRoute(window.location));
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
    // Remembered so "back" returns where the visitor actually came from —
    // the shop listing, or the homepage when opened from a card there.
    setCameFromShop(section === 'shop');
    go({ section: 'product', productId: product.id });
  }

  /** Home category cards jump into the shop with that filter already applied. */
  function shopCategoryFrom(category: Category | 'all') {
    go({ section: 'shop', category, query: '' });
  }

  /** The homepage search box is the main way into the catalogue. */
  function searchFromHome(query: string) {
    go({ section: 'shop', category: 'all', query });
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

  return (
    <>
      {/* start-0/top-0 even while hidden: sr-only is absolute but without an
          inset it keeps its static position, which in RTL lands past the right
          edge and adds ~20px of horizontal scroll on narrow screens. */}
      <a
        href="#main"
        className="sr-only absolute top-0 start-0 focus:not-sr-only focus:z-50 focus:rounded-b-md focus:bg-primary focus:px-6 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        تخطّي إلى المحتوى
      </a>

      <Header
        active={section}
        cartCount={cart.count}
        wishlistCount={wishlist.ids.length}
        isAdmin={auth.user?.role === 'admin'}
        onNavigate={navigate}
      />

      <main id="main" className="min-h-[60vh]">
        {section === 'home' && (
          <HomeSection
            products={catalogue.products}
            loading={catalogue.loading}
            onShopCategory={shopCategoryFrom}
            onOpenProduct={openProduct}
            onStartQuiz={() => navigate('quiz')}
            onSearch={searchFromHome}
            onAdd={handleAdd}
            onToggleWishlist={handleToggleWishlist}
            isSaved={wishlist.has}
            wishlistPending={wishlist.pending}
            justAddedId={justAddedId}
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
          <ShopSection
            products={catalogue.products}
            category={shopCategory}
            onCategoryChange={setShopCategory}
            query={shopQuery}
            onQueryChange={setShopQuery}
            onBackHome={() => navigate('home')}
            loading={catalogue.loading}
            error={catalogue.error}
            onReload={catalogue.reload}
            onAdd={handleAdd}
            onOpen={openProduct}
            onToggleWishlist={handleToggleWishlist}
            isSaved={wishlist.has}
            wishlistPending={wishlist.pending}
            justAddedId={justAddedId}
          />
        )}

        {section === 'product' &&
          (selected ? (
            <ProductDetail
              product={selected}
              related={catalogue.products.filter(
                (p) => p.id !== selected.id && p.category === selected.category
              )}
              justAddedId={justAddedId}
              saved={wishlist.has(selected.id)}
              wishlistPending={wishlist.pending === selected.id}
              onAdd={handleAdd}
              onBack={() => navigate(cameFromShop ? 'shop' : 'home')}
              onToggleWishlist={handleToggleWishlist}
              onOpenProduct={openProduct}
            />
          ) : (
            <section className="container max-w-2xl py-24 text-center">
              <p className="text-muted-foreground">
                {catalogue.loading ? 'جارٍ التحميل…' : 'المنتج غير موجود'}
              </p>
            </section>
          ))}

        {section === 'wishlist' && (
          <WishlistSection
            user={auth.user}
            products={catalogue.products}
            savedIds={wishlist.ids}
            wishlistPending={wishlist.pending}
            justAddedId={justAddedId}
            onAdd={handleAdd}
            onOpen={openProduct}
            onToggleWishlist={handleToggleWishlist}
            onGoToAuth={() => navigate('auth')}
            onContinueShopping={() => navigate('shop')}
          />
        )}

        {section === 'orders' && (
          <OrdersSection
            user={auth.user}
            token={auth.token}
            products={catalogue.products}
            onGoToAuth={() => navigate('auth')}
            onContinueShopping={() => navigate('shop')}
          />
        )}

        {section === 'cart' && (
          <CartSection
            lines={cart.lines}
            total={cart.total}
            user={auth.user}
            token={auth.token}
            onSetQty={cart.setQty}
            onRemove={(id) => {
              cart.remove(id);
              toast.success('تم حذف المنتج');
            }}
            onClear={cart.clear}
            onContinueShopping={() => navigate('shop')}
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

      {/* Bottom padding on phones: the tab bar covers the last 4rem of the page */}
      <footer className="bg-primary pt-12 text-center text-sm text-primary-foreground/80 max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <div className="container flex flex-col items-center pb-8">
          {/* currentColor puts the mark in Cloud Dancer here, not the navy it ships as */}
          <BrimatexLogo className="mb-4 h-16 w-auto text-primary-foreground" />
          <p>تجربة 30 ليلة · توصيل مجاني · ضمان حتى 10 سنوات لبعض المنتجات</p>
          <p className="mt-2 flex items-center gap-1.5 text-primary-foreground/70">
            <MapPin className="size-4" aria-hidden="true" />
            طرابلس، ليبيا
          </p>
          <SocialLinks className="mt-5" />
        </div>
        <div className="border-t border-primary-foreground/10 py-4">
          <p className="text-xs text-primary-foreground/60">
            © 2026 بريماتكس لصناعة الإسفنج الصناعي والمراتب. جميع الحقوق محفوظة.
          </p>
        </div>
      </footer>

      {/* Customer care on every store page — a customer asking about an order is
          on "my orders", not the homepage. Only the admin dashboard goes without. */}
      {section !== 'admin' && (
        <SupportWidget
          user={auth.user}
          token={auth.token}
          // Phones: above the tab bar, and above the product page's buy bar too
          className={
            section === 'product'
              ? 'max-md:bottom-[calc(9.5rem+env(safe-area-inset-bottom))]'
              : 'max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))]'
          }
        />
      )}

      <MobileTabBar
        active={section}
        cartCount={cart.count}
        wishlistCount={wishlist.ids.length}
        onNavigate={navigate}
      />

      <Toaster />
    </>
  );
}
