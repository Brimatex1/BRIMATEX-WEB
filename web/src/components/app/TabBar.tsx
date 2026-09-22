import { Heart, Home, ShoppingBag, User as UserIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SectionId } from '@/types';

interface MobileTabBarProps {
  active: SectionId;
  cartCount: number;
  onNavigate: (section: SectionId) => void;
}

/**
 * The phone's tab bar, as in the iOS app (App.tsx there): four tabs - home,
 * wishlist, cart, account - icons only, all in Dark Ocean, the current one
 * filled; a Dark Ocean badge on the cart. The catalogue lives on home, as in
 * the app, so there is no shop tab.
 */
const TABS: { id: SectionId; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'الرئيسية', Icon: Home },
  { id: 'wishlist', label: 'المفضّلة', Icon: Heart },
  { id: 'cart', label: 'السلة', Icon: ShoppingBag },
  { id: 'auth', label: 'حسابي', Icon: UserIcon },
];

/** Screens pushed on top of a tab keep that tab lit. */
function tabFor(section: SectionId): SectionId {
  if (section === 'shop' || section === 'product' || section === 'quiz') return 'home';
  if (section === 'orders' || section === 'admin') return 'auth';
  return section;
}

export function TabBar({ active, cartCount, onNavigate }: MobileTabBarProps) {
  const current = tabFor(active);

  return (
    <nav
      aria-label="التنقل"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-app-border bg-white font-app pb-[env(safe-area-inset-bottom)] shadow-app-bar"
    >
      <ul className="grid h-[72px] grid-cols-4 pt-2.5">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = current === id;
          const badge = id === 'cart' && cartCount > 0 ? cartCount : 0;
          return (
            <li key={id} className="flex justify-center">
              <button
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={badge ? `${label} (${badge})` : label}
                className="relative grid size-12 place-items-start justify-center text-app-ocean focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ocean rounded-xl"
              >
                <Icon
                  className={cn('size-[26px]', isActive && 'fill-current')}
                  strokeWidth={isActive ? 2 : 1.75}
                  aria-hidden="true"
                />
                {badge > 0 && (
                  <span
                    key={badge}
                    aria-hidden="true"
                    className="absolute -top-1 grid min-w-[18px] place-items-center rounded-full bg-app-ocean px-1 text-[11px] font-bold leading-[18px] text-white motion-safe:animate-pop end-0.5"
                  >
                    {badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
