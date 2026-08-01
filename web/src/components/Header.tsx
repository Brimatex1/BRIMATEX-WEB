import { Heart, Home, ShoppingBag, Sparkles, User as UserIcon } from 'lucide-react';

import { BrimatexLogo } from '@/components/BrimatexLogo';
import { cn } from '@/lib/utils';
import type { SectionId } from '@/types';

interface HeaderProps {
  active: SectionId;
  cartCount: number;
  wishlistCount: number;
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

export function Header({ active, cartCount, wishlistCount, onNavigate }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-[72px] flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="بريماتكس — الصفحة الرئيسية"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <BrimatexLogo title={null} className="h-11 w-auto text-primary transition-opacity hover:opacity-80" />
        </button>

        <nav className="flex flex-wrap gap-1" aria-label="التنقل الرئيسي">
          {NAV.map(({ id, label, Icon }) => {
            // Sub-pages have no tab of their own — highlight the tab they came
            // from. Shop and product both descend from the homepage now.
            const current =
              active === 'shop' || active === 'product'
                ? 'home'
                : active === 'orders'
                  ? 'auth'
                  : active;
            const isActive = current === id;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'font-semibold text-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-[19px]" aria-hidden="true" />
                <span>
                  {label}
                  {id === 'cart' && (
                    // key on the count so React remounts the span and replays
                    // the pop each time an item lands in the cart
                    <span key={cartCount} className="tabular motion-safe:animate-pop inline-block">
                      {' '}
                      ({cartCount})
                    </span>
                  )}
                  {id === 'wishlist' && wishlistCount > 0 && (
                    <span key={wishlistCount} className="tabular motion-safe:animate-pop inline-block">
                      {' '}
                      ({wishlistCount})
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
