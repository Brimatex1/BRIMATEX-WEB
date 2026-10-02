/**
 * The admin panel's calls - /api/panel/... (src/routes/panel.js). Its own
 * client, apart from lib/api.ts: the panel only borrows the storefront's
 * session (the token in localStorage) and its sign-in calls.
 */

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
  lastPush: null;
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

export interface InstagramPost {
  id: string;
  imageUrl: string;
  link: string;
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
  team: (token: string, q = '') => call<{ users: TeamMember[] }>(token, `/api/panel/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  setRole: (token: string, userId: string, role: TeamMember['role']) =>
    call<{ id: string; role: TeamMember['role'] }>(token, `/api/panel/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};
