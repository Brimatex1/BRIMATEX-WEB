import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { OrderSummary } from '@/types';

import { couponsText, formatPoints, PointsIcon } from '../loyalty';
import { Breadcrumb } from '../pages/CategoryPage';
import { Link, useRouter, type AccountSection, type Route } from '../router';
import { useShop } from '../state';
import { Container, EmptyState } from '../ui';

const LINKS: { label: string; to: Route; sections?: AccountSection[]; loyalty?: boolean }[] = [
  { label: 'طلباتي', to: { name: 'account', section: 'orders' }, sections: ['orders'] },
  { label: 'العناوين', to: { name: 'account', section: 'addresses' }, sections: ['addresses'] },
  { label: 'المفضّلة', to: { name: 'account', section: 'favorites' }, sections: ['favorites'] },
  { label: 'الضمان', to: { name: 'account', section: 'warranty' }, sections: ['warranty'] },
  { label: 'الإشعارات', to: { name: 'account', section: 'notifications' }, sections: ['notifications'] },
  // The loyalty add-on: only while the program is on (and reachable).
  { label: 'نقاطي وقسائمي', to: { name: 'account', section: 'loyalty' }, sections: ['loyalty', 'coupons'], loyalty: true },
  { label: 'الإعدادات', to: { name: 'account', section: 'settings' }, sections: ['settings'] },
  { label: 'الدعم', to: { name: 'help' } },
];

/** The customer's orders, newest first; re-read on demand (after a cancel). */
export function useMyOrders() {
  const shop = useShop();
  const token = shop.auth.token;
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { orders: list } = await api.getOrders(token);
      setOrders([...list].sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt))));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل الطلبات');
      setOrders((o) => o ?? []);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  return { orders, error, reload: load };
}

/** What deleting removes and what stays - the same words as the app's. */
const DELETE_TEXT =
  'يُحذف حسابك نهائياً: بياناتك وعناوينك والمفضّلة وتقييماتك، ويُلغى رصيد نقاط الولاء. الفواتير التي يُلزمنا القانون بحفظها تبقى في سجلات الشركة، والطلب الجاري يُكمَل أو يُلغى حسب حالته. للتأكيد نرسل رمزاً إلى واتساب رقمك.';

