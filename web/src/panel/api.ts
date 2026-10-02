/**
 * The admin panel's calls - /api/panel/... (src/routes/panel.js). Its own
 * client, apart from lib/api.ts: the panel only borrows the storefront's
 * session (the token in localStorage) and its sign-in calls.
 */

export type StaffRole = 'admin' | 'marketing' | 'support';
export type Section = 'overview' | 'orders' | 'home' | 'push' | 'quiz' | 'products' | 'settings';
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
  /** New orders waiting for «تأكيد»; null when the role has no orders section. */
  badges: { orders: number | null };
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

export class PanelError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'PanelError';
    this.status = status;
    this.code = code;
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
    const body = (data ?? {}) as { error?: string; code?: string };
    throw new PanelError(body.error || 'حدث خطأ غير متوقع', res.status, body.code ?? null);
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
  team: (token: string, q = '') => call<{ users: TeamMember[] }>(token, `/api/panel/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  setRole: (token: string, userId: string, role: TeamMember['role']) =>
    call<{ id: string; role: TeamMember['role'] }>(token, `/api/panel/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};
