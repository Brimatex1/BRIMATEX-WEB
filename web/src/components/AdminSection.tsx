import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Package,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { OdooSettingsPanel } from '@/components/OdooSettingsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { CURRENCY, LOCALE, cn, formatPrice } from '@/lib/utils';
import type {
  AdminCustomer,
  AdminOrder,
  AdminOverview,
  AdminProducts,
  Role,
  User,
} from '@/types';

type Tab = 'overview' | 'orders' | 'products' | 'stock' | 'customers' | 'roles' | 'settings';

const TABS: { id: Tab; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'نظرة عامة', Icon: BarChart3 },
  { id: 'orders', label: 'الطلبات', Icon: Package },
  { id: 'products', label: 'المنتجات', Icon: Boxes },
  { id: 'stock', label: 'المخزون', Icon: AlertTriangle },
  { id: 'customers', label: 'العملاء', Icon: Users },
  { id: 'roles', label: 'الصلاحيات', Icon: ShieldCheck },
  { id: 'settings', label: 'الإعدادات', Icon: Plug },
];

const ORDER_STATUS: Record<string, string> = {
  draft: 'مسودة',
  confirmed: 'مؤكد',
  delivered: 'مُسلَّم',
  cancelled: 'ملغي',
  paid: 'مدفوع',
};

/** Below this the dashboard flags a product as running out. */
const LOW_STOCK = 5;

function money(n: number) {
  return `${formatPrice(n)} ${CURRENCY}`;
}

function shortDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface AdminSectionProps {
  user: User | null;
  token: string | null;
  onGoHome: () => void;
}