function DeleteAccount({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const shop = useShop();
  const { go } = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two steps: send a WhatsApp code to the account's number, then delete with it.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const phone = shop.auth.user?.phone ?? '';

  useEffect(() => {
    if (!open) {
      setCodeSent(false);
      setCode('');
      setError(null);
    }
  }, [open]);

  async function sendCode() {
    if (!phone) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordOtp(phone);
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر إرسال الرمز');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!shop.auth.token || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const { resetToken } = await api.verifyPasswordOtp(phone, code);
      await api.deleteAccount(shop.auth.token, resetToken);
      shop.auth.signOut();
      onOpenChange(false);
      go({ name: 'home' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حذف الحساب');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" className="max-w-md">
        <DialogTitle className="text-xl font-bold">حذف الحساب نهائياً؟</DialogTitle>
        <DialogDescription className="text-[15px] leading-relaxed">{DELETE_TEXT}</DialogDescription>
        {codeSent ? (
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            className="text-center text-lg tracking-[0.4em]"
            placeholder="رمز التحقق"
            aria-label="رمز التحقق"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          {codeSent ? (
            <Button variant="destructive" size="store" className="flex-1" loading={busy} disabled={code.length !== 6} onClick={() => void confirm()}>
              حذف الحساب
            </Button>
          ) : (
            <Button variant="destructive" size="store" className="flex-1" loading={busy} onClick={() => void sendCode()}>
              أرسل رمز التأكيد
            </Button>
          )}
          <Button variant="outline" size="store" className="flex-1" onClick={() => onOpenChange(false)}>
            تراجع
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * حسابي (handoff WebAccount): the sidebar - photo or initial, name, number,
 * the account's pages, «تسجيل الخروج» and «حذف الحساب» in red - beside the
 * page. On phones the pages are chips above it. Signed out: the login drawer.
 */
export function AccountLayout({ section, crumbs, children }: { section: AccountSection | null; crumbs?: { label: string; to?: Route }[]; children: ReactNode }) {
  const shop = useShop();
  const { go } = useRouter();
  const user = shop.auth.user;
  const [deleting, setDeleting] = useState(false);
  const perks = shop.loyalty.info;
  const nav = useRef<HTMLElement>(null);

  // Phones: the chip row scrolls sideways - bring this page's chip into view.
  useEffect(() => {
    const chip = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (chip && nav.current && nav.current.scrollWidth > nav.current.clientWidth) chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' as ScrollBehavior });
  }, [section, Boolean(perks), Boolean(user)]);

  useEffect(() => {
    if (!shop.auth.checking && !user) shop.requireLogin('account');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.auth.checking, user]);

  if (!user) {
    return (
      <Container>
        <EmptyState icon={<UserRound />} title={shop.auth.checking ? 'جارٍ التحميل…' : 'سجّل الدخول لعرض حسابك'} body={shop.auth.checking ? undefined : 'طلباتك وعناوينك وضمان مراتبك في مكان واحد.'} action={shop.auth.checking ? undefined : 'تسجيل الدخول'} onAction={() => shop.requireLogin('account')} />
      </Container>
    );
  }

  const initial = user.name.trim().charAt(0);
  return (
    <Container className="pb-16">
      <Breadcrumb items={[{ label: 'حسابي', to: { name: 'account', section: 'orders' } }, ...(crumbs ?? [])]} />
      {/* minmax(0, …): a column never grows to its widest child (the phone's tab row scrolls inside itself). */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
        <aside aria-label="حسابي" className="flex min-w-0 flex-col gap-1 lg:sticky lg:top-40 lg:self-start">
          <div className="mb-3 flex items-center gap-3">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="size-14 rounded-full object-cover" />
            ) : (
              <span className="grid size-14 place-items-center rounded-full bg-porcelain text-xl font-bold text-dark-ocean">{initial}</span>
            )}
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-base">{user.name}</b>
              {user.phone ? (
                <bdi dir="ltr" className="text-start text-sm text-muted-foreground tabular-nums">
                  {user.phone}
                </bdi>
              ) : null}
            </span>
          </div>
          {/* The loyalty add-on: «1,240 نقطة · قسيمتان» under the number, to نقاطي. */}
          {perks ? (
            <Link
              to={{ name: 'account', section: 'loyalty' }}
              aria-label={`نقاطي: ${formatPoints(perks.points)} نقطة و${couponsText(perks.couponsAvailable)}`}
              className="mb-3 inline-flex min-h-11 max-w-full animate-fade-up items-center gap-2 self-start rounded-full border border-border bg-image-bg px-3.5 text-sm transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PointsIcon className="size-[18px] text-brand-text" />
              <b className="whitespace-nowrap">
                <bdi dir="ltr" className="tabular-nums">
                  {formatPoints(perks.points)}
                </bdi>{' '}
                نقطة
              </b>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="truncate text-muted-foreground">{couponsText(perks.couponsAvailable)}</span>
              <ChevronLeft className="size-4 shrink-0" aria-hidden />
            </Link>
          ) : null}
          <nav ref={nav} aria-label="صفحات الحساب" className="-mx-4 flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0">
            {LINKS.filter((l) => !l.loyalty || perks).map((l) => {
              const on = section !== null && Boolean(l.sections?.includes(section));
              return (
                <Link
                  key={l.label}
                  to={l.to}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full border border-border px-4 py-2 text-[15px] font-bold lg:rounded-lg lg:border-0 lg:px-3 lg:py-2.5',
                    on ? 'border-foreground bg-foreground text-background lg:bg-image-bg lg:text-foreground' : 'hover:bg-accent'
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 hidden flex-col items-start gap-2 border-t border-border pt-4 lg:flex">
            <button
              type="button"
              className="px-3 py-1.5 text-[15px] font-bold hover:underline"
              onClick={() => {
                shop.auth.signOut();
                go({ name: 'home' });
              }}
            >
              تسجيل الخروج
            </button>
            <button type="button" className="px-3 py-1.5 text-[15px] font-bold text-destructive hover:underline" onClick={() => setDeleting(true)}>
              حذف الحساب
            </button>
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
      {/* Phones: sign out and delete under the page. */}
      <div className="mt-10 flex items-center justify-between border-t border-border pt-5 lg:hidden">
        <button
          type="button"
          className="text-[15px] font-bold"
          onClick={() => {
            shop.auth.signOut();
            go({ name: 'home' });
          }}
        >
          تسجيل الخروج
        </button>
        <button type="button" className="text-[15px] font-bold text-destructive" onClick={() => setDeleting(true)}>
          حذف الحساب
        </button>
      </div>
      <DeleteAccount open={deleting} onOpenChange={setDeleting} />
    </Container>
  );
}
