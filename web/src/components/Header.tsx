import { Heart, Home, LayoutDashboard, ShoppingBag, Sparkles, User as UserIcon } from 'lucide-react';

import { BrimatexLogo } from '@/components/BrimatexLogo';
import { cn } from '@/lib/utils';
import type { SectionId } from '@/types';

interface HeaderProps {
  active: SectionId;
  cartCount: number;
  wishlistCount: number;
  /** The dashboard tab is appended only for admins. */
  isAdmin: boolean;
  onNavigate: (section: SectionId) => void;
}

/**
 * No "shop" tab: the homepage is the way in — search, categories and products
 * all start there. The shop section still exists as the destination for search
 * results and category browsing, it just is not a top-level destination.
 */
const NAV: { id: SectionId; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'الرئيسية', Icon: Home },
  { id: 'quiz', label: 'ساعدني أختار', Icon: Sparkles },
  { id: 'wishlist', label: 'المفضلة', Icon: Heart },
  { id: 'cart', label: 'السلة', Icon: ShoppingBag },
  { id: 'auth', label: 'حسابي', Icon: UserIcon },
];

export function Header({
  active,
  cartCount,
  wishlistCount,
  isAdmin,
  onNavigate,
}: HeaderProps) {
  const items = isAdmin
    ? [...NAV, { id: 'admin' as SectionId, label: 'اللوحة', Icon: LayoutDashboard }]
    : NAV;

  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      {/* min-h, not a fixed height: the row grew past a hard 72px on small
          screens and the nav spilled out over the page content below. */}
      <div className="container flex min-h-[64px] items-center justify-between gap-2 py-2 sm:min-h-[72px] sm:gap-4">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="بريماتكس — الصفحة الرئيسية"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <BrimatexLogo
            title={null}
            className="h-8 w-auto text-primary transition-opacity hover:opacity-80 sm:h-10 md:h-11"
          />
        </button>

        <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="التنقل الرئيسي">
          {items.map(({ id, label, Icon }) => {
            // Sub-pages have no tab of their own — highlight the tab they came
            // from. Shop and product both descend from the homepage now.
            const current =
              active === 'shop' || active === 'product'
                ? 'home'
                : active === 'orders'
                  ? 'auth'
                  : active;
            const isActive = current === id;

            const count = id === 'cart' ? cartCount : id === 'wishlist' ? wishlistCount : 0;
            const showCount = id === 'cart' || (id === 'wishlist' && wishlistCount > 0);

            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                // Labels are hidden below `md`, so the button needs its own name
                aria-label={showCount ? `${label} (${count})` : label}
                className={cn(
                  // min-h keeps the touch height; a min-w of 44 made five
                  // buttons plus the logo overflow a 320px screen. Width comes
                  // from padding instead — still well past the 24px AA floor.
                  'relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
                  'px-2.5 md:px-3',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'font-semibold text-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-[19px] shrink-0" aria-hidden="true" />

                {/* Five labelled items do not fit a phone — icons only there */}
                <span className="hidden md:inline" aria-hidden="true">
                  {label}
                  {showCount && (
                    // keyed on the count so React remounts and replays the pop
                    <span key={count} className="tabular motion-safe:animate-pop inline-block">
                      {' '}
                      ({count})
                    </span>
                  )}
                </span>

                {/* Compact badge stands in for the count on small screens */}
                {showCount && count > 0 && (
                  <span
                    key={`badge-${count}`}
                    aria-hidden="true"
                    className="absolute -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold leading-[18px] text-accent-foreground motion-safe:animate-pop end-0 md:hidden"
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
