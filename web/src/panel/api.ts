/**
 * The admin panel's calls - /api/panel/... (src/routes/panel.js). Its own
 * client, apart from lib/api.ts: the panel only borrows the storefront's
 * session (the token in localStorage) and its sign-in calls.
 */

import type { QuizRules } from '@/shop/quiz';

export type { QuizRules };

export type StaffRole = 'admin' | 'marketing' | 'support';
export type Section = 'overview' | 'orders' | 'home' | 'push' | 'quiz' | 'products' | 'reviews' | 'integrations' | 'settings';
export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'out' | 'delivered' | 'cancelled';
export type Channel = 'ios' | 'android' | 'app' | 'web';
export type Period = 'today' | '7d' | '30d' | 'all';

export interface PanelMe {
  user: { id: string; name: string; phone: string };
  role: StaffRole;
  sections: Section[];
  canConfirm: boolean;
  /** Odoo's address for people, or null when the server has none. */
  odooUrl: string | null;
  /**
   * The sidebar's counts: new orders waiting for «تأكيد», reviews waiting to
   * be published or hidden - null when the role does not open that section.
   */
  badges: { orders: number | null; reviews: number | null };
}

export interface ChannelRow {
  key: Channel;
  orders: number;
  sales: number;
  /** Percent, one decimal. */
  cancelRate: number;
}

export interface Overview {
  today: { orders: number; sales: number };
  pending: { count: number; oldestAt: string | null };
  outForDelivery: number;
  waitingTooLong: number;
  channels: ChannelRow[];
  /** Admin only (null otherwise). */
  reviewsPending: number | null;
  productsWithoutPhoto: { count: number; total: number } | null;
  banner: { imageUrl: string; link: string; title: string | null; count: number } | null;
  /** «آخر إشعار عرض»: the last offer notification sent (tests left out). */
  lastPush: { id: string; title: string; body: string; audience: PushAudience; sentAt: string; sent: number } | null;
}

export interface PanelOrder {
  orderName: string;
  placedAt: string | null;
  customer: { name: string; phone: string };
  city: string;
  channel: Channel;
  products: string;
  total: number;
  /** How it is paid on delivery (نقداً، بطاقة مصرفية، حوالة مصرفية), when the app said. */
  payment: string | null;
  status: OrderStatus;
  /** «السبت 3 أكتوبر · مساءً» or «استلام من الصالة», when known. */
  delivery: string | null;
  odooLink: string | null;
  /** `u:<account id>` or `p:<phone>` - the customer's page. */
  customerKey?: string | null;
}

export type TimelineState = 'done' | 'current' | 'todo';

/** GET /api/panel/orders/:name - one order's page. */
export interface PanelOrderDetail extends PanelOrder {
  invoiceName: string | null;
  /** The stages, each done, current or to come - with its time when recorded. */
  timeline: { key: string; label: string; at: string | null; state: TimelineState }[];
  items: { productId: number; name: string; size: string; quantity: number; unitPrice: number | null; lineTotal: number | null; image: string | null }[];
  pickup: boolean;
  /** The order's note lines (preorder, voucher, points...), delivery and payment left out. */
  notes: string[];
  address: string;
  /** `u:<account id>` or `p:<phone>` - the customer's page. */
  customerKey: string | null;
}

/** GET /api/panel/customers/:key - one customer. */
export interface PanelCustomer {
  key: string;
  account: { id: string; name: string; phone: string; createdAt: string | null } | null;
  name: string;
  otherNames: string[];
  phone: string;
  stats: { orders: number; delivered: number; cancelled: number; spent: number; average: number; firstAt: string | null; lastAt: string | null };
  places: { city: string; address: string }[];
  devices: { ios: number; android: number };
  reviews: { id: string; rating: number; comment: string; createdAt: string; productId: number }[];
  orders: PanelOrder[];
  /** Odoo loyalty points, when the add-on is on. */
  loyalty: { points: number; value: number | null } | null;
}

export interface OrdersQuery {
  status: OrderStatus | 'all';
  channel: Channel | 'all';
  city: string;
  period: Period;
  q: string;
  page: number;
  perPage: number;
}

export interface OrdersPage {
  orders: PanelOrder[];
  counts: Record<OrderStatus | 'all', number>;
  total: number;
  page: number;
  pages: number;
  perPage: number;
  cities: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  phone: string;
  role: StaffRole | 'customer';
  /** An admin through the server's ADMIN_PHONES - not changeable here. */
  locked: boolean;
}

