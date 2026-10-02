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
  /** Out of stock but orderable - made to order (pre-orders on in the dashboard). */
  preorder?: boolean;
}

/** One review as the product page shows it - the author's first name only. */
export interface PublicReview {
  id: string;
  /** The size bought (a variant id) - or the product card's own id. */
  productId?: number;
  rating: number;
  comment: string;
  name: string;
  createdAt: string;
  title?: string;
  subRatings?: { comfort?: number; quality?: number; value?: number } | null;
  /** From someone who bought it - every published review is. */
  verified?: boolean;
}

/** GET /api/products/:id/reviews. */
export interface ProductReviews {
  count: number;
  /** One decimal; null with no reviews. */
  average: number | null;
  /** How many gave each number of stars. */
  distribution?: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** The comfort, quality and value averages, where reviewers gave them. */
  subAverages?: { comfort?: number; quality?: number; value?: number };
  reviews: PublicReview[];
}

/** A review as the dashboard lists it - hidden ones included, with the author. */
export interface AdminReview {
  id: string;
  productId: number;
  orderName: string;
  rating: number;
  comment: string;
  createdAt: string;
  hidden: boolean;
  /** Written and not yet decided on: waits to be published or hidden. */
  pending?: boolean;
  title?: string;
  subRatings?: { comfort?: number; quality?: number; value?: number } | null;
  name: string;
  phone: string | null;
}

/** A picture in the home page's sliding banner - set from the dashboard (src/lib/banners.js). */
export interface Banner {
  id: string;
  imageUrl: string;
  /** A path inside the shop (/product/5852, /shop?category=premium), or '' for none. */
  link: string;
}

/** A picture in «من إنستغرام بريماتكس» on the home page - set from the dashboard (src/lib/instagram.js). */
export interface InstagramPost {
  id: string;
  imageUrl: string;
  /** The post on Instagram. */
  link: string;
}