export function AdminSection({ user, token, onGoHome }: AdminSectionProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [catalogue, setCatalogue] = useState<AdminProducts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [orderQuery, setOrderQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [ov, ord, cus, prod] = await Promise.all([
        api.adminOverview(token),
        api.adminOrders(token, { status: orderFilter, q: orderQuery }),
        api.adminCustomers(token),
        api.adminProducts(token),
      ]);
      setOverview(ov);
      setOrders(ord.orders);
      setCustomers(cus.customers);
      setCatalogue(prod);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل اللوحة');
    } finally {
      setLoading(false);
    }
  }, [token, orderFilter, orderQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const lowStock = useMemo(() => {
    if (!catalogue?.hasStockData) return [];
    return catalogue.products
      .filter((p) => typeof p.stock === 'number' && p.stock <= LOW_STOCK)
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  }, [catalogue]);

  async function changeStatus(order: AdminOrder, changes: Record<string, string>) {
    if (!token) return;
    setBusy(order.orderName);
    try {
      const { order: updated } = await api.adminUpdateOrder(token, order.orderName, changes);
      setOrders((prev) =>
        prev.map((o) => (o.orderName === updated.orderName ? { ...o, ...updated } : o))
      );
      toast.success(`تم تحديث ${order.orderName}`);
      void api.adminOverview(token).then(setOverview).catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث الطلب');
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(target: AdminCustomer, role: Role) {
    if (!token) return;
    setBusy(target.id);
    try {
      await api.adminSetRole(token, target.id, role);
      setCustomers((prev) => prev.map((c) => (c.id === target.id ? { ...c, role } : c)));
      toast.success(role === 'admin' ? `${target.name} صار مديراً` : `أُزيلت صلاحية ${target.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تغيير الدور');
    } finally {
      setBusy(null);
    }
  }

  /* The route is guarded server-side too; this only avoids showing a broken page. */
  if (!user || user.role !== 'admin') {
    return (
      <section className="container max-w-lg animate-fade-up py-16 text-center">
        <ShieldCheck className="mx-auto mb-4 size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="mb-3 font-heading text-2xl font-semibold text-primary">
          هذه الصفحة للمديرين
        </h1>
        <p className="mb-6 text-muted-foreground">
          حسابك لا يملك صلاحية الوصول إلى لوحة التحكم.
        </p>
        <Button onClick={onGoHome}>العودة للرئيسية</Button>
      </section>
    );
  }

  return (
    <section className="container animate-fade-up pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-10 pb-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-primary sm:text-4xl">
            لوحة التحكم
          </h1>
          <p className="mt-2 text-muted-foreground">مرحباً {user.name} — إدارة المتجر.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn(loading && 'motion-safe:animate-spin')} aria-hidden="true" />
          تحديث
        </Button>
      </div>

      <div className="mb-8 flex gap-1 overflow-x-auto border-b pb-px" role="tablist">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              tab === id
                ? 'border-accent font-semibold text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="py-12 text-center">
          <p className="mb-4 text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {/* ---------------- نظرة عامة ---------------- */}
      {!loading && !error && tab === 'overview' && overview && (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'مبيعات اليوم', value: money(overview.sales.today), sub: `${overview.counts.today} طلب` },
              { label: 'مبيعات الشهر', value: money(overview.sales.month), sub: `${overview.counts.month} طلب` },
              { label: 'إجمالي المبيعات', value: money(overview.sales.total), sub: `${overview.counts.total} طلب` },
              { label: 'العملاء', value: String(overview.customers), sub: 'حساب مسجّل' },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 font-heading text-2xl font-semibold tabular text-primary">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground tabular">{stat.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">الطلبات حسب الحالة</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {Object.entries(overview.byStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد طلبات بعد.</p>
              )}
              {Object.entries(overview.byStatus).map(([status, count]) => (
                <div key={status} className="rounded-xl border px-4 py-3">
                  <p className="text-xs text-muted-foreground">{ORDER_STATUS[status] ?? status}</p>
                  <p className="font-heading text-xl font-semibold tabular text-primary">{count}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">أحدث الطلبات</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th scope="col" className="p-3 text-start font-medium">الطلب</th>
                      <th scope="col" className="p-3 text-start font-medium">العميل</th>
                      <th scope="col" className="p-3 text-start font-medium">المبلغ</th>
                      <th scope="col" className="p-3 text-start font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recent.map((r) => (
                      <tr key={r.orderName} className="border-b last:border-0">
                        <td className="p-3 tabular">{r.orderName}</td>
                        <td className="p-3">
                          {r.customer}
                          {r.city && <span className="text-muted-foreground"> — {r.city}</span>}
                        </td>
                        <td className="p-3 tabular">{money(r.total)}</td>
                        <td className="p-3">
                          <Badge variant={r.paymentStatus === 'paid' ? 'success' : 'secondary'}>
                            {r.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---------------- الطلبات ---------------- */}
      {!loading && !error && tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3"
                aria-hidden="true"
              />
              <Input
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                placeholder="ابحث برقم الطلب أو اسم العميل أو الجوال"
                className="ps-9"
                aria-label="بحث في الطلبات"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'unpaid', 'paid'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOrderFilter(f)}
                  aria-pressed={orderFilter === f}
                  className={cn(
                    'min-h-10 rounded-full border px-4 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    orderFilter === f
                      ? 'border-accent bg-accent/10 font-semibold text-accent'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {f === 'all' ? 'الكل' : f === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}
                </button>
              ))}
            </div>
          </div>

          {orders.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">لا توجد طلبات مطابقة.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <Card key={o.orderName}>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold tabular">{o.orderName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {o.customer?.name} · {o.customer?.phone}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {o.customer?.city} — {o.customer?.address}
                        </p>
                        {o.note && (
                          <p className="mt-1 text-sm text-muted-foreground">ملاحظة: {o.note}</p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground tabular">
                          {shortDate(o.placedAt)} · {o.items.length} صنف · فاتورة {o.invoiceName}
                        </p>
                      </div>

                      <div className="text-end">
                        <p className="font-heading text-xl font-semibold tabular text-primary">
                          {money(o.total)}
                        </p>
                        <div className="mt-2 flex flex-wrap justify-end gap-2">
                          <Badge variant={o.paymentStatus === 'paid' ? 'success' : 'secondary'}>
                            {o.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                          </Badge>
                          <Badge variant="outline">
                            {ORDER_STATUS[o.invoiceStatus] ?? o.invoiceStatus}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                      <Button
                        size="sm"
                        variant={o.paymentStatus === 'paid' ? 'outline' : 'default'}
                        disabled={busy === o.orderName}
                        onClick={() =>
                          void changeStatus(o, {
                            paymentStatus: o.paymentStatus === 'paid' ? 'unpaid' : 'paid',
                          })
                        }
                      >
                        {o.paymentStatus === 'paid' ? 'تعليم كغير مدفوع' : 'تعليم كمدفوع'}
                      </Button>
                      {(['confirmed', 'delivered', 'cancelled'] as const)
                        .filter((s) => s !== o.invoiceStatus)
                        .map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            disabled={busy === o.orderName}
                            onClick={() => void changeStatus(o, { invoiceStatus: s })}
                          >
                            {ORDER_STATUS[s]}
                          </Button>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- المنتجات ---------------- */}
      {!loading && !error && tab === 'products' && catalogue && (
        <div className="space-y-4">
          <Card className={catalogue.editable ? undefined : 'border-accent/40 bg-accent/5'}>
            <CardContent className="pt-6 text-sm">
              {catalogue.editable ? (
                <p className="text-muted-foreground">
                  المصدر: <strong className="text-foreground">ملف المتجر</strong> (الوضع التجريبي).
                  أودو غير مربوط، فالكتالوج يُدار من ملف المنتجات.
                </p>
              ) : (
                <p>
                  المصدر: <strong>أودو</strong>. الكتالوج والأسعار تُدار في أودو وتُزامَن هنا —
                  أي تعديل من اللوحة سيُمحى عند المزامنة التالية، لذلك العرض للقراءة فقط.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th scope="col" className="p-3 text-start font-medium">المنتج</th>
                  <th scope="col" className="p-3 text-start font-medium">رقم المنتج</th>
                  <th scope="col" className="p-3 text-start font-medium">السعر</th>
                  <th scope="col" className="p-3 text-start font-medium">المخزون</th>
                  <th scope="col" className="p-3 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {catalogue.products.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 tabular text-muted-foreground">{p.sku ?? '—'}</td>
                    <td className="p-3 tabular">{money(p.price)}</td>
                    <td className="p-3 tabular">
                      {catalogue.hasStockData && typeof p.stock === 'number' ? p.stock : '—'}
                    </td>
                    <td className="p-3">
                      <Badge variant={p.inStock === false ? 'outline' : 'success'}>
                        {p.inStock === false ? 'غير متوفر' : 'متوفر'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- المخزون ---------------- */}
      {!loading && !error && tab === 'stock' && catalogue && (
        <div className="space-y-4">
          {!catalogue.hasStockData ? (
            <Card className="border-accent/40 bg-accent/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                  <div className="text-sm">
                    <p className="font-semibold">لا توجد بيانات كميات</p>
                    <p className="mt-1 text-muted-foreground">
                      الكميات تأتي من أودو، وهو غير مربوط حالياً. الوضع التجريبي يحمل حالة
                      «متوفر / غير متوفر» فقط، بلا أرقام — وعرض أرقام مخترعة هنا أسوأ من
                      عدم عرضها.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : lowStock.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              لا توجد منتجات قاربت على النفاد (الحد {LOW_STOCK}).
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                منتجات كميتها {LOW_STOCK} أو أقل:
              </p>
              <div className="space-y-3">
                {lowStock.map((p) => (
                  <Card key={p.id} className={p.stock === 0 ? 'border-destructive/50' : undefined}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-sm tabular text-muted-foreground">{p.sku}</p>
                      </div>
                      <Badge variant={p.stock === 0 ? 'destructive' : 'secondary'}>
                        {p.stock === 0 ? 'نفد المخزون' : `${p.stock} متبقية`}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- العملاء ---------------- */}
      {!loading && !error && tab === 'customers' && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th scope="col" className="p-3 text-start font-medium">الاسم</th>
                <th scope="col" className="p-3 text-start font-medium">الجوال</th>
                <th scope="col" className="p-3 text-start font-medium">الطلبات</th>
                <th scope="col" className="p-3 text-start font-medium">أنفق</th>
                <th scope="col" className="p-3 text-start font-medium">آخر طلب</th>
                <th scope="col" className="p-3 text-start font-medium">مسجّل منذ</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {c.name}
                    {c.role === 'admin' && (
                      <Badge variant="secondary" className="ms-2">مدير</Badge>
                    )}
                  </td>
                  <td className="p-3 tabular">{c.phone ?? '—'}</td>
                  <td className="p-3 tabular">{c.orderCount}</td>
                  <td className="p-3 tabular">{money(c.spent)}</td>
                  <td className="p-3">{shortDate(c.lastOrderAt)}</td>
                  <td className="p-3">{shortDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- الصلاحيات ---------------- */}
      {!loading && !error && tab === 'roles' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            المديرون يرون هذه اللوحة كاملةً، بما فيها بيانات كل العملاء. امنح الصلاحية بحذر.
          </p>
          {customers.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                <div>
                  <p className="font-semibold">
                    {c.name}
                    {c.id === user.id && (
                      <span className="ms-2 text-xs text-muted-foreground">(أنت)</span>
                    )}
                  </p>
                  <p className="text-sm tabular text-muted-foreground">{c.phone ?? '—'}</p>
                  {c.locked && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      مدير عبر إعدادات الخادم — يُعدَّل من ADMIN_PHONES
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={c.role === 'admin' ? 'success' : 'secondary'}>
                    {c.role === 'admin' ? 'مدير' : 'عميل'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === c.id || c.locked || c.id === user.id}
                    onClick={() => void changeRole(c, c.role === 'admin' ? 'customer' : 'admin')}
                  >
                    {c.role === 'admin' ? 'إزالة الصلاحية' : 'تعيين مديراً'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---------------- الإعدادات ---------------- */}
      {!error && tab === 'settings' && token && (
        <OdooSettingsPanel token={token} onChanged={() => void load()} />
      )}
    </section>
  );
}