/** The apps' and the website's settings (src/lib/appSettings.js) - phones in local form, 0XXXXXXXXX. */
export interface AppSettings {
  minVersion: { ios: string; android: string };
  forceUpdate: boolean;
  maintenance: { on: boolean; message: string };
  /** السماح بالطلب كزائر حتى السلة. */
  guestBrowsing: boolean;
  contact: { phone: string; whatsapp: string; email: string; showroom: string };
  /** HH:MM, Libyan time. */
  quietHours: { from: string; to: string };
}

export interface SettingsPayload {
  settings: AppSettings;
  /** Odoo's system parameter, or the server's own file when Odoo is not connected. */
  storage: 'odoo' | 'local';
  /** «مدن التوصيل», read-only: free everywhere, on these days. */
  delivery: { fee: number; days: string };
}

export type BannerPlatform = 'ios' | 'android' | 'web';
export type HomeSectionKey = 'hero' | 'offers' | 'categories' | 'recent' | 'bestsellers' | 'quiz' | 'instagram';

/** A banner as stored (src/lib/home.js) - the website draws the text over `photo`; the apps show `appImage`. */
export interface HomeBanner {
  id: string;
  key: string;
  status: 'published' | 'draft';
  tag: string;
  title: string;
  text: string;
  buttons: { label: string; link: string }[];
  /** Where the whole banner goes (the apps: a tap anywhere). */
  link: string;
  /** The text panel's colour, #RRGGBB. */
  panel: string;
  photo: string | null;
  appImage: string | null;
  /** The apps' picture cut to each app's banner (the owner's set); replaced by a new app picture. */
  appImages?: { ios?: string; android?: string };
  platforms: BannerPlatform[];
  /** YYYY-MM-DD, Libyan days, both included. */
  startsAt: string | null;
  endsAt: string | null;
  photoAlt?: string;
  photoPosition?: string;
  tagIcon?: 'points';
  card?: { caption?: string; chip?: string; value?: string; suffix?: string; note?: string };
}

export interface HomeDoc {
  banners: HomeBanner[];
  sections: { key: HomeSectionKey; on: boolean }[];
}

export interface HomePayload {
  home: HomeDoc;
  storage: 'odoo' | 'local';
  limits: { maxPublished: number; maxBanners: number; titleMax: number };
}

/** «ساعدني أختار» (src/lib/quizRules.js): the rules as stored, and where. */
export interface QuizPayload {
  rules: QuizRules;
  storage: 'odoo' | 'local';
}

/** «ما يظهر في المتجر» - a product as the shop shows it, and where each part comes from (src/lib/panelProducts.js). */
export interface ShopSide {
  /** The shop's product id (its first size) - the key of its override. */
  id: number;
  templateId: number | null;
  name: string;
  tier: { key: string; name: string } | null;
  priceFrom: number | null;
  sizes: number;
  stock: number | null;
  inStock: boolean;
  warrantyYears: number | null;
  enabled: boolean;
  /** The photo customers see. */
  image: string | null;
  imageSource: 'upload' | 'catalogue' | 'odoo' | 'none';
  /** The photo shipped with the site - what a removed upload goes back to. */
  catalogueImage: string | null;
  description: string;
  descriptionOverride: string | null;
  catalogueDescription: string | null;
  /** The website's feature icons, in order. */
  features: string[];
  /** Null: the printed catalogue's (catalogueFeatures). */
  featuresOverride: string[] | null;
  catalogueFeatures: string[];
}

/** «في أودو» - the product template's own fields. */
export interface OdooSide {
  templateId: number;
  name: string;
  listPrice: number | null;
  category: string | null;
  tags: { id: number; name: string }[];
  descriptionSale: string;
  hasImage: boolean;
  /** Odoo's small picture (image_128) as a data URL, null without one. */
  image: string | null;
  link: string | null;
}

export interface PanelProduct {
  /** The catalogue's key (crown, deluxe ...), null for another product the shop sells. */
  key: string | null;
  name: string;
  templateId: number | null;
  /** Null: the shop does not sell it (كراون today). */
  shop: ShopSide | null;
  /** Null: not read from Odoo (not connected, or not there). */
  odoo: OdooSide | null;
  odooLink: string | null;
  /** `u:<account id>` or `p:<phone>` - the customer's page. */
  customerKey?: string | null;
}

