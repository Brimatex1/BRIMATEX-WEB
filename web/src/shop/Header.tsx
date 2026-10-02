import { useState } from 'react';
import { Heart, Menu, ShoppingBasket, User } from 'lucide-react';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import { TIER_TITLE, TIER_KEYS } from './catalog';
import { Link, useRouter, type Route } from './router';
import { SearchBox } from './SearchBox';
import { useShop } from './state';
import { Container, Logo } from './ui';

const NAV: { label: string; to: Route }[] = [
  { label: 'المراتب', to: { name: 'category', tier: null } },
  ...TIER_KEYS.map((tier) => ({ label: TIER_TITLE[tier], to: { name: 'category', tier } as Route })),
  { label: 'العروض', to: { name: 'offers' } },
  { label: 'ساعدني أختار', to: { name: 'quiz' } },
  { label: 'صالة العرض', to: { name: 'showroom' } },
];

/** Is this nav item the page on screen? */
function isCurrent(route: Route, item: Route): boolean {
  if (route.name === 'category' && item.name === 'category') return route.tier === item.tier;
  if (route.name === 'product' || route.name === 'reviews') return false;
  return route.name === item.name;
}

/** «4 قطع» for the cart's label. */
function piecesLabel(n: number): string {
  if (n === 0) return 'السلة فارغة';
  if (n === 1) return 'السلة، قطعة واحدة';
  if (n === 2) return 'السلة، قطعتان';
  return n <= 10 ? `السلة، ${n} قطع` : `السلة، ${n} قطعة`;
}

/** The navy strip: pay on delivery, the delivery city, contact. Stays navy in dark mode. */
function TopStrip() {
  const shop = useShop();
  return (
    <div className="bg-dark-ocean text-[13px] text-white">
      <Container className="flex h-9 items-center justify-between gap-4">
        <span className="truncate">الدفع عند الاستلام: نقداً أو بطاقة مصرفية أو حوالة مصرفية</span>
        <span className="hidden shrink-0 items-center gap-5 text-nebula sm:flex">
          <button type="button" className="hover:underline" onClick={() => shop.setCityDialogOpen(true)}>
            التوصيل إلى: <b className="text-white">{shop.city ?? 'اختر مدينتك'}</b>
          </button>
          <Link to={{ name: 'help' }} className="hover:underline">
            تواصل معنا
          </Link>
        </span>
      </Container>
    </div>
  );
}

function IconLink({ to, label, children, onClick }: { to: Route; label: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <Link to={to} aria-label={label} onClick={onClick} className="relative grid size-11 place-items-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </Link>
  );
}

function CartBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    // A new key on each change replays the pulse (design/docs/MOTION.md).
    <span key={count} className="absolute start-auto end-0.5 top-0.5 grid h-[18px] min-w-[18px] animate-badge-pulse place-items-center rounded-full bg-destructive px-[5px] text-[11px] font-bold leading-none text-white motion-reduce:animate-none" aria-hidden>
      {count}
    </span>
  );
}

/**
 * Every page but checkout: the strip, then logo, search, account, favourites
 * and cart, then the sections with the current one underlined. On phones: a
 * menu button (the sections in a drawer), the icons, and search below.
 */
