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
import { api as http } from '@/lib/api';
import { trackAddToCart, trackAddToWishlist } from '@/lib/pixel';
import type { AppConfig, Product, ProductVariant } from '@/types';

import { shopProducts, variantsOf } from './catalog';
import { useLoyaltyStore, type LoyaltyApi } from './loyalty';

const CITY_KEY = 'brimatex:city';
const METHOD_KEY = 'brimatex:delivery-method';
const FAVORITES_KEY = 'brimatex:favorites';

function readGuestFavorites(): number[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export type DeliveryMethod = 'home' | 'pickup';

function readCity(): string | null {
  try {
    return localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

type Auth = ReturnType<typeof useAuth>;
export type LoginReason = 'checkout' | 'favorites' | 'account' | 'cart';
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
  /** Saved mattresses: the account's, or this browser's for a guest. */
  favorites: { ids: number[]; has: (id: number) => boolean; pending: number | null };

  /** Adds one of this size and opens the cart drawer on it. */
  addToCart: (product: Product, variant: ProductVariant) => void;
  /** The cart drawer after «أضف إلى السلة» (and from the header's basket). */
  cartDrawer: { open: boolean; addedId: number | null };
  setCartDrawerOpen: (open: boolean) => void;

  /** Runs `then` signed in: at once, or after the login drawer succeeds. */
  requireLogin: (reason: LoginReason, then?: () => void) => void;
  loginDrawer: { open: boolean; reason: LoginReason };
  closeLogin: (signedIn: boolean) => void;

  /** Saves or unsaves - in the account, or in this browser for a guest. */
  toggleFavorite: (product: Product) => void;

  city: string | null;
  setCity: (city: string) => void;
  /** Delivered home or collected at the showroom - chosen on the product page, kept to checkout. */
  method: DeliveryMethod;
  setMethod: (method: DeliveryMethod) => void;
  /** The city dialog - on first visit and from «التوصيل إلى». */
  cityDialogOpen: boolean;
  setCityDialogOpen: (open: boolean) => void;

  /** Points and the coupon for the next order (the loyalty add-on). */
  loyalty: LoyaltyApi;

  /** The admin panel's settings (GET /api/app/v1/config), null until they arrive. */
  config: AppConfig['settings'] | null;
  /**
   * The panel's «الواجهة والبانرات» (the same answer): undefined while it is on
   * its way, null when it could not be read (the home then shows its own hero).
   */
  home: AppConfig['home'] | null | undefined;
  /** «وضع الصيانة»: its message while ordering is stopped, else null. */
  maintenance: string | null;
}

const ShopContext = createContext<ShopApi | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const catalogue = useProducts();
  const auth = useAuth();
  const cart = useCart();
  const wishlist = useWishlist(auth.token, auth.user);
  const loyalty = useLoyaltyStore(auth.token, auth.user?.id, auth.checking);

  const [cartDrawer, setCartDrawer] = useState<{ open: boolean; addedId: number | null }>({ open: false, addedId: null });
  const [loginDrawer, setLoginDrawer] = useState<{ open: boolean; reason: LoginReason }>({ open: false, reason: 'account' });
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

  // The panel's settings, read once per visit (the server keeps them 5 minutes).
  const [config, setConfig] = useState<AppConfig['settings'] | null>(null);
  const [home, setHome] = useState<AppConfig['home'] | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    http
      .getAppConfig()
      .then((c) => {
        if (!live) return;
        setConfig(c.settings);
        setHome(c.home ?? null);
      })
      .catch(() => {
        /* Without them the shop runs as before: open, with its own contact details and hero. */
        if (live) setHome(null);
      });
    return () => {
      live = false;
    };
  }, []);
  const maintenance = config?.maintenance.on ? config.maintenance.message : null;

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

  const addLine = useCallback(
    (product: Product, variant: ProductVariant) => {
      // A cart line is the size itself, named after the mattress (as the site always stored it).
      const asLine: Product = { ...product, id: variant.id, price: variant.price, sku: variant.sku, stock: variant.stock, inStock: variant.inStock, preorder: variant.preorder };
      cart.add(asLine);
      trackAddToCart(asLine);
      setCartDrawer({ open: true, addedId: variant.id });
    },
    [cart]
  );
  // Read after the login drawer closes, when this render's addLine may be stale.
  const addLineRef = useRef(addLine);
  addLineRef.current = addLine;

  const addToCart = useCallback(
    (product: Product, variant: ProductVariant) => {
      // «السماح بالطلب كزائر حتى السلة» off: a guest signs in first, then the size goes in.
      if (config?.guestBrowsing === false && !auth.user) {
        requireLogin('cart', () => addLineRef.current(product, variant));
        return;
      }
      addLine(product, variant);
    },
    [config?.guestBrowsing, auth.user, requireLogin, addLine]
  );

  const closeLogin = useCallback((signedIn: boolean) => {
    setLoginDrawer((d) => ({ ...d, open: false }));
    const next = afterLogin.current;
    afterLogin.current = null;
    // The action that opened it carries on once the session is in place.
    if (signedIn && next) window.setTimeout(next, 0);
  }, []);

  // Guests keep favourites in this browser (the 2026 handoff: no sign-in for
  // favourites); signing in moves them to the account, then clears them here.
  const [guestFavorites, setGuestFavorites] = useState<number[]>(readGuestFavorites);
  const saveGuestFavorites = useCallback((ids: number[]) => {
    setGuestFavorites(ids);
    try {
      if (ids.length) localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
      else localStorage.removeItem(FAVORITES_KEY);
    } catch {
      /* Kept for this visit only */
    }
  }, []);

  const merging = useRef(false);
  useEffect(() => {
    const token = auth.token;
    if (!auth.user || !token || !guestFavorites.length || merging.current) return;
    merging.current = true;
    const already = new Set(auth.user.wishlist?.map((w) => Number(w.productId)) ?? []);
    const toAdd = guestFavorites.filter((id) => !already.has(id));
    Promise.allSettled(toAdd.map((id) => http.addToWishlist(token, id))).then((results) => {
      const added = toAdd.filter((_, i) => results[i].status === 'fulfilled');
      const now = new Date().toISOString();
      auth.patchUser({ wishlist: [...(auth.user?.wishlist ?? []), ...added.map((productId) => ({ productId, addedAt: now }))] });
      saveGuestFavorites(toAdd.filter((id) => !added.includes(id)));
      merging.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, auth.token]);

  const favorites = useMemo(
    () => ({
      ids: auth.user ? wishlist.ids : guestFavorites,
      has: (id: number) => (auth.user ? wishlist.has(id) : guestFavorites.includes(id)),
      pending: auth.user ? wishlist.pending : null,
    }),
    [auth.user, wishlist, guestFavorites]
  );

  const toggleFavorite = useCallback(
    (product: Product) => {
      if (!auth.user) {
        const saved = guestFavorites.includes(product.id);
        saveGuestFavorites(saved ? guestFavorites.filter((id) => id !== product.id) : [product.id, ...guestFavorites]);
        if (!saved) trackAddToWishlist(product);
        return;
      }
      wishlist
        .toggle(product.id)
        .then((saved) => {
          if (saved) trackAddToWishlist(product);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذّر تحديث المفضّلة'));
    },
    [auth.user, wishlist, guestFavorites, saveGuestFavorites]
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
      favorites,
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
      loyalty,
      config,
      home,
      maintenance,
    }),
    [products, catalogue.loading, catalogue.error, catalogue.reload, find, auth, cart, wishlist, favorites, addToCart, cartDrawer, requireLogin, loginDrawer, closeLogin, toggleFavorite, city, setCity, cityDialogOpen, method, setMethod, loyalty, config, home, maintenance]
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
