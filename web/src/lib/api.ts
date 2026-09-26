import type {
  Address,
  AdminReview,
  Banner,
  AdminCustomer,
  AdminOrder,
  AdminOverview,
  AdminProducts,
  CartLine,
  ConversionsApiStatus,
  Customer,
  FacebookPixelSettings,
  OrderResult,
  OrderSummary,
  OdooSettings,
  Perks,
  Product,
  ProductReviews,
  Voucher,
  ProductOverrides,
  Role,
  SupportTicketInput,
  User,
  WhatsappSupportSettings,
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

  /** Reviews of a product (all its sizes), from customers who bought it. */
  getProductReviews: (productId: number) => request<ProductReviews>(`/api/products/${productId}/reviews`),

  adminReviews: (token: string) => request<{ reviews: AdminReview[] }>('/api/admin/reviews', authHeaders(token)),

  adminSetReviewHidden: (token: string, id: string, hidden: boolean) =>
    request<{ id: string; hidden: boolean }>(`/api/admin/reviews/${id}`, { ...jsonBody({ hidden }, token), method: 'PATCH' }),

  /** The home page's sliding banners. */
  getBanners: () => request<{ banners: Banner[] }>('/api/banners'),

  adminBanners: (token: string) => request<{ banners: Banner[]; max: number }>('/api/admin/banners', authHeaders(token)),

  adminAddBanner: (token: string, imageDataUrl: string, link: string) =>
    request<{ banner: Banner }>('/api/admin/banners', jsonBody({ imageDataUrl, link }, token)),

  adminSetBannerLink: (token: string, id: string, link: string) =>
    request<{ banner: Banner }>(`/api/admin/banners/${id}`, { ...jsonBody({ link }, token), method: 'PATCH' }),

  adminReorderBanners: (token: string, ids: string[]) =>
    request<{ banners: Banner[] }>('/api/admin/banners/order', { ...jsonBody({ ids }, token), method: 'PUT' }),

  adminDeleteBanner: (token: string, id: string) =>
    request<{ banners: Banner[] }>(`/api/admin/banners/${id}`, { method: 'DELETE', ...authHeaders(token) }),

  getPixelConfig: () => request<{ pixelId: string | null; lydPerUsd: number | null }>('/api/pixel-config'),

  /**
   * Customer care. Files a ticket in Odoo Helpdesk (team Customer Care) and
   * returns its reference. The token is optional — it only attributes the
   * message; guests can write too.
   */
  createSupportTicket: (body: SupportTicketInput, token?: string | null) =>
    request<{ ref: string; message: string }>('/api/support/tickets', jsonBody(body, token)),

  getWhatsappConfig: () =>
    request<{ phone: string | null; message: string }>('/api/whatsapp-config'),

  /**
   * Orders are accepted without an account. Passing the token when signed in
   * lets the server stamp the order so it appears under "my orders".
   */
  createOrder: (
    customer: Customer,
    lines: CartLine[],
    note: string,
    token?: string | null,
    /** Website only - lets the server report the purchase to Meta (lib/pixel.ts). */
    tracking?: { eventSourceUrl: string; fbp?: string; fbc?: string },
    /** One of the signed-in customer's vouchers; the server checks and applies it. */
    voucherCode?: string | null
  ) =>
    request<OrderResult>(
      '/api/orders',
      jsonBody(
        {
          customer,
          items: lines.map((l) => ({ productId: l.id, quantity: l.qty })),
          note,
          channel: 'web',
          tracking,
          ...(voucherCode ? { voucherCode } : {}),
        },
        token
      )
    ),

  /* Sign-up proves the phone first: request a WhatsApp code, trade it for a
     single-use signupToken, then register with that token. The phone is never
     sent to /register - the server reads it from the token, so nobody can
     verify one number and register another. */

  /** Always answers the same message, whether or not a code was sent. */
  requestSignupOtp: (phone: string) =>
    request<{ message: string }>('/api/auth/signup/otp/request', jsonBody({ phone })),

  verifySignupOtp: (phone: string, code: string) =>
    request<{ signupToken: string }>('/api/auth/signup/otp/verify', jsonBody({ phone, code })),

  registerVerified: (name: string, password: string, signupToken: string) =>
    request<{ token: string; user: User }>(
      '/api/auth/register',
      jsonBody({ name, password, signupToken })
    ),

  /* Password recovery: the same three steps, against an existing account. */

  /** Always answers the same message, whether or not the number has an account. */
  requestPasswordOtp: (phone: string) =>
    request<{ message: string }>('/api/auth/otp/request', jsonBody({ phone })),

  verifyPasswordOtp: (phone: string, code: string) =>
    request<{ resetToken: string }>('/api/auth/otp/verify', jsonBody({ phone, code })),

  /** Signs the user in: the server drops old sessions and returns a new one. */
  resetPassword: (resetToken: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/password', jsonBody({ resetToken, password })),

  login: (phone: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', jsonBody({ phone, password })),

  me: (token: string) => request<{ user: User }>('/api/auth/me', authHeaders(token)),

  /** Invalidates the token server-side; clearing localStorage alone does not. */
  logout: (token: string) =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
      ...authHeaders(token),
    }),

  /** The profile photo, as a JPEG/PNG/WebP data URL (the server checks the bytes). */
  uploadAvatar: (token: string, imageDataUrl: string) =>
    request<{ avatarUrl: string }>('/api/user/avatar', jsonBody({ imageDataUrl }, token)),

  removeAvatar: (token: string) =>
    request<{ avatarUrl: null }>('/api/user/avatar', { method: 'DELETE', ...authHeaders(token) }),

  /* Loyalty - one balance for the website and the app (src/lib/perks.js). */

  getPerks: (token: string) => request<Perks>('/api/user/perks', authHeaders(token)),

  /** Whole steps of 250 points only; the server re-checks the balance. */
  redeemPoints: (token: string, points: number) =>
    request<{ voucher: Voucher }>('/api/user/points/redeem', jsonBody({ points }, token)),

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

  adminOrders: (token: string, params?: { status?: string; q?: string; channel?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.channel && params.channel !== 'all') qs.set('channel', params.channel);
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

  adminProductOverrides: (token: string, productId: number) =>
    request<ProductOverrides>(`/api/admin/products/${productId}/overrides`, authHeaders(token)),

  /** Only send the fields that changed — the endpoint patches, it doesn't replace. */
  adminSaveProductOverrides: (
    token: string,
    productId: number,
    changes: { iconKeys?: string[]; description?: string | null; enabled?: boolean }
  ) =>
    request<ProductOverrides>(`/api/admin/products/${productId}/overrides`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(changes),
    }),

  /** `imageDataUrl` is a data: URL (e.g. from FileReader.readAsDataURL) — JPEG/PNG/WebP, 5MB max. */
  adminUploadProductImage: (token: string, productId: number, imageDataUrl: string) =>
    request<ProductOverrides>(`/api/admin/products/${productId}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ imageDataUrl }),
    }),

  adminRemoveProductImage: (token: string, productId: number) =>
    request<ProductOverrides>(`/api/admin/products/${productId}/image`, {
      method: 'DELETE',
      ...authHeaders(token),
    }),

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
    request<{ facebookPixel: FacebookPixelSettings; conversionsApi: ConversionsApiStatus }>(
      '/api/admin/settings/facebook-pixel',
      authHeaders(token)
    ),

  /** An empty `lydPerUsd` clears the rate, and events go back to LYD. */
  adminSaveFacebookPixel: (token: string, pixelId: string, lydPerUsd: string) =>
    request<{ facebookPixel: FacebookPixelSettings }>('/api/admin/settings/facebook-pixel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pixelId, lydPerUsd }),
    }),

  /** Sends one test event under Events Manager's test code - never counted as live data. */
  adminTestConversionsApi: (token: string, testEventCode: string) =>
    request<{ ok: boolean; received?: number; error?: string }>(
      '/api/admin/settings/facebook-pixel/test',
      jsonBody({ testEventCode }, token)
    ),

  /** Saves the Conversions API token on the server. Write-only: it never comes back. */
  adminSaveCapiToken: (token: string, capiToken: string) =>
    request<{ conversionsApi: ConversionsApiStatus }>('/api/admin/settings/facebook-pixel/capi-token', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: capiToken }),
    }),

  adminClearCapiToken: (token: string) =>
    request<{ conversionsApi: ConversionsApiStatus }>('/api/admin/settings/facebook-pixel/capi-token', {
      method: 'DELETE',
      ...authHeaders(token),
    }),

  adminClearFacebookPixel: (token: string) =>
    request<{ facebookPixel: FacebookPixelSettings }>('/api/admin/settings/facebook-pixel', {
      method: 'DELETE',
      ...authHeaders(token),
    }),

  adminWhatsappSupportSettings: (token: string) =>
    request<{ whatsappSupport: WhatsappSupportSettings }>(
      '/api/admin/settings/whatsapp-support',
      authHeaders(token)
    ),

  adminSaveWhatsappSupport: (token: string, phone: string, message: string) =>
    request<{ whatsappSupport: WhatsappSupportSettings }>('/api/admin/settings/whatsapp-support', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone, message }),
    }),

  adminClearWhatsappSupport: (token: string) =>
    request<{ whatsappSupport: WhatsappSupportSettings }>('/api/admin/settings/whatsapp-support', {
      method: 'DELETE',
      ...authHeaders(token),
    }),
};
