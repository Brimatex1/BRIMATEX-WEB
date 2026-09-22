import { Heart, Home, LayoutDashboard, ShoppingBag, User as UserIcon } from 'lucide-react';

import { BrimatexLogo } from '@/components/BrimatexLogo';
import { cn } from '@/lib/utils';
import type { SectionId } from '@/types';

interface HeaderProps {
  active: SectionId;
  cartCount: number;
  /** The dashboard tab is appended only for admins. */
  isAdmin: boolean;
  onNavigate: (section: SectionId) => void;
}

/**
 * The top bar on larger screens (phones use components/app/TabBar). Same
 * tabs, icons and colours as the iOS app's tab bar - home, wishlist, cart,
 * account - with a label beside each icon, since there is room for one.
 */
const NAV: { id: SectionId; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'الرئيسية', Icon: Home },
  { id: 'wishlist', label: 'المفضّلة', Icon: Heart },
  { id: 'cart', label: 'السلة', Icon: ShoppingBag },
  { id: 'auth', label: 'حسابي', Icon: UserIcon },
];

/** Screens pushed on top of a tab keep that tab lit, as in the app. */
function tabFor(section: SectionId): SectionId {
  if (section === 'shop' || section === 'product' || section === 'quiz') return 'home';
  if (section === 'orders' || section === 'vouchers' || section === 'points') return 'auth';
  return section;
}

export function Header({ active, cartCount, isAdmin, onNavigate }: HeaderProps) {
  const items = isAdmin
    ? [...NAV, { id: 'admin' as SectionId, label: 'اللوحة', Icon: LayoutDashboard }]
    : NAV;
  const current = tabFor(active);

  return (
    <header className="sticky top-0 z-20 border-b border-app-border bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-4 px-8 py-2">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="بريماتكس لصناعة الإسفنج الصناعي والمراتب — الصفحة الرئيسية"
          className="flex shrink-0 items-center gap-3 rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ocean"
        >
          <BrimatexLogo title={null} className="h-10 w-auto shrink-0 text-app-ocean lg:h-11" />
          {/* Wraps on medium screens instead of pushing the tabs off the row */}
          <span aria-hidden="true" className="max-w-[12rem] text-start text-sm font-bold leading-snug text-app-ocean lg:max-w-none lg:text-base">
            بريماتكس لصناعة الإسفنج الصناعي والمراتب
          </span>
        </button>

        <nav className="flex items-center gap-1" aria-label="التنقل الرئيسي">
          {items.map(({ id, label, Icon }) => {
            const isActive = current === id;
            const badge = id === 'cart' && cartCount > 0 ? cartCount : 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={badge ? `${label} (${badge})` : label}
                className={cn(
                  'relative inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-app-ocean transition-colors lg:px-4',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ocean',
                  isActive ? 'bg-app-tint-soft' : 'hover:bg-app-tint-soft/70'
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn('size-[22px]', isActive && 'fill-current')}
                    strokeWidth={isActive ? 2 : 1.75}
                    aria-hidden="true"
                  />
                  {badge > 0 && (
                    <span
                      key={badge}
                      aria-hidden="true"
                      className="absolute -top-2 grid min-w-[18px] place-items-center rounded-full bg-app-ocean px-1 text-[11px] font-bold leading-[18px] text-white motion-safe:animate-pop -end-2.5"
                    >
                      {badge}
                    </span>
                  )}
                </span>
                {/* Icons alone at md, where the trade name leaves no room for labels */}
                <span aria-hidden="true" className="hidden lg:inline">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
