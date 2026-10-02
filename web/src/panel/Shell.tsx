import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { BrimatexLogo } from '@/components/BrimatexLogo';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import type { PanelMe, Section } from './api';
import { Link, navigate, sectionHref } from './router';
import { Icon, ROLE_LABEL, SECTION_META } from './ui';

/**
 * The panel's frame (AdminHome / AdminOrders): the sidebar on the right
 * (256px) with the sections this role may open, «افتح أودو» and who is
 * signed in; each page brings its own top bar (PageHeader). Under 1024px the
 * sidebar folds into a drawer behind a menu button.
 */
export function Shell({ me, current, onSignOut, children }: { me: PanelMe; current: Section; onSignOut: () => void; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // A section opened from the drawer closes it.
  useEffect(() => setMenuOpen(false), [current]);

  const sidebar = <SidebarBody me={me} current={current} onSignOut={onSignOut} />;
  return (
    <div dir="rtl" className="min-h-[100svh] bg-[#F5F6FA] font-sans text-[#16161F]">
      <aside className="fixed inset-y-0 right-0 hidden w-64 flex-col gap-[22px] border-l border-[#E4E6EE] bg-white px-4 py-[22px] lg:flex">{sidebar}</aside>

      {/* Phones and tablets: the logo and a menu button over the page. */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E4E6EE] bg-white px-4 lg:hidden">
        <span className="flex items-center gap-2">
          <BrimatexLogo className="h-8 w-auto text-dark-ocean" />
          <AdminTag />
        </span>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="grid size-10 place-items-center rounded-[10px] text-[#3B3E4C] hover:bg-[#F5F6FA]"
          aria-label="القائمة"
        >
          <Icon name="menu" size={22} />
        </button>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="flex w-[280px] flex-col gap-[22px] bg-white px-4 pb-[22px] pt-14 font-sans text-[#16161F]">
          <SheetTitle className="sr-only">أقسام الإدارة</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <main className="lg:mr-64">{children}</main>
    </div>
  );
}

function AdminTag() {
  return <span className="rounded-md bg-[#F5F6FA] px-2 py-[3px] text-xs font-bold text-[#5F6373]">الإدارة</span>;
}

function SidebarBody({ me, current, onSignOut }: { me: PanelMe; current: Section; onSignOut: () => void }) {
  const initial = (me.user.name.trim()[0] || 'م').toUpperCase();
  return (
    <>
      <div className="flex items-center justify-between px-1.5">
        <Link href={sectionHref(me.sections[0])} aria-label="بريماتكس">
          <BrimatexLogo className="h-12 w-[118px] text-dark-ocean" title={null} />
        </Link>
        <AdminTag />
      </div>

      <nav className="flex flex-col gap-1" aria-label="أقسام الإدارة">
        {me.sections.map((s) => {
          const meta = SECTION_META[s];
          const active = s === current;
          const badge = s === 'orders' ? me.badges.orders : null;
          return (
            <Link
              key={s}
              href={sectionHref(s)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-[10px] px-3 text-[14.5px] no-underline transition-colors',
                active ? 'bg-[#EEF0FA] font-bold text-dark-ocean' : 'font-medium text-[#3B3E4C] hover:bg-[#F5F6FA]'
              )}
            >
              <Icon name={meta.icon} />
              <span className="flex-1">{meta.label}</span>
              {badge ? (
                <span className="inline-flex h-[26px] items-center rounded-full bg-[#FFF4D6] px-2.5 text-[12.5px] font-semibold text-[#7A5300]" aria-label={`${badge} بانتظار التأكيد`}>
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5">
        {me.odooUrl ? (
          <a
            href={me.odooUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm font-semibold text-[#16161F] no-underline shadow-[inset_0_0_0_1px_#E4E6EE] hover:bg-[#F5F6FA]"
          >
            <Icon name="external" size={18} />
            افتح أودو
          </a>
        ) : null}
        <div className="flex items-center gap-2.5 p-1.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#9dc9cf] font-bold text-dark-ocean" aria-hidden>
            {initial}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-sm">{me.user.name || me.user.phone}</b>
            <span className="text-xs text-[#5F6373]">{ROLE_LABEL[me.role]}</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="grid size-9 place-items-center rounded-[10px] text-[#5F6373] hover:bg-[#F5F6FA] hover:text-[#16161F]"
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * A page's top bar: its title and line, the search (orders, customers,
 * mattresses - it opens الطلبات), and the page's main action.
 */
export function PageHeader({
  section,
  me,
  action,
  search,
}: {
  section: Section;
  me: PanelMe;
  action?: ReactNode;
  /** The orders page keeps the search in its own query; elsewhere it opens الطلبات. */
  search?: { value: string; onSubmit: (q: string) => void };
}) {
  const meta = SECTION_META[section];
  const canSearch = me.sections.includes('orders');
  const [text, setText] = useState(search?.value ?? '');
  useEffect(() => setText(search?.value ?? ''), [search?.value]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (search) search.onSubmit(q);
    else if (q) navigate(sectionHref('orders', { q, period: 'all' }));
  }

  return (
    <header className="flex flex-col gap-3 border-b border-[#E4E6EE] bg-white px-4 py-4 sm:px-8 lg:h-[76px] lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:py-0">
      <div className="flex flex-col gap-0.5">
        <h1 className="m-0 font-display text-[22px] font-bold">{meta.label}</h1>
        <span className="text-[13px] text-[#5F6373]">{meta.subtitle}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {canSearch ? (
          <form onSubmit={submit} role="search" className="flex h-10 w-full items-center gap-2 rounded-[10px] bg-[#F5F6FA] px-3 sm:w-[300px]">
            <Icon name="search" size={18} className="text-[#5F6373]" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ابحث برقم طلب أو عميل أو مرتبة"
              aria-label="بحث"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#16161F] outline-none placeholder:text-[#5F6373]"
            />
          </form>
        ) : null}
        {action}
      </div>
    </header>
  );
}

/** The space under the top bar. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-[22px] px-4 py-6 sm:px-8 sm:py-7', className)}>{children}</div>;
}
