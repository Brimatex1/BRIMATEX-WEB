import { useState } from 'react';
import { Star, Ticket } from 'lucide-react';
import { toast } from 'sonner';

import { AppCard, EmptyCircle } from '@/components/app/ui';
import { discountLabel } from '@/components/app/perks';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Perks, User } from '@/types';

interface PointsScreenProps {
  user: User | null;
  token: string | null;
  perks: Perks | null;
  onChanged: () => Promise<void>;
  onGoToVouchers: () => void;
  onGoToAuth: () => void;
}

/**
 * Points - the iOS app's PointsScreen: the balance with what it can buy, a
 * way to redeem it into a dinar voucher, and the ledger of earned and spent
 * points. Redemption happens on the server, which re-checks the balance - the
 * same points cannot be spent from the app and the site both.
 */
export function PointsScreen({ user, token, perks, onChanged, onGoToVouchers, onGoToAuth }: PointsScreenProps) {
  const [busy, setBusy] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);

  if (!user || !token) {
    return (
      <div className="mx-auto max-w-3xl px-5 pt-4 md:pt-10">
        <EmptyCircle Icon={Star} text="سجّل الدخول لجمع النقاط — نقطة عن كل دينار تدفعه، وكل 250 نقطة = 5 د.ل خصم">
          <button type="button" onClick={onGoToAuth} className="mt-6 rounded-full bg-app-ocean px-8 py-3.5 text-[17px] font-semibold text-white">
            تسجيل الدخول
          </button>
        </EmptyCircle>
      </div>
    );
  }
  if (!perks) return <p className="py-16 text-center text-app-muted">جارٍ التحميل…</p>;

  const { balance, pending, earned, ledger, rules } = perks.points;
  const steps = Math.floor(balance / rules.stepPoints);
  const options = Array.from({ length: Math.min(steps, 5) }, (_, i) => (i + 1) * rules.stepPoints);
  if (steps > 5) options.push(steps * rules.stepPoints);
  const toNext = rules.stepPoints - (balance % rules.stepPoints);

  async function redeem(points: number) {
    setBusy(points);
    try {
      const { voucher } = await api.redeemPoints(token!, points);
      toast.success(`حصلت على قسيمة ${discountLabel(voucher)} — تجدها في القسائم`);
      setPicking(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الاستبدال');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-12 pt-4 md:px-8 md:pt-10">
      <h2 className="mb-5 text-[28px] font-bold text-app-text">نقاطي</h2>

      <div className="rounded-[20px] bg-app-ocean p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">رصيدك</p>
            <p className="mt-1 text-[40px] font-bold leading-none">{balance}</p>
            <p className="mt-1 text-sm text-white/70">نقطة</p>
          </div>
          <span className="grid size-16 place-items-center rounded-full bg-white/10">
            <Star className="size-[34px] fill-app-sun text-app-sun" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-4 text-sm text-white/85">
          {steps > 0
            ? `تستطيع استبدال ${steps * rules.stepPoints} نقطة بخصم ${steps * rules.stepValue} د.ل`
            : `بقي ${toNext} نقطة على أول استبدال (${rules.stepValue} د.ل)`}
        </p>
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          disabled={steps === 0}
          className="mt-4 w-full rounded-full bg-app-sun py-3.5 text-[17px] font-semibold text-app-ocean disabled:opacity-45"
        >
          استبدل نقاطك
        </button>
      </div>

      {picking && (
        <AppCard className="mt-4">
          <p className="mb-3 text-sm text-app-text">
            كل {rules.stepPoints} نقطة تساوي {rules.stepValue} د.ل خصماً على طلبك القادم. اختر كم نقطة تستبدل:
          </p>
          <div className="flex flex-wrap gap-2">
            {options.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => void redeem(n)}
                disabled={busy !== null}
                className="rounded-full bg-app-tint-soft px-4 py-2.5 text-sm font-semibold text-app-ocean disabled:opacity-50"
              >
                {busy === n ? '…' : `${n} نقطة ← ${(n / rules.stepPoints) * rules.stepValue} د.ل`}
              </button>
            ))}
          </div>
        </AppCard>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ['مكتسبة', earned],
          ['معلّقة', pending],
          ['مستبدَلة', perks.points.redeemed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[14px] bg-app-input py-3">
            <p className="text-xl font-bold text-app-text">{value}</p>
            <p className="text-xs text-app-muted">{label}</p>
          </div>
        ))}
      </div>
      {pending > 0 && (
        <p className="mt-3 text-sm text-app-muted">النقاط المعلّقة تُضاف لرصيدك عند دفع طلباتها.</p>
      )}

      <div className="mb-3 mt-7 flex items-center justify-between">
        <h3 className="text-xl font-bold text-app-ocean">السجل</h3>
        <button type="button" onClick={onGoToVouchers} className="text-base text-app-text">
          القسائم
        </button>
      </div>
      {ledger.length === 0 ? (
        <p className="text-sm text-app-muted">أول طلب مدفوع يُضيف نقاطه هنا — نقطة عن كل دينار.</p>
      ) : (
        ledger.map((e) => (
          <div key={e.id} className="flex items-center gap-3 border-b border-app-divider py-3">
            <span className={cn('grid size-9 place-items-center rounded-full', e.points < 0 ? 'bg-app-tint-soft' : 'bg-app-ocean')}>
              {e.points < 0 ? (
                <Ticket className="size-[18px] text-app-ocean" aria-hidden="true" />
              ) : (
                <Star className="size-[18px] text-white" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base text-app-text">{e.label}</p>
              <p className="text-xs text-app-muted">{new Date(e.at).toLocaleDateString('ar-LY')}</p>
            </div>
            <p className={cn('text-lg font-bold', e.points < 0 ? 'text-app-text' : 'text-app-success')} dir="ltr">
              {e.points > 0 ? '+' : ''}
              {e.points}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
