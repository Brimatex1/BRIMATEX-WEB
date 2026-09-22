import { useState } from 'react';
import { ChevronLeft, Star, Ticket } from 'lucide-react';

import { EmptyCircle } from '@/components/app/ui';
import { ProgressRing, VoucherCard } from '@/components/app/perks';
import { cn } from '@/lib/utils';
import type { Perks, User } from '@/types';

interface VouchersScreenProps {
  user: User | null;
  perks: Perks | null;
  onGoToPoints: () => void;
  onGoToAuth: () => void;
}

/**
 * Vouchers - the iOS app's VouchersScreen: two tabs, the vouchers earned and
 * the progress towards each reward, with the points balance on a card between
 * them. Everything comes from the server, so it matches the app exactly.
 */
export function VouchersScreen({ user, perks, onGoToPoints, onGoToAuth }: VouchersScreenProps) {
  const [tab, setTab] = useState<'active' | 'progress'>('active');

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 pt-4 md:pt-10">
        <EmptyCircle Icon={Ticket} text="سجّل الدخول لتجمع المكافآت وقسائم الخصم">
          <button type="button" onClick={onGoToAuth} className="mt-6 rounded-full bg-app-ocean px-8 py-3.5 text-[17px] font-semibold text-white">
            تسجيل الدخول
          </button>
        </EmptyCircle>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-12 pt-4 md:px-8 md:pt-10">
      <h2 className="mb-5 text-[28px] font-bold text-app-text">القسائم</h2>

      <div className="mb-4 flex gap-3" role="tablist">
        {(['active', 'progress'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded-full py-3.5 text-[17px]',
              tab === t ? 'bg-app-tint font-semibold text-app-ocean' : 'bg-app-input text-app-text'
            )}
          >
            {t === 'active' ? 'القسائم الفعّالة' : 'التقدّم'}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onGoToPoints}
        className="mb-6 flex w-full items-center gap-3 rounded-[14px] bg-app-tint-soft p-4 text-start"
      >
        <Star className="size-[22px] fill-app-sun text-app-sun" aria-hidden="true" />
        <span className="flex-1 text-base font-semibold text-app-ocean">
          {perks?.points.balance ?? 0} نقطة · نقطة عن كل دينار
        </span>
        <ChevronLeft className="size-5 text-app-ocean" aria-hidden="true" />
      </button>

      {!perks ? (
        <p className="py-10 text-center text-app-muted">جارٍ التحميل…</p>
      ) : tab === 'active' ? (
        perks.vouchers.length === 0 ? (
          <EmptyCircle Icon={Ticket} text="لا قسائم بعد — أكمل مكافأة من تبويب «التقدّم» لتحصل على قسيمة خصم." />
        ) : (
          perks.vouchers.map((v) => <VoucherCard key={v.code} voucher={v} />)
        )
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
          {perks.progress.map((r) => (
            <div key={r.key} className="flex flex-col items-center text-center">
              <ProgressRing ratio={r.ratio} icon={r.icon} complete={r.complete} />
              <p className="mt-3 text-[17px] font-bold text-app-text">{r.title}</p>
              <p className="mt-1 text-sm leading-[21px] text-app-text">{r.body}</p>
              <p className="mt-1 text-xs text-app-muted">
                {r.value} / {r.target}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