export function Header() {
  const shop = useShop();
  const { route } = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = shop.auth.user;
  const firstName = user?.name.trim().split(/\s+/)[0];

  // Guests: the account opens the login drawer instead of a page (favourites work signed out).
  const gate = (reason: 'account') => (e: React.MouseEvent) => {
    if (user) return;
    e.preventDefault();
    shop.requireLogin(reason);
  };

  return (
    <>
      <TopStrip />
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <Container>
          <div className="flex h-16 items-center gap-2 md:h-[84px] md:gap-8">
            <button type="button" className="grid size-11 place-items-center rounded-full hover:bg-accent md:hidden" aria-label="القائمة" onClick={() => setMenuOpen(true)}>
              <Menu className="size-6" strokeWidth={1.8} />
            </button>
            <Link to={{ name: 'home' }} aria-label="بريماتكس، الرئيسية" className="shrink-0">
              <Logo className="h-9 md:h-[53px]" />
            </Link>
            <SearchBox className="hidden flex-1 md:flex" />
            <div className="flex-1 md:hidden" />
            <nav aria-label="الحساب" className="flex items-center gap-0.5 md:gap-1.5">
              <Link
                to={{ name: 'account', section: 'orders' }}
                onClick={gate('account')}
                className="flex h-11 items-center gap-2 rounded-full px-2.5 text-[15px] font-bold hover:bg-accent md:px-3.5"
                aria-label={user ? `حسابي، ${firstName}` : 'تسجيل الدخول'}
              >
                <User className="size-[22px]" strokeWidth={1.8} />
                <span className="hidden lg:inline">{user ? `أهلاً، ${firstName}` : 'أهلاً! سجّل الدخول'}</span>
              </Link>
              <IconLink to={{ name: 'account', section: 'favorites' }} label="المفضّلة">
                <Heart className="size-[22px]" strokeWidth={1.8} />
              </IconLink>
              <IconLink
                to={{ name: 'cart' }}
                label={piecesLabel(shop.cart.count)}
                onClick={(e) => {
                  // The basket opens the drawer where the page has room for it; /cart stays a real page.
                  if (route.name === 'cart') return;
                  e.preventDefault();
                  shop.setCartDrawerOpen(true);
                }}
              >
                <ShoppingBasket className="size-[22px]" strokeWidth={1.8} />
                <CartBadge count={shop.cart.count} />
              </IconLink>
            </nav>
          </div>
          <SearchBox className="mb-3 md:hidden" />
          <nav aria-label="الأقسام" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:mx-0 md:gap-8 md:overflow-visible md:px-0 md:pb-0">
            {NAV.map((item) => {
              const on = isCurrent(route, item.to);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'shrink-0 whitespace-nowrap text-[15px] font-bold',
                    // Phones: chips. Desktop: text with a 3 px underline on the current one.
                    'rounded-full border border-border px-4 py-2 md:rounded-none md:border-0 md:border-b-[3px] md:px-0 md:py-3.5',
                    on ? 'border-foreground bg-foreground text-background md:border-foreground md:bg-transparent md:text-foreground' : 'md:border-transparent hover:md:border-border'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </Container>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
          <SheetTitle className="sr-only">القائمة</SheetTitle>
          <div className="flex h-full flex-col gap-1 overflow-y-auto p-6 pt-14">
            {NAV.map((item) => (
              <Link key={item.label} to={item.to} onClick={() => setMenuOpen(false)} className="border-b border-border py-4 text-lg font-bold">
                {item.label}
              </Link>
            ))}
            <button type="button" className="py-4 text-start text-[15px]" onClick={() => { setMenuOpen(false); shop.setCityDialogOpen(true); }}>
              التوصيل إلى: <b>{shop.city ?? 'اختر مدينتك'}</b>
            </button>
            <Link to={{ name: 'help' }} onClick={() => setMenuOpen(false)} className="py-2 text-[15px]">
              تواصل معنا
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Checkout's own header: logo, title, back to the cart - nothing to leave the order by. */
export function MinimalHeader({ title, back }: { title: string; back?: { label: string; to: Route } }) {
  return (
    <header className="border-b border-border">
      <Container className="flex h-16 items-center justify-between gap-4 md:h-20">
        <Link to={{ name: 'home' }} aria-label="بريماتكس، الرئيسية">
          <Logo className="h-9 md:h-11" />
        </Link>
        <h1 className="text-base font-bold">{title}</h1>
        {back ? (
          <Link to={back.to} className="text-sm font-bold text-brand-text underline-offset-4 hover:underline">
            {back.label}
          </Link>
        ) : (
          <span />
        )}
      </Container>
    </header>
  );
}