/** A subcategory of Mattresses in Odoo - see web/src/lib/tiers.ts. */
export interface Tier {
  /** Odoo's name, lower-cased: economy, comfort, premium, elite. */
  key: string;
  /** Arabic, for display. */
  name: string;
  /** Listing order, cheapest first. */
  rank: number;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  /** Its visible reviews, all sizes together - absent until it has one. */
  rating?: { average: number; count: number };
  sku?: string;
  description?: string;
  /** Real quantity from Odoo; null when no stock source is configured. */
  stock?: number | null;
  /** Present on demo products; Odoo products may omit the richer fields. */
  category?: Category;
  /** The Odoo category the product is filed under; null when it is in none of the tiers. */
  tier?: Tier | null;
  tagline?: string;
  size?: ProductSize;
  specs?: ProductSpecs;
  features?: string[];
  /** Keys into web/src/lib/icons.ts — which spec icons this product shows. */
  iconFeatures?: string[];
  /** The factory warranty in years, from the printed catalogue; null when it states none. */
  warrantyYears?: number | null;
  /** What the mattress is made of, top to bottom - the catalogue's cutaway. */
  layers?: string[];
  /** The catalogue's feature icons, in order (web/src/shop/assets/feature-icons; docs/PRODUCTS.md of the 2026 handoff). */
  featureIcons?: string[];
  /** What the comparison shows: its type, top layer, and frame or core density. */
  compare?: { type: string | null; topLayer: string | null; frame: string | null } | null;
  inStock?: boolean;
  /** Out of stock but orderable - made to order (pre-orders on in the dashboard). */
  preorder?: boolean;
  /** Days to make a pre-order; null when the dashboard gives none. */
  leadDays?: number | null;
  /** Admin can switch a product off from the dashboard; hidden from /api/products when false. */
  enabled?: boolean;
  /** The picture uploaded from the dashboard; null when none was. Odoo's pictures are not used. */
  image?: string | null;
  /** The cutaway of what is inside - the second picture on the product page; null when none ships. */
  layersImage?: string | null;
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

/* ───────── Loyalty (server: src/lib/perks.js; the iOS app's rules) ───────── */

export type RewardIcon = 'bag' | 'heart' | 'star' | 'cloud' | 'bed' | 'happy';

export interface Voucher {
  code: string;
  title: string;
  body: string;
  /** A percentage when unit is '%', dinars when 'د.ل'. */
  discount: number;
  unit: '%' | 'د.ل';
  icon: RewardIcon;
  unlockedAt: string;
  validUntil: string;
  usedAt?: string;
  state: 'active' | 'used' | 'expired';
}

export interface RewardProgress {
  key: string;
  title: string;
  body: string;
  icon: RewardIcon;
  target: number;
  value: number;
  ratio: number;
  complete: boolean;
  discount: number;
}

export interface PointsLedgerEntry {
  id: string;
  label: string;
  points: number;
  at: string;
  orderName?: string;
}

export interface PointsSummary {
  earned: number;
  pending: number;
  redeemed: number;
  balance: number;
  ledger: PointsLedgerEntry[];
  rules: { perDinar: number; stepPoints: number; stepValue: number; validDays: number };
}

export interface Perks {
  points: PointsSummary;
  progress: RewardProgress[];
  vouchers: Voucher[];
  /** Rewards unlocked by this very request - shown once as a notice. */
  newlyUnlocked: string[];
}

/* The loyalty add-on (2026): points and coupons from Odoo's loyalty modules.
   Every number comes from the Odoo program's settings; `enabled` is false
   while no program is set up, and then the storefront shows none of it. */

export interface LoyaltyHistoryEntry {
  id: string;
  kind: 'earned' | 'redeemed' | string;
  points: number;
  orderName: string | null;
  label: string;
  date: string;
  /** Credited once the order was delivered. */
  afterDelivery: boolean;
}

export interface LoyaltyInfo {
  enabled: boolean;
  points: number;
  /** What the balance is worth now, in dinars. */
  value: number;
  /** Dinars per point, or null. */
  pointValue: number | null;
  expiring: { points: number; date: string } | null;
  /** «points نقطة لكل perAmount د.ل»; review = points per published review. Any may be null. */
  earn: { points: number | null; perAmount: number | null; review: number | null } | null;
  history: LoyaltyHistoryEntry[];
  couponsAvailable: number;
}

export interface Coupon {
  code: string;
  title: string;
  /** A fixed amount off, in dinars - or null when it is a percentage. */
  value: number | null;
  percent: number | null;
  minAmount: number | null;
  expires: string | null;
  usedAt: string | null;
}

export interface CouponsResponse {
  enabled: boolean;
  available: Coupon[];
  used: Coupon[];
}

/** A code the server accepted for this subtotal; `discount` is the dinars it takes off. */
export interface CouponCheck {
  code: string;
  title: string;
  value: number | null;
  percent: number | null;
  discount: number;
}

/** Points or one coupon on an order - never both (the owner's rule). */
export type LoyaltyChoice = { usePoints: true } | { coupon: string };

export interface OrderResult {
  source: string;
  orderName: string;
  invoiceName?: string;
  invoiceStatus?: string;
  total: number;
  /** Voucher discount taken off the total, in dinars. */
  discount?: number;
  voucherCode?: string | null;
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
  /** The delivery slip that took it out of the warehouse (e.g. FFG/OUT/00231), and when. */
  shipmentName?: string | null;
  shippedAt?: string | null;
  /** Made to order: days to make it (0 = no set time); null when nothing in it is. */
  leadDays?: number | null;
  /** The checkout's choices read back (src/routes/user.js): home or showroom, the day and period, the payment. */
  method?: 'home' | 'pickup' | null;
  deliveryText?: string | null;
  paymentText?: string | null;
  /** It has not left for delivery yet, so the customer may still cancel it. */
  cancellable?: boolean;
}

export type Role = 'customer' | 'admin' | 'marketing' | 'support';

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
  /** The profile photo's path on the server - shared with the app. */
  avatarUrl?: string | null;
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
  /** Where the access token comes from - the dashboard, .env, or none. The token itself is never sent. */
  tokenSource: 'dashboard' | 'env' | null;
  /** The token's last four characters, to tell two tokens apart. */
  tokenLast4: string | null;
  lastResult: {
    ok: boolean;
    at: string;
    events: string;
    received?: number;
    error?: string;
  } | null;
}

/**
 * GET /api/app/v1/config - what the admin panel's «الإعدادات» sets for the
 * apps and the website (src/lib/appSettings.js). Phones in local form.
 * More keys join later (the home page, the quiz).
 */
export interface AppConfig {
  settings: {
    minVersion: { ios: string; android: string };
    forceUpdate: boolean;
    /** On: ordering stops everywhere and `message` shows. */
    maintenance: { on: boolean; message: string };
    /** Off: adding to the cart asks for sign-in first. */
    guestBrowsing: boolean;
    contact: { phone: string; whatsapp: string; email: string; showroom: string };
    quietHours?: { from: string; to: string };
  };
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
  | 'vouchers'
  | 'points'
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

/** Pre-orders (dashboard settings): out-of-stock mattresses stay orderable, made to order. */
export interface PreorderSettings {
  enabled: boolean;
  /** Days to make one; null when unset. */
  days: number | null;
}
