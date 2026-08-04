import { Facebook, Instagram } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Store's social profiles. Instagram and TikTok are still placeholders
 * until those links are provided.
 */
const LINKS = {
  facebook: 'https://www.facebook.com/profile.php?id=100083078093248',
  instagram: '#',
  tiktok: '#',
};

interface SocialLinksProps {
  className?: string;
}

export function SocialLinks({ className }: SocialLinksProps) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <a
        href={LINKS.facebook}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="بريماتكس على فيسبوك"
        className="text-primary-foreground/70 transition-colors hover:text-primary-foreground"
      >
        <Facebook className="size-5" aria-hidden="true" />
      </a>
      <a
        href={LINKS.instagram}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="بريماتكس على إنستقرام"
        className="text-primary-foreground/70 transition-colors hover:text-primary-foreground"
      >
        <Instagram className="size-5" aria-hidden="true" />
      </a>
      <a
        href={LINKS.tiktok}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="بريماتكس على تيك توك"
        className="text-primary-foreground/70 transition-colors hover:text-primary-foreground"
      >
        <TikTokIcon className="size-5" />
      </a>
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
