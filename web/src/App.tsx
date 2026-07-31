import { useState } from 'react';
import { toast } from 'sonner';

import { AuthSection } from '@/components/AuthSection';
import { CartSection } from '@/components/CartSection';
import { Header } from '@/components/Header';
import { OrdersSection } from '@/components/OrdersSection';
import { ProductDetail } from '@/components/ProductDetail';
import { ShopSection } from '@/components/ShopSection';
import { WishlistSection } from '@/components/WishlistSection';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useProducts } from '@/hooks/useProducts';
import { useWishlist } from '@/hooks/useWishlist';
import type { Address, Product, SectionId } from '@/types';

export default function App() {
  const [section, setSection] = useState<SectionId>('shop');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

  const catalogue = useProducts();
  const cart = useCart();
  const auth = useAuth();
  const wishlist = useWishlist(auth.token, auth.user);

  function navigate(next: SectionId) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openProduct(product: Product) {
    setSelectedId(product.id);
    navigate('product');
  }

  function handleAdd(product: Product) {
    const existing = cart.lines.find((l) => l.id === product.id);
    cart.add(product);
    toast.success(existing ? `تم تحديث الكمية: ${product.name}` : `تمت إضافة: ${product.name}`);

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
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-0 focus:top-0 focus:z-50 focus:rounded-b-md focus:bg-primary focus:px-6 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        تخطّي إلى المحتوى
      </a>

      <Header
        active={section}
        cartCount={cart.count}
        wishlistCount={wishlist.ids.length}
        onNavigate={navigate}
      />

      <main id="main" className="min-h-[60vh] pb-12">
        {section === 'shop' && (
          <ShopSection
            products={catalogue.products}
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
              justAdded={justAddedId === selected.id}
              saved={wishlist.has(selected.id)}
              wishlistPending={wishlist.pending === selected.id}
              onAdd={handleAdd}
              onBack={() => navigate('shop')}
              onToggleWishlist={handleToggleWishlist}
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
        <div className="container">
          <p className="mb-1 font-heading text-2xl tracking-[0.08em] text-primary-foreground">
            BRIMATEX
          </p>
          <p>تجربة 100 ليلة · توصيل مجاني · ضمان حتى 12 سنة</p>
        </div>
      </footer>

      <Toaster />
    </>
  );
}
