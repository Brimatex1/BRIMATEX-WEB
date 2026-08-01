import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AdminSection } from '@/components/AdminSection';
import { AuthSection } from '@/components/AuthSection';
import { BrimatexLogo } from '@/components/BrimatexLogo';
import { CartSection } from '@/components/CartSection';
import { Header } from '@/components/Header';
import { HomeSection } from '@/components/HomeSection';
import { OrdersSection } from '@/components/OrdersSection';
import { ProductDetail } from '@/components/ProductDetail';
import { QuizSection } from '@/components/QuizSection';
import { ShopSection } from '@/components/ShopSection';
import { WishlistSection } from '@/components/WishlistSection';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useProducts } from '@/hooks/useProducts';
import { useWishlist } from '@/hooks/useWishlist';
import { api } from '@/lib/api';
import { initPixel, trackAddToCart, trackPageView, trackViewContent } from '@/lib/pixel';
import type { Address, Category, Product, SectionId } from '@/types';

export default function App() {
  const [section, setSection] = useState<SectionId>('home');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [shopCategory, setShopCategory] = useState<Category | 'all'>('all');
  const [shopQuery, setShopQuery] = useState('');
  const [cameFromShop, setCameFromShop] = useState(false);

  const catalogue = useProducts();
  const cart = useCart();
  const auth = useAuth();
  const wishlist = useWishlist(auth.token, auth.user);

  // Loads the admin-configured Pixel ID (if any) and fires the first PageView.
  // A no-op when unconfigured — see lib/pixel.ts.
  useEffect(() => {
    api
      .getPixelConfig()
      .then(({ pixelId }) => {
        if (pixelId) initPixel(pixelId);
        trackPageView();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(next: SectionId) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // This SPA has no router — every section switch is the "virtual page
    // load" equivalent, so a fresh PageView belongs here, not just on boot.
    trackPageView();
  }

  function openProduct(product: Product) {
    // Remembered so "back" returns where the visitor actually came from —
    // the shop listing, or the homepage when opened from a card there.
    setCameFromShop(section === 'shop');
    setSelectedId(product.id);
    navigate('product');
    trackViewContent(product);
  }

  /** Home category cards jump into the shop with that filter already applied. */
  function shopCategoryFrom(category: Category | 'all') {
    setShopCategory(category);
    setShopQuery('');
    navigate('shop');
  }

  /** The homepage search box is the main way into the catalogue. */
  function searchFromHome(query: string) {
    setShopQuery(query);
    setShopCategory('all');
    navigate('shop');
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
              justAdded={justAddedId === selected.id}
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

      <footer className="bg-primary py-12 text-center text-sm text-primary-foreground/80">
        <div className="container flex flex-col items-center">
          {/* currentColor puts the mark in Cloud Dancer here, not the navy it ships as */}
          <BrimatexLogo className="mb-4 h-16 w-auto text-primary-foreground" />
          <p>تجربة 100 ليلة · توصيل مجاني · ضمان حتى 12 سنة</p>
        </div>
      </footer>

      <Toaster />
    </>
  );
}
