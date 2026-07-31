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
  /** Present on demo products; Odoo products may omit the richer fields. */
  category?: Category;
  tagline?: string;
  size?: ProductSize;
  specs?: ProductSpecs;
  features?: string[];
  inStock?: boolean;
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

export interface User {
  id: string;
  name: string;
  phone: string | null;
  email?: string;
  /** Returned by /api/auth/me; the login and register payloads omit them. */
  addresses?: Address[];
  wishlist?: WishlistEntry[];
}

export type SectionId = 'shop' | 'product' | 'cart' | 'auth' | 'wishlist' | 'orders';

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name';
