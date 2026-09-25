import { useState } from 'react';
import { Star, Ticket } from 'lucide-react';
import { toast } from 'sonner';

import { discountLabel } from '@/components/app/perks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-muted">
            <Star className="size-7 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            سجّل الدخول لجمع النقاط — نقطة عن كل دينار تدفعه، وكل 250 نقطة = 5 د.ل خصم
          </p>
          <Button className="mt-2" onClick={onGoToAuth}>
            تسجيل الدخول
          </Button>
        </Card>
      </div>
    );
  }
  if (!perks) return <p className="py-16 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;

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

  const dateOf = (at: string) => new Date(at).toLocaleDateString('ar-LY');
  const pointsText = (n: number) => `${n > 0 ? '+' : ''}${n}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">نقاطي</h1>
        <p className="text-sm text-muted-foreground">
          نقطة عن كل دينار تدفعه، وكل {rules.stepPoints} نقطة = {rules.stepValue} د.ل خصم.
        </p>
      </div>

      {/* ── Summary: balance, what it buys, the redeem action, the totals ── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardDescription>رصيدك</CardDescription>
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight tabular-nums">{balance}</span>
              <span className="text-sm text-muted-foreground">نقطة</span>
            </p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Star className="size-6 fill-current" aria-hidden="true" />
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {steps > 0
              ? `تستطيع استبدال ${steps * rules.stepPoints} نقطة بخصم ${steps * rules.stepValue} د.ل`
              : `بقي ${toNext} نقطة على أول استبدال (${rules.stepValue} د.ل)`}
          </p>
          <Button
            variant="accent"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => setPicking((v) => !v)}
            disabled={steps === 0}
            aria-expanded={picking}
          >
            <Ticket aria-hidden="true" />
            استبدل نقاطك
          </Button>

          {picking && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-3 text-sm">
                كل {rules.stepPoints} نقطة تساوي {rules.stepValue} د.ل خصماً على طلبك القادم. اختر كم نقطة تستبدل:
              </p>
              <div className="flex flex-wrap gap-2">
                {options.map((n) => (
                  <Button
                    key={n}
                    variant="outline"
                    size="sm"
                    onClick={() => void redeem(n)}
                    disabled={busy !== null}
                  >
                    {busy === n ? '…' : `${n} نقطة ← ${(n / rules.stepPoints) * rules.stepValue} د.ل`}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              ['مكتسبة', earned],
              ['معلّقة', pending],
              ['مستبدَلة', perks.points.redeemed],
            ].map(([label, value]) => (
              // dt before dd for the markup; flex-col-reverse shows the number on top
              <div key={label} className="flex flex-col-reverse rounded-md bg-muted py-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {pending > 0 && (
            <p className="text-sm text-muted-foreground">النقاط المعلّقة تُضاف لرصيدك عند دفع طلباتها.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Ledger: a table on larger screens, a divided list on phones ── */}
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">السجل</CardTitle>
          <Button variant="outline" size="sm" onClick={onGoToVouchers}>
            القسائم
          </Button>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">أول طلب مدفوع يُضيف نقاطه هنا — نقطة عن كل دينار.</p>
          ) : (
            <>
              <ul className="divide-y md:hidden">
                {ledger.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-md',
                        e.points < 0 ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                      )}
                    >
                      {e.points < 0 ? (
                        <Ticket className="size-4" aria-hidden="true" />
                      ) : (
                        <Star className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.label}</p>
                      <p className="text-xs text-muted-foreground">{dateOf(e.at)}</p>
                    </div>
                    <p
                      className={cn('font-bold tabular-nums', e.points < 0 ? 'text-foreground' : 'text-success')}
                      dir="ltr"
                    >
                      {pointsText(e.points)}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead className="text-end">النقاط</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{dateOf(e.at)}</TableCell>
                        <TableCell>{e.label}</TableCell>
                        <TableCell
                          className={cn('text-end font-bold tabular-nums', e.points < 0 ? 'text-foreground' : 'text-success')}
                        >
                          <span dir="ltr">{pointsText(e.points)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
