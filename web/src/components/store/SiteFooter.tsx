import { MapPin, Phone } from 'lucide-react';

import { BrimatexLogo } from '@/components/BrimatexLogo';
import { SocialLinks } from '@/components/SocialLinks';
import { Separator } from '@/components/ui/separator';
import type { SectionId, Tier } from '@/types';

/** The store's footer: who we are, the tiers, help, and how to reach us. */
export function SiteFooter({
  tiers,
  onNavigate,
  onOpenTier,
}: {
  tiers: Tier[];
  onNavigate: (section: SectionId) => void;
  onOpenTier: (key: string) => void;
}) {
  const link = 'text-sm text-muted-foreground transition-colors hover:text-foreground';
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className="space-y-3 md:col-span-2">
          <BrimatexLogo title={null} className="h-12 w-auto text-primary" />
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            بريماتكس لصناعة الإسفنج والمراتب — مراتب من مصنعنا في ليبيا، تصلك لباب بيتك وتدفع عند الاستلام.
          </p>
          <SocialLinks />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">المراتب</h2>
          <ul className="space-y-2">
            <li>
              <button type="button" className={link} onClick={() => onNavigate('shop')}>
                كل المراتب
              </button>
            </li>
            {tiers.map((t) => (
              <li key={t.key}>
                <button type="button" className={link} onClick={() => onOpenTier(t.key)}>
                  مراتب {t.name}
                </button>
              </li>
            ))}
            <li>
              <button type="button" className={link} onClick={() => onNavigate('quiz')}>
                اختبار المرتبة المناسبة
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">تواصل معنا</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" aria-hidden="true" /> طرابلس، ليبيا
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              <a href="tel:+218935770070" dir="ltr" className="hover:text-foreground">
                +218 93 577 0070
              </a>
            </li>
            <li>
              <button type="button" className={link} onClick={() => onNavigate('orders')}>
                تتبّع طلباتي
              </button>
            </li>
            <li>
              <a href="/privacy.html" className={link}>
                سياسة الخصوصية
              </a>
            </li>
          </ul>
        </div>
      </div>
      <Separator />
      <p className="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-muted-foreground md:px-6">
        © 2026 بريماتكس لصناعة الإسفنج الصناعي والمراتب. جميع الحقوق محفوظة.
      </p>
    </footer>
  );
}
