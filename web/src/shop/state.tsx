/**
 * What every storefront page shares: the catalogue, the cart, the signed-in
 * customer and their favourites, the delivery city, and the two drawers
 * (cart, login). Built on the site's existing hooks, so the cart, the session
 * and the Pixel keep working as before.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useProducts } from '@/hooks/useProducts';
import { useWishlist } from '@/hooks/useWishlist';
import { trackAddToCart, trackAddToWishlist } from '@/lib/pixel';
import type { Product, ProductVariant } from '@/types';

import { shopProducts, variantsOf } from './catalog';

const CITY_KEY = 'brimatex:city';
const METHOD_KEY = 'brimatex:delivery-method';

export type DeliveryMethod = 'home' | 'pickup';

function readCity(): string | null {
  try {
    return localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

type Auth = ReturnType<typeof useAuth>;
type Cart = ReturnType<typeof useCart>;
type Wishlist = ReturnType<typeof useWishlist>;

interface ShopApi {
  products: Product[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** A product by its own id or any of its sizes' ids. */
  find: (id: number) => Product | undefined;

  auth: Auth;
  cart: Cart;
  wishlist: Wishlist;

  /** Adds one of this size and opens the cart drawer on it. */
  addToCart: (product: Product, variant: ProductVariant) => void;
  /** The cart drawer after «أضف إلى السلة» (and from the header's basket). */
  cartDrawer: { open: boolean; addedId: number | null };
  setCartDrawerOpen: (open: boolean) => void;

  /** Runs `then` signed in: at once, or after the login drawer succeeds. */
  requireLogin: (reason: 'checkout' | 'favorites' | 'account', then?: () => void) => void;
  loginDrawer: { open: boolean; reason: 'checkout' | 'favorites' | 'account' };
  closeLogin: (signedIn: boolean) => void;

  /** Saves or unsaves (guests get the login drawer first). */
  toggleFavorite: (product: Product) => void;

  city: string | null;
  setCity: (city: string) => void;
  /** Delivered home or collected at the showroom - chosen on the product page, kept to checkout. */
  method: DeliveryMethod;
  setMethod: (method: DeliveryMethod) => void;
  /** The city dialog - on first visit and from «التوصيل إلى». */
  cityDialogOpen: boolean;
  setCityDialogOpen: (open: boolean) => void;
}

const ShopContext = createContext<ShopApi | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const catalogue = useProducts();
  const auth = useAuth();
  const cart = useCart();
  const wishlist = useWishlist(auth.token, auth.user);

  const [cartDrawer, setCartDrawer] = useState<{ open: boolean; addedId: number | null }>({ open: false, addedId: null });
  const [loginDrawer, setLoginDrawer] = useState<{ open: boolean; reason: 'checkout' | 'favorites' | 'account' }>({ open: false, reason: 'account' });
  const afterLogin = useRef<(() => void) | null>(null);
  const [city, setCityState] = useState<string | null>(readCity);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [method, setMethodState] = useState<DeliveryMethod>(() => {
    try {
      return localStorage.getItem(METHOD_KEY) === 'pickup' ? 'pickup' : 'home';
    } catch {
      return 'home';
    }
  });
  const setMethod = useCallback((next: DeliveryMethod) => {
    setMethodState(next);
    try {
      localStorage.setItem(METHOD_KEY, next);
    } catch {
      /* Kept for this visit only */
    }
  }, []);

  const products = useMemo(() => shopProducts(catalogue.products), [catalogue.products]);
  const find = useCallback(
    (id: number) => catalogue.products.find((p) => p.id === id || (p.variants ?? []).some((v) => v.id === id)),
    [catalogue.products]
  );

  const addToCart = useCallback(
    (product: Product, variant: ProductVariant) => {
      // A cart line is the size itself, named after the mattress (as the site always stored it).
      const asLine: Product = { ...product, id: variant.id, price: variant.price, sku: variant.sku, stock: variant.stock, inStock: variant.inStock, preorder: variant.preorder };
      cart.add(asLine);
      trackAddToCart(asLine);
      setCartDrawer({ open: true, addedId: variant.id });
    },
    [cart]
  );

  const requireLogin = useCallback<ShopApi['requireLogin']>(
    (reason, then) => {
      if (auth.user) {
        then?.();
        return;
      }
      afterLogin.current = then ?? null;
      setCartDrawer((d) => ({ ...d, open: false }));
      setLoginDrawer({ open: true, reason });
    },
    [auth.user]
  );

  const closeLogin = useCallback((signedIn: boolean) => {
    setLoginDrawer((d) => ({ ...d, open: false }));
    const next = afterLogin.current;
    afterLogin.current = null;
    // The action that opened it carries on once the session is in place.
    if (signedIn && next) window.setTimeout(next, 0);
  }, []);

  const toggleFavorite = useCallback(
    (product: Product) => {
      const run = async () => {
        try {
          const saved = await wishlist.toggle(product.id);
          if (saved) trackAddToWishlist(product);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'تعذّر تحديث المفضّلة');
        }
      };
      requireLogin('favorites', () => void run());
    },
    [wishlist, requireLogin]
  );

  const setCity = useCallback((next: string) => {
    setCityState(next);
    try {
      localStorage.setItem(CITY_KEY, next);
    } catch {
      /* Private mode: kept for this visit only */
    }
  }, []);

  // First visit: ask for the city once the page is up (handoff WebCity).
  useEffect(() => {
    if (readCity()) return;
    const t = window.setTimeout(() => setCityDialogOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  const api = useMemo<ShopApi>(
    () => ({
      products,
      loading: catalogue.loading,
      error: catalogue.error,
      reload: catalogue.reload,
      find,
      auth,
      cart,
      wishlist,
      addToCart,
      cartDrawer,
      setCartDrawerOpen: (open) => setCartDrawer((d) => ({ open, addedId: open ? d.addedId : null })),
      requireLogin,
      loginDrawer,
      closeLogin,
      toggleFavorite,
      city,
      setCity,
      cityDialogOpen,
      setCityDialogOpen,
      method,
      setMethod,
    }),
    [products, catalogue.loading, catalogue.error, catalogue.reload, find, auth, cart, wishlist, addToCart, cartDrawer, requireLogin, loginDrawer, closeLogin, toggleFavorite, city, setCity, cityDialogOpen, method, setMethod]
  );

  return <ShopContext.Provider value={api}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopApi {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop outside ShopProvider');
  return ctx;
}

/** The product and size a cart line holds. */
export function lineItem(find: ShopApi['find'], id: number): { product?: Product; variant?: ProductVariant } {
  const product = find(id);
  return { product, variant: product ? variantsOf(product).find((v) => v.id === id) : undefined };
}
