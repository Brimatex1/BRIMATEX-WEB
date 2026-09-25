import { Facebook, Instagram } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The store's social profiles. Instagram and TikTok have no address yet; a
 * link to "#" goes nowhere, so a profile shows only once its address is set
 * here.
 */
const LINKS: { href: string; label: string; Icon: (props: { className?: string }) => JSX.Element }[] = [
  {
    href: 'https://www.facebook.com/profile.php?id=100083078093248',
    label: 'بريماتكس على فيسبوك',
    Icon: ({ className }) => <Facebook className={className} aria-hidden="true" />,
  },
  { href: '', label: 'بريماتكس على إنستقرام', Icon: ({ className }) => <Instagram className={className} aria-hidden="true" /> },
  { href: '', label: 'بريماتكس على تيك توك', Icon: TikTokIcon },
];

interface SocialLinksProps {
  className?: string;
}

export function SocialLinks({ className }: SocialLinksProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {LINKS.filter((l) => l.href).map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="grid size-9 place-items-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Icon className="size-[18px]" />
        </a>
      ))}
    </div>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 448 512" fill="currentColor" className={className} aria-hidden="true" focusable="false">
      <path d="M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z" />
    </svg>
  );
}
