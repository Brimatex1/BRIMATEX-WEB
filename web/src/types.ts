export type Category = 'mattress' | 'pillow' | 'bedding';

export interface ProductSize {
  width: number;
  length: number;
  height: number;
  label: string;
}

export interface ProductSpecs {
  material: string;
  firmness: string | null;
  firmnessLevel: number | null;
  coverFabric: string;
  warrantyYears: number;
  trialNights: number;
}

/** One size/height option of a product that has more than one — see Product.variants. */
export interface ProductVariant {
  id: number;
  /** e.g. "190*80 / 12" — Odoo's own attribute value label, shown as-is. */
  label: string;
  sku?: string;
  price: number;
  stock?: number | null;
  inStock?: boolean;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  sku?: string;
  description?: string;
  /** Real quantity from Odoo; null when no stock source is configured. */
  stock?: number | null;
  /** Present on demo products; Odoo products may omit the richer fields. */
  category?: Category;
  tagline?: string;
  size?: ProductSize;
  specs?: ProductSpecs;
  features?: string[];
  /** Keys into web/src/lib/icons.ts — which spec icons this product shows. */
  iconFeatures?: string[];
  inStock?: boolean;
  /** Admin can switch a product off from the dashboard; hidden from /api/products when false. */
  enabled?: boolean;
  /** Null until real photography exists — ProductVisual draws a placeholder. */
  image?: string | null;
  /**
   * Other sizes/heights of this same product (an Odoo product template with
   * more than one variant). Undefined for single-variant and demo products —
   * there's nothing to pick between, so no size selector is shown.
   */
  variants?: ProductVariant[];
}

export interface CartLine {
  id: number;
  name: string;
  price: number;
  qty: number;
}

export interface Customer {
  name: string;
  phone: string;
  city: string;
  address: string;
  email?: string;
}

export interface OrderResult {
  source: string;
  orderName: string;
  invoiceName?: string;
  invoiceStatus?: string;
  total: number;
  message?: string;
}

export interface Address {
  id: string;
  address: string;
  city: string;
  createdAt: string;
}

export interface WishlistEntry {
  productId: number;
  addedAt: string;
}

export interface OrderSummary {
  orderName: string;
  invoiceName: string;
  invoiceStatus: string;
  paymentStatus: string;
  total: number;
  items: { productId: number; quantity: number }[];
  note: string;
  city: string;
  address: string;
  placedAt: string;
  paidAt: string | null;
}

export type Role = 'customer' | 'admin';

/** Mirrors SUPPORT_TOPICS in src/server.js — the server rejects anything else. */
export type SupportTopic = 'product' | 'order' | 'warranty' | 'complaint' | 'other';

export interface SupportTicketInput {
  name: string;
  phone: string;
  email?: string;
  topic: SupportTopic;
  orderName?: string;
  message: string;
}

export interface User {
  id: string;
  name: string;
  phone: string | null;
  email?: string;
  role?: Role;
  /** Returned by /api/auth/me; the login and register payloads omit them. */
  addresses?: Address[];
  wishlist?: WishlistEntry[];
}

/* ---------------------------------------------------------------- dashboard */

export interface AdminOrder {
  orderName: string;
  invoiceName: string;
  customer: Partial<Customer>;
  items: { productId: number; quantity: number }[];
  note: string;
  total: number;
  invoiceStatus: string;
  paymentStatus: string;
  placedAt: string;
  paidAt: string | null;
  userId: string | null;
  /** Null for orders placed before the channel was recorded. */
  channel: OrderChannel | null;
}

/** Where an order was placed: the website or the iOS/Android app. */
export type OrderChannel = 'web' | 'app';

export interface ChannelStats {
  count: number;
  sales: number;
  monthCount: number;
  monthSales: number;
}

export interface AdminOverview {
  sales: { today: number; month: number; total: number };
  counts: { today: number; month: number; total: number };
  byStatus: Record<string, number>;
  byChannel: Record<OrderChannel | 'unknown', ChannelStats>;
  customers: number;
  recent: {
    orderName: string;
    customer: string;
    city: string;
    total: number;
    paymentStatus: string;
    placedAt: string;
  }[];
}

export interface AdminCustomer {
  id: string;
  name: string;
  phone: string | null;
  email?: string;
  role: Role;
  /** Granted through ADMIN_PHONES — cannot be changed from the dashboard. */
  locked: boolean;
  createdAt: string;
  addressCount: number;
  wishlistCount: number;
  orderCount: number;
  spent: number;
  lastOrderAt: string | null;
}

export interface OdooSettings {
  url: string;
  db: string;
  username: string;
  /** The key itself never reaches the browser — only whether one is stored. */
  hasApiKey: boolean;
  uid: number | null;
  /** Values come from .env with no dashboard override. */
  fromEnv: boolean;
  configured: boolean;
}

export interface FacebookPixelSettings {
  pixelId: string | null;
  /** Value comes from .env with no dashboard override. */
  fromEnv: boolean;
  configured: boolean;
  /** Dinars to one dollar; Pixel values go to Meta in USD when set. */
  lydPerUsd: number | null;
}

/** Server-side reporting to Meta. The token itself never leaves the server. */
export interface ConversionsApiStatus {
  configured: boolean;
  /** FACEBOOK_TEST_EVENT_CODE is set: events land in Events Manager's "Test events". */
  testMode: boolean;
  lastResult: {
    ok: boolean;
    at: string;
    events: string;
    received?: number;
    error?: string;
  } | null;
}

export interface WhatsappSupportSettings {
  phone: string | null;
  message: string;
  /** Value comes from .env with no dashboard override. */
  fromEnv: boolean;
  configured: boolean;
}

/** Admin-set per-product overrides — see src/lib/productOverrides.js. */
export interface ProductOverrides {
  productId: number;
  iconKeys: string[];
  description: string | null;
  enabled: boolean;
  imageUrl: string | null;
}

export interface AdminProducts {
  source: string;
  /** False when Odoo owns the catalogue; edits there would be overwritten. */
  editable: boolean;
  /** Demo mode carries only an inStock boolean, never a quantity. */
  hasStockData: boolean;
  products: Product[];
}

export type SectionId =
  | 'home'
  | 'shop'
  | 'product'
  | 'quiz'
  | 'cart'
  | 'auth'
  | 'wishlist'
  | 'orders'
  | 'admin';

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name';