export interface ProductsPayload {
  products: PanelProduct[];
  /** Odoo's product tags to choose from. */
  tags: { id: number; name: string }[];
  odoo: { connected: boolean; url: string | null; error: string | null };
  source: string;
  catalogueError: string | null;
  featureIcons: string[];
}

export interface ShopOverride {
  productId: number;
  description: string | null;
  enabled: boolean;
  imageUrl: string | null;
  features: string[] | null;
}

export interface OdooProductChanges {
  /** A new image_1920, as a data URL. */
  image?: string;
  tagIds?: number[];
  /** Tags Odoo may not have yet - made by name. */
  newTags?: string[];
  descriptionSale?: string;
}

export interface InstagramPost {
  id: string;
  imageUrl: string;
  link: string;
}

/** Who an offer notification goes to - always among the devices with «العروض» on (src/lib/pushCampaigns.js). */
export type PushAudience = { kind: 'offers' } | { kind: 'city'; city: string } | { kind: 'cart' } | { kind: 'test' };
export type PushStatus = 'scheduled' | 'held' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  /** What a tap opens in the app ('' - the app itself). */
  link: string;
  linkLabel: string;
  audience: PushAudience;
  /** «إرسال تجريبي لجهازي». */
  test: boolean;
  status: PushStatus;
  /** When it was asked for; `sendAt` is later when the quiet hours held it. */
  requestedAt: string;
  sendAt: string;
  sentAt?: string;
  createdAt: string;
  by: { id: string; name: string };
  counts: { audience: number; sent: number; skipped: number; failed: number } | null;
  cancelledAt?: string;
  cancelledBy?: { id: string; name: string };
}

export interface AudienceSize {
  devices: number;
  /** Of those, at the weekly limit - they would be skipped. */
  atLimit: number;
}

export interface PushPayload {
  campaigns: PushCampaign[];
  perWeek: number;
  /** HH:MM Libyan time; `now` - inside them at this moment, until `endsAt`. */
  quietHours: { from: string; to: string; now: boolean; endsAt: string | null };
  audiences: { offers: AudienceSize; cart: AudienceSize; cities: (AudienceSize & { city: string })[] };
  devices: { total: number; offersOff: number };
  /** The signed-in staff member's own devices («إرسال تجريبي لجهازي»). */
  myDevices: number;
  storage: 'odoo' | 'local';
  service: 'expo';
  limits: { titleMax: number; bodyMax: number; perWeekMax: number };
  now: string;
}

export interface PushDraft {
  title: string;
  body: string;
  link: string;
  linkLabel: string;
  audience: Exclude<PushAudience, { kind: 'test' }>;
  when: 'now' | 'schedule';
  /** YYYY-MM-DDTHH:MM, Libyan time. */
  at?: string;
}

export class PanelError extends Error {
  status: number;
  code: string | null;
  /** The setting the server refused («contact.email», ...), when it names one. */
  field: string | null;
  /** The banner the server refused, when the error is about one (الواجهة والبانرات). */
  banner: string | null;
  constructor(message: string, status: number, code: string | null = null, field: string | null = null, banner: string | null = null) {
    super(message);
    this.name = 'PanelError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.banner = banner;
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new PanelError('تعذّر الاتصال بالخادم', 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or not JSON */
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string; field?: string; banner?: string };
    throw new PanelError(body.error || 'حدث خطأ غير متوقع', res.status, body.code ?? null, body.field ?? null, body.banner ?? null);
  }
  return data as T;
}

function ordersSearch(q: Partial<OrdersQuery>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === '' || v === 'all') continue;
    params.set(k, String(v));
  }
  // «الكل» for the period has to be said: the server's default is today.
  if (q.period === 'all') params.set('period', 'all');
  return params.toString();
}

