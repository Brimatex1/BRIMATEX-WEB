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
  inStock?: boolean;
  /** Null until real photography exists — ProductVisual draws a placeholder. */
  image?: string | null;
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
}

export interface AdminOverview {
  sales: { today: number; month: number; total: number };
  counts: { today: number; month: number; total: number };
  byStatus: Record<string, number>;
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
