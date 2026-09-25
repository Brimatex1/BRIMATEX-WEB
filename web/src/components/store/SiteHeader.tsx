import { useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Heart, LayoutDashboard, Menu, Package, Search, ShoppingBag, Star, Ticket, User as UserIcon } from 'lucide-react';

import { BrimatexLogo } from '@/components/BrimatexLogo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { SectionId, Tier, User } from '@/types';

interface SiteHeaderProps {
  section: SectionId;
  user: User | null;
  cartCount: number;
  tiers: Tier[];
  onNavigate: (section: SectionId) => void;
  onOpenTier: (key: string) => void;
  onSearch: (query: string) => void;
  onOpenCart: () => void;
}

/** Which main link a screen belongs to. */
function mainLinkFor(section: SectionId): SectionId | null {
  if (section === 'home') return 'home';
  if (section === 'shop' || section === 'product') return 'shop';
  if (section === 'quiz') return 'quiz';
  return null;
}

const MAIN_LINKS: { id: SectionId; label: string }[] = [
  { id: 'home', label: 'الرئيسية' },
  { id: 'shop', label: 'كل المراتب' },
  { id: 'quiz', label: 'اختبار المرتبة' },
];

/**
 * The store's header, on every page: a strip with the shop's promises, then
 * the logo, the main links with the tiers in a menu, search, and the
 * wishlist, account and cart. On a phone the links move into a side menu.
 */
export function SiteHeader({ section, user, cartCount, tiers, onNavigate, onOpenTier, onSearch, onOpenCart }: SiteHeaderProps) {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const active = mainLinkFor(section);
  const isAdmin = user?.role === 'admin';

  function submit(e: FormEvent) {
    e.preventDefault();
    onSearch(query.trim());
    setMenuOpen(false);
  }

  const go = (id: SectionId) => {
    setMenuOpen(false);
    onNavigate(id);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="bg-primary text-primary-foreground">
        <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs md:text-sm">
          الدفع عند الاستلام · توصيل مجاني
          <span className="hidden sm:inline"> لباب بيتك · ضمان حتى 10 سنوات لبعض المنتجات</span>
        </p>
      </div>

      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 md:gap-6 md:px-6">
        {/* ── Phone: the side menu ── */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="القائمة">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0">
            <SheetHeader className="border-b p-5 text-start">
              <SheetTitle>
                <BrimatexLogo title={null} className="h-9 w-auto text-primary" />
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-3">
              <form onSubmit={submit} className="relative mb-3" role="search">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث عن مرتبة"
                  aria-label="بحث في المراتب"
                  className="ps-9"
                />
              </form>
              <nav aria-label="القائمة الرئيسية" className="flex flex-col">
                {MAIN_LINKS.map((l) => (
                  <MenuLink key={l.id} active={active === l.id} onClick={() => go(l.id)}>
                    {l.label}
                  </MenuLink>
                ))}
              </nav>
              {tiers.length > 0 && (
                <>
                  <Separator className="my-3" />
                  <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">الفئات</p>
                  {tiers.map((t) => (
                    <MenuLink
                      key={t.key}
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenTier(t.key);
                      }}
                    >
                      مراتب {t.name}
                    </MenuLink>
                  ))}
                </>
              )}
              <Separator className="my-3" />
              <MenuLink onClick={() => go('wishlist')}>المفضّلة</MenuLink>
              <MenuLink onClick={() => go(user ? 'orders' : 'auth')}>طلباتي</MenuLink>
              <MenuLink onClick={() => go('auth')}>{user ? 'حسابي' : 'تسجيل الدخول'}</MenuLink>
              {isAdmin && <MenuLink onClick={() => go('admin')}>لوحة التحكم</MenuLink>}
            </div>
            <div className="border-t p-3">
              <SheetClose asChild>
                <Button variant="outline" className="w-full" onClick={() => onNavigate('shop')}>
                  تسوّق كل المراتب
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Logo ── */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('home');
          }}
          aria-label="بريماتكس — الصفحة الرئيسية"
          className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrimatexLogo title={null} className="h-9 w-auto text-primary md:h-10" />
          <span className="hidden text-sm font-bold leading-tight text-primary lg:block">
            بريماتكس
            <span className="block text-xs font-normal text-muted-foreground">لصناعة الإسفنج والمراتب</span>
          </span>
        </a>

        {/* ── Desktop: main links, with the tiers in a menu ── */}
        <nav aria-label="القائمة الرئيسية" className="hidden items-center gap-1 md:flex">
          {MAIN_LINKS.slice(0, 2).map((l) => (
            <NavButton key={l.id} active={active === l.id} onClick={() => onNavigate(l.id)}>
              {l.label}
            </NavButton>
          ))}
          {tiers.length > 0 && (
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1 text-muted-foreground hover:text-foreground">
                  الفئات
                  <ChevronDown className="size-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {tiers.map((t) => (
                  <DropdownMenuItem key={t.key} onSelect={() => onOpenTier(t.key)}>
                    مراتب {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <NavButton active={active === 'quiz'} onClick={() => onNavigate('quiz')}>
            اختبار المرتبة
          </NavButton>
        </nav>

        {/* ── Desktop: search ── */}
        <form onSubmit={submit} className="relative ms-auto hidden w-full max-w-xs lg:block" role="search">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن مرتبة"
            aria-label="بحث في المراتب"
            className="h-9 border-border ps-9"
          />
        </form>

        {/* ── Wishlist, account, cart ── */}
        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => onNavigate('wishlist')} aria-label="المفضّلة">
            <Heart className="size-5" />
          </Button>

          {user ? (
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="حسابي">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <UserIcon className="size-5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onNavigate('auth')}>
                  <UserIcon /> حسابي
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onNavigate('orders')}>
                  <Package /> طلباتي
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onNavigate('vouchers')}>
                  <Ticket /> القسائم
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onNavigate('points')}>
                  <Star /> نقاطي
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onNavigate('admin')}>
                      <LayoutDashboard /> لوحة التحكم
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => onNavigate('auth')}>
              تسجيل الدخول
            </Button>
          )}

          <Button variant="ghost" size="icon" className="relative" onClick={onOpenCart} aria-label={cartCount ? `السلة (${cartCount})` : 'السلة'}>
            <ShoppingBag className="size-5" />
            {cartCount > 0 && (
              <span
                key={cartCount}
                aria-hidden="true"
                className="absolute -end-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-foreground motion-safe:animate-pop"
              >
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </Button>
  );
}

function MenuLink({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full rounded-md px-3 py-2.5 text-start text-sm font-medium transition-colors hover:bg-muted',
        active && 'bg-muted text-foreground'
      )}
    >
      {children}
    </button>
  );
}
