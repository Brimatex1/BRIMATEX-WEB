import { useEffect, useState } from 'react';
import { Gift, ShoppingBag, Star, Ticket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DEFAULT_RULES,
  REWARD_STEPS,
  bestActiveVoucher,
  formatPoints,
  onOpenLoyalty,
  pointsToNextVoucher,
} from '@/lib/loyalty';
import type { Perks, SectionId, User } from '@/types';

import { discountLabel } from '@/components/app/perks';

/**
 * "How do points and vouchers work?" - three steps, the reward vouchers, and
 * for a signed-in customer their own balance. Opened from the bar at the top,
 * a card's points tag, the product page and the cart (lib/loyalty.ts).
 */
export function LoyaltyDialog({
  user,
  perks,
  onNavigate,
}: {
  user: User | null;
  perks: Perks | null;
  onNavigate: (section: SectionId) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenLoyalty(() => setOpen(true)), []);

  const rules = perks?.points.rules ?? DEFAULT_RULES;
  const balance = perks?.points.balance ?? 0;
  const voucher = bestActiveVoucher(perks?.vouchers);
  const go = (section: SectionId) => {
    setOpen(false);
    onNavigate(section);
  };

  const steps = [
    { Icon: ShoppingBag, title: 'اطلب وأنت مسجّل', body: `كل دينار تدفعه = ${rules.perDinar === 1 ? 'نقطة' : `${rules.perDinar} نقاط`}. تُحسب النقاط حين تستلم طلبك وتدفع.` },
    { Icon: Star, title: 'اجمع نقاطك', body: `كل ${formatPoints(rules.stepPoints)} نقطة = قسيمة خصم ${rules.stepValue} د.ل، صالحة ${rules.validDays} يوماً.` },
    { Icon: Ticket, title: 'استعملها في طلبك القادم', body: 'اختر القسيمة عند إتمام الطلب، ويُخصم المبلغ من الإجمالي.' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2">
            <Gift className="size-5 text-primary" aria-hidden="true" />
            نقاط وقسائم بريماتكس
          </DialogTitle>
          <DialogDescription>كل طلب يقرّبك من خصم على طلبك القادم.</DialogDescription>
        </DialogHeader>

        {/* A signed-in customer's own standing first */}
        {user && perks && (
          <div className="rounded-lg bg-secondary/50 p-4">
            <p className="text-sm text-muted-foreground">رصيدك</p>
            <p className="text-2xl font-bold text-primary">{formatPoints(balance)} نقطة</p>
            <p className="mt-1 text-sm">
              {voucher
                ? `عندك ${discountLabel(voucher)} جاهز للاستعمال.`
                : pointsToNextVoucher(balance, rules) === 0
                  ? `تكفي لقسيمة ${rules.stepValue} د.ل - بدّلها من صفحة نقاطي.`
                  : `باقي ${formatPoints(pointsToNextVoucher(balance, rules))} نقطة على قسيمة ${rules.stepValue} د.ل.`}
            </p>
          </div>
        )}

        <ol className="space-y-3">
          {steps.map(({ Icon, title, body }, i) => (
            <li key={title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">
                  {i + 1}. {title}
                </p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          <p className="text-sm font-semibold">وقسائم مكافأة أيضاً</p>
          <ul className="grid grid-cols-2 gap-2">
            {REWARD_STEPS.map((r) => (
              <li key={r.when} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                <span className="text-muted-foreground">{r.when}</span>
                <span className="shrink-0 font-bold text-primary">{r.discount}</span>
              </li>
            ))}
          </ul>
        </div>

        {user ? (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => go('points')}>
              نقاطي
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => go('vouchers')}>
              قسائمي
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button className="w-full" onClick={() => go('auth')}>
              سجّل الآن وابدأ بجمع النقاط
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              الطلبات بدون حساب لا تُحسب لها نقاط.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
