import type { ButtonHTMLAttributes, ReactNode, SVGProps } from 'react';

import { cn, formatPrice } from '@/lib/utils';

import type { Channel, OrderStatus, Section, StaffRole } from './api';

/*
 * The panel's look (design/brimatex-admin, AdminHome / AdminOrders): light
 * only, white cards on #F5F6FA, hairlines #E4E6EE, Dark Ocean #282868.
 * The values are the prototypes'; shared here so every screen uses the same.
 */

/* ---------------------------------------------------------------- icons */

const ICON_PATHS = {
  home: <path d="M4 11.5L12 5l8 6.5M6 10v9.5h4.5v-5h3v5H18V10" />,
  box: <path d="M4 7.5L12 4l8 3.5v9L12 20l-8-3.5zM4 7.5l8 3.5 8-3.5M12 11v9" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15l5-4 4 3 3-2 6 4" />
      <circle cx="15.5" cy="9" r="1.5" />
    </>
  ),
  bell: <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15zM10 20.5h4" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 014.8.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01" />
    </>
  ),
  bed: <path d="M3 18v-6.5A2.5 2.5 0 015.5 9h13a2.5 2.5 0 012.5 2.5V18M3 15h18M6 9V6.5h4.5V9" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  external: <path d="M14 5h5v5M19 5l-8 8M10 6H6a1 1 0 00-1 1v11a1 1 0 001 1h11a1 1 0 001-1v-4" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l4.5 4.5L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </>
  ),
  star: <path d="M12 4l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 15.9l-4.6 2.4.9-5.2-3.8-3.6 5.2-.7z" />,
  warning: <path d="M12 4l9 15H3zM12 10v4M12 17h.01" />,
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  chevron: <path d="M15 6l-6 6 6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: <path d="M10 5H6a1 1 0 00-1 1v12a1 1 0 001 1h4M14 8l-4 4 4 4M10 12h10" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5a6.5 6.5 0 0113 0M16 5.2a3.5 3.5 0 010 6.6M18 13.6a6.5 6.5 0 013.5 5.9" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 20, className, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('shrink-0', className)}
      {...rest}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export const SECTION_META: Record<Section, { label: string; icon: IconName; subtitle: string }> = {
  overview: { label: 'نظرة عامة', icon: 'home', subtitle: 'كل الأرقام من أودو مباشرة' },
  orders: { label: 'الطلبات', icon: 'box', subtitle: 'طلبات التطبيقين والموقع، من أودو مباشرة' },
  home: { label: 'الواجهة والبانرات', icon: 'image', subtitle: 'ما يظهر في الرئيسية في التطبيقين والموقع' },
  push: { label: 'الإشعارات', icon: 'bell', subtitle: 'إشعارات العروض للتطبيقين عبر Firebase' },
  quiz: { label: 'ساعدني أختار', icon: 'help', subtitle: 'قواعد الاقتراح في التطبيقين والموقع' },
  products: { label: 'المراتب', icon: 'bed', subtitle: 'محتوى المراتب في التطبيق والموقع' },
  settings: { label: 'الإعدادات', icon: 'gear', subtitle: 'إعدادات التطبيقين والموقع' },
};

export const ROLE_LABEL: Record<StaffRole | 'customer', string> = {
  admin: 'مدير',
  marketing: 'تسويق',
  support: 'خدمة العملاء',
  customer: 'عميل',
};

/* ---------------------------------------------------------------- blocks */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-2xl border border-[#E4E6EE] bg-white p-[22px]', className)}>{children}</section>;
}

export function CardHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold">{title}</h2>
      {aside}
    </div>
  );
}

export type Tone = 'amber' | 'ocean' | 'blue' | 'teal' | 'green' | 'red' | 'grey';

const TONES: Record<Tone, string> = {
  amber: 'bg-[#FFF4D6] text-[#7A5300]',
  ocean: 'bg-[#EEF0FA] text-dark-ocean',
  blue: 'bg-[#E6F0FF] text-[#1F4FA8]',
  teal: 'bg-[#E2F4F6] text-[#0E5E68]',
  green: 'bg-[#E3F5E6] text-[#1E6B2E]',
  red: 'bg-[#FDE8E8] text-[#A12020]',
  grey: 'bg-[#F4F4F6] text-[#3B3E4C]',
};

export function toneClass(tone: Tone) {
  return TONES[tone];
}

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold', TONES[tone], className)}>
      {children}
    </span>
  );
}

export const STATUS_META: Record<OrderStatus, { label: string; tone: Tone }> = {
  new: { label: 'جديد', tone: 'amber' },
  confirmed: { label: 'مؤكد', tone: 'blue' },
  preparing: { label: 'قيد التجهيز', tone: 'ocean' },
  out: { label: 'خرج للتوصيل', tone: 'teal' },
  delivered: { label: 'تم التسليم', tone: 'green' },
  cancelled: { label: 'ملغي', tone: 'red' },
};

export const CHANNEL_META: Record<Channel, { pill: string; row: string; icon: IconName }> = {
  ios: { pill: 'iOS', row: 'تطبيق iOS', icon: 'phone' },
  android: { pill: 'أندرويد', row: 'تطبيق أندرويد', icon: 'phone' },
  app: { pill: 'التطبيق', row: 'التطبيق', icon: 'phone' },
  web: { pill: 'الموقع', row: 'الموقع', icon: 'monitor' },
};

type ButtonVariant = 'primary' | 'outline';

export function buttonClass(variant: ButtonVariant = 'primary', size: 'md' | 'sm' = 'md') {
  return cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-ocean/40 disabled:pointer-events-none disabled:opacity-50',
    size === 'md' ? 'h-[42px] px-[18px] text-[14.5px]' : 'h-9 px-3.5 text-[13.5px]',
    variant === 'primary' ? 'bg-dark-ocean text-white hover:bg-[#1d1d4d]' : 'bg-white text-[#16161F] shadow-[inset_0_0_0_1px_#E4E6EE] hover:bg-[#F5F6FA]'
  );
}

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'sm' }) {
  return <button type="button" className={cn(buttonClass(variant, size), className)} {...rest} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded-lg bg-[#EDEEF3]', className)} />;
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3">
      <p className="flex items-center gap-2 text-[14.5px] text-[#A12020]">
        <Icon name="warning" size={18} />
        {message}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </Card>
  );
}

/* ---------------------------------------------------------------- words */

export function money(value: number): string {
  return `${formatPrice(value)} د.ل`;
}

/** 0912345678 → «091 234 5678» (left to right, inside a <bdi dir="ltr">). */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return /^09\d{8}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : phone;
}

/** Arabic counting for a noun: [one, two, few (3-10), many (11+)]. */
export function counted(n: number, forms: [string, string, string, string]): string {
  if (n === 1) return forms[0];
  if (n === 2) return forms[1];
  if (n >= 3 && n <= 10) return `${n} ${forms[2]}`;
  return `${n} ${forms[3]}`;
}

/** How long ago, in words: «ساعتين»، «5 دقائق»، «3 أيام». */
export function since(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return counted(minutes, ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة']);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return counted(hours, ['ساعة', 'ساعتين', 'ساعات', 'ساعة']);
  const days = Math.floor(hours / 24);
  return counted(days, ['يوم', 'يومين', 'أيام', 'يوماً']);
}

export function ordersCount(n: number): string {
  return counted(n, ['طلب واحد', 'طلبان', 'طلبات', 'طلباً']);
}
