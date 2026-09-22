import { Heart, Home, LayoutGrid, ShoppingBag, User as UserIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SectionId } from '@/types';

interface MobileTabBarProps {
  active: SectionId;
  cartCount: number;
  wishlistCount: number;
  onNavigate: (section: SectionId) => void;
}

/**
 * The phone's navigation: a bottom tab bar, the pattern every shopping app on
 * the phone already taught its users. It sits under the thumb, and every tab
 * says what it is - the top bar's bare icons did neither.
 *
 * Phones only (below md); the top bar keeps the navigation on larger screens.
 * Unlike the desktop bar it has a "shop" tab: on a phone the catalogue is the
 * main destination, not something reached through the homepage's search.
 */
const TABS: { id: SectionId; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'الرئيسية', Icon: Home },
  { id: 'shop', label: 'المتجر', Icon: LayoutGrid },
  { id: 'wishlist', label: 'المفضلة', Icon: Heart },
  { id: 'cart', label: 'السلة', Icon: ShoppingBag },
  { id: 'auth', label: 'حسابي', Icon: UserIcon },
];

/** Screens with no tab of their own light up the tab they belong to. */
function tabFor(section: SectionId): SectionId {
  if (section === 'product') return 'shop';
  if (section === 'orders' || section === 'admin') return 'auth';
  if (section === 'quiz') return 'home';
  return section;
}

export function MobileTabBar({ active, cartCount, wishlistCount, onNavigate }: MobileTabBarProps) {
  const current = tabFor(active);

  return (
    <nav
      aria-label="التنقل"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md md:hidden',
        // Clears the iPhone home indicator; 0 elsewhere.
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <ul className="grid h-16 grid-cols-5">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = current === id;
          const count = id === 'cart' ? cartCount : id === 'wishlist' ? wishlistCount : 0;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={count > 0 ? `${label} (${count})` : label}
                className={cn(
                  'relative flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn('size-6', isActive && id !== 'wishlist' && 'stroke-[2.25]', isActive && id === 'wishlist' && 'fill-current')}
                    aria-hidden="true"
                  />
                  {count > 0 && (
                    <span
                      // keyed on the count so React remounts and replays the pop
                      key={count}
                      aria-hidden="true"
                      className="absolute -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold leading-[18px] text-accent-foreground motion-safe:animate-pop -end-2.5"
                    >
                      {count}
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className={cn(isActive && 'font-bold')}>
                  {label}
                </span>
                {isActive && (
                  <span aria-hidden="true" className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
