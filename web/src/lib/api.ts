import type {
  Address,
  CartLine,
  Customer,
  OrderResult,
  OrderSummary,
  Product,
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
};
