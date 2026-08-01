import type {
  Address,
  AdminCustomer,
  AdminOrder,
  AdminOverview,
  AdminProducts,
  CartLine,
  Customer,
  FacebookPixelSettings,
  OrderResult,
  OrderSummary,
  OdooSettings,
  Product,
  Role,
  User,
} from '@/types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم', 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const message =
      res.status === 429
        ? 'تم إرسال طلبات كثيرة. انتظر دقيقة ثم حاول مجدداً.'
        : (data as { error?: string })?.error || 'حدث خطأ غير متوقع';
    throw new ApiError(message, res.status);
  }

  return data as T;
}

function jsonBody(body: unknown, token?: string | null): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

function authHeaders(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export const api = {
  getProducts: () =>
    request<{ source: string; products: Product[] }>('/api/products'),

  getPixelConfig: () => request<{ pixelId: string | null }>('/api/pixel-config'),

  /**
   * Orders are accepted without an account. Passing the token when signed in
   * lets the server stamp the order so it appears under "my orders".
   */
  createOrder: (
    customer: Customer,
    lines: CartLine[],
    note: string,
    token?: string | null
  ) =>
    request<OrderResult>(
      '/api/orders',
      jsonBody(
        {
          customer,
          items: lines.map((l) => ({ productId: l.id, quantity: l.qty })),
          note,
        },
        token
      )
    ),

  register: (name: string, phone: string, password: string) =>
    request<{ token: string; user: User }>(
      '/api/auth/register',
      jsonBody({ name, phone, password })
    ),

  login: (phone: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', jsonBody({ phone, password })),

  me: (token: string) => request<{ user: User }>('/api/auth/me', authHeaders(token)),

  /** Invalidates the token server-side; clearing localStorage alone does not. */
  logout: (token: string) =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
      ...authHeaders(token),
    }),

  getOrders: (token: string) =>
    request<{ orders: OrderSummary[] }>('/api/user/orders', authHeaders(token)),

  addAddress: (token: string, address: string, city: string) =>
    request<{ address: Address }>('/api/user/addresses', jsonBody({ address, city }, token)),

  removeAddress: (token: string, id: string) =>
    request<{ message: string }>(`/api/user/addresses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      ...authHeaders(token),
    }),

  addToWishlist: (token: string, productId: number) =>
    request<{ message: string }>('/api/user/wishlist', jsonBody({ productId }, token)),

  removeFromWishlist: (token: string, productId: number) =>
    request<{ message: string }>(`/api/user/wishlist/${productId}`, {
      method: 'DELETE',
      ...authHeaders(token),
    }),

  /* ------------------------------------------------------------ dashboard */

  adminOverview: (token: string) =>
    request<AdminOverview>('/api/admin/overview', authHeaders(token)),

  adminOrders: (token: string, params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.q?.trim()) qs.set('q', params.q.trim());
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{ orders: AdminOrder[]; totalMatching: number }>(
      `/api/admin/orders${suffix}`,
      authHeaders(token)
    );
  },

  adminUpdateOrder: (
    token: string,
    orderName: string,
    changes: { paymentStatus?: string; invoiceStatus?: string }
  ) =>
    request<{ order: AdminOrder }>(`/api/admin/orders/${encodeURIComponent(orderName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(changes),
    }),

  adminCustomers: (token: string) =>
    request<{ customers: AdminCustomer[] }>('/api/admin/customers', authHeaders(token)),

  adminSetRole: (token: string, userId: string, role: Role) =>
    request<{ id: string; role: Role }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    }),

  adminProducts: (token: string) =>
    request<AdminProducts>('/api/admin/products', authHeaders(token)),

  adminOdooSettings: (token: string) =>
    request<{ odoo: OdooSettings }>('/api/admin/settings/odoo', authHeaders(token)),

  /** Send an empty apiKey to keep the stored one — it is never sent back to us. */
  adminSaveOdoo: (
    token: string,
    values: { url: string; db: string; username: string; apiKey: string }
  ) =>
    request<{ odoo: OdooSettings }>('/api/admin/settings/odoo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(values),
    }),

  adminClearOdoo: (token: string) =>
    request<{ odoo: OdooSettings }>('/api/admin/settings/odoo', {
      method: 'DELETE',
      ...authHeaders(token),
    }),

  adminTestOdoo: (token: string) =>
    request<{ ok: true; uid: number; serverVersion: string | null; productCount: number | null }>(
      '/api/admin/settings/odoo/test',
      { method: 'POST', ...authHeaders(token) }
    ),

  adminSync: (token: string) =>
    request<{ source: string; count: number; syncedAt: string }>('/api/admin/sync', {
      method: 'POST',
      ...authHeaders(token),
    }),

  adminFacebookPixelSettings: (token: string) =>
    request<{ facebookPixel: FacebookPixelSettings }>(
      '/api/admin/settings/facebook-pixel',
      authHeaders(token)
    ),

  adminSaveFacebookPixel: (token: string, pixelId: string) =>
    request<{ facebookPixel: FacebookPixelSettings }>('/api/admin/settings/facebook-pixel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pixelId }),
    }),

  adminClearFacebookPixel: (token: string) =>
    request<{ facebookPixel: FacebookPixelSettings }>('/api/admin/settings/facebook-pixel', {
      method: 'DELETE',
      ...authHeaders(token),
    }),
};
