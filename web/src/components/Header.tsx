import { BedDouble, Heart, ShoppingBag, User as UserIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SectionId } from '@/types';

interface HeaderProps {
  active: SectionId;
  cartCount: number;
  wishlistCount: number;
  onNavigate: (section: SectionId) => void;
}

const NAV: { id: SectionId; label: string; Icon: typeof BedDouble }[] = [
  { id: 'shop', label: 'المتجر', Icon: BedDouble },
  { id: 'wishlist', label: 'المفضلة', Icon: Heart },
  { id: 'cart', label: 'السلة', Icon: ShoppingBag },
  { id: 'auth', label: 'حسابي', Icon: UserIcon },
];

export function Header({ active, cartCount, wishlistCount, onNavigate }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-[72px] flex-wrap items-center justify-between gap-4">
        <span className="font-heading text-2xl font-bold tracking-[0.08em] text-primary">
          BRIMATEX
        </span>

        <nav className="flex flex-wrap gap-1" aria-label="التنقل الرئيسي">
          {NAV.map(({ id, label, Icon }) => {
            // Sub-pages have no tab of their own — highlight the tab they came from.
            const current = active === 'product' ? 'shop' : active === 'orders' ? 'auth' : active;
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
                  {id === 'cart' && <span className="tabular"> ({cartCount})</span>}
                  {id === 'wishlist' && wishlistCount > 0 && (
                    <span className="tabular"> ({wishlistCount})</span>
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