export const panelApi = {
  me: (token: string) => call<PanelMe>(token, '/api/panel/me'),
  overview: (token: string) => call<Overview>(token, '/api/panel/overview'),
  orders: (token: string, q: Partial<OrdersQuery>) => call<OrdersPage & { query: OrdersQuery }>(token, `/api/panel/orders?${ordersSearch(q)}`),
  order: (token: string, orderName: string) =>
    call<{ order: PanelOrderDetail; canConfirm: boolean }>(token, `/api/panel/orders/${encodeURIComponent(orderName)}`),
  customer: (token: string, key: string) => call<{ customer: PanelCustomer }>(token, `/api/panel/customers/${encodeURIComponent(key)}`),
  confirm: (token: string, orderName: string) =>
    call<{ order: PanelOrder }>(token, `/api/panel/orders/${encodeURIComponent(orderName)}/confirm`, { method: 'POST' }),
  settings: (token: string) => call<SettingsPayload>(token, '/api/panel/settings'),
  saveSettings: (token: string, settings: AppSettings) =>
    call<SettingsPayload>(token, '/api/panel/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  home: (token: string) => call<HomePayload>(token, '/api/panel/home'),
  saveHome: (token: string, home: HomeDoc) => call<HomePayload>(token, '/api/panel/home', { method: 'PUT', body: JSON.stringify({ home }) }),
  /** A banner picture as a data URL → its address on the server. */
  uploadHomeImage: (token: string, imageDataUrl: string, kind: 'photo' | 'app') =>
    call<{ url: string; width: number; height: number }>(token, '/api/panel/home/images', { method: 'POST', body: JSON.stringify({ imageDataUrl, kind }) }),
  instagram: (token: string) => call<{ posts: InstagramPost[]; max: number }>(token, '/api/panel/home/instagram'),
  addInstagram: (token: string, imageDataUrl: string, link: string) =>
    call<{ post: InstagramPost }>(token, '/api/panel/home/instagram', { method: 'POST', body: JSON.stringify({ imageDataUrl, link }) }),
  reorderInstagram: (token: string, ids: string[]) =>
    call<{ posts: InstagramPost[] }>(token, '/api/panel/home/instagram/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  deleteInstagram: (token: string, id: string) => call<{ posts: InstagramPost[] }>(token, `/api/panel/home/instagram/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  quiz: (token: string) => call<QuizPayload>(token, '/api/panel/quiz'),
  saveQuiz: (token: string, rules: QuizRules) => call<QuizPayload>(token, '/api/panel/quiz', { method: 'PUT', body: JSON.stringify({ rules }) }),
  resetQuiz: (token: string) => call<QuizPayload>(token, '/api/panel/quiz/reset', { method: 'POST' }),
  products: (token: string) => call<ProductsPayload>(token, '/api/panel/products'),
  saveShop: (token: string, productId: number, changes: { description?: string | null; features?: string[] | null; enabled?: boolean }) =>
    call<ShopOverride>(token, `/api/panel/products/${productId}/shop`, { method: 'PATCH', body: JSON.stringify(changes) }),
  uploadShopImage: (token: string, productId: number, imageDataUrl: string) =>
    call<ShopOverride>(token, `/api/panel/products/${productId}/shop/image`, { method: 'POST', body: JSON.stringify({ imageDataUrl }) }),
  removeShopImage: (token: string, productId: number) => call<ShopOverride>(token, `/api/panel/products/${productId}/shop/image`, { method: 'DELETE' }),
  saveOdooProduct: (token: string, templateId: number, changes: OdooProductChanges) =>
    call<{ product: PanelProduct | null }>(token, `/api/panel/products/odoo/${templateId}`, { method: 'PUT', body: JSON.stringify(changes) }),
  push: (token: string) => call<PushPayload>(token, '/api/panel/push'),
  sendPush: (token: string, draft: PushDraft) => call<PushPayload & { campaign: PushCampaign }>(token, '/api/panel/push', { method: 'POST', body: JSON.stringify(draft) }),
  testPush: (token: string, draft: Pick<PushDraft, 'title' | 'body' | 'link' | 'linkLabel'>) =>
    call<PushPayload & { campaign: PushCampaign }>(token, '/api/panel/push/test', { method: 'POST', body: JSON.stringify(draft) }),
  setPushLimit: (token: string, perWeek: number) => call<PushPayload>(token, '/api/panel/push/limit', { method: 'PUT', body: JSON.stringify({ perWeek }) }),
  cancelPush: (token: string, id: string) => call<PushPayload & { campaign: PushCampaign }>(token, `/api/panel/push/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  team: (token: string, q = '') => call<{ users: TeamMember[] }>(token, `/api/panel/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  setRole: (token: string, userId: string, role: TeamMember['role']) =>
    call<{ id: string; role: TeamMember['role'] }>(token, `/api/panel/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};
