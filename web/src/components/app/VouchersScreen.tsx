import { useState } from 'react';
import { Check, ChevronLeft, Star, Ticket } from 'lucide-react';

import { REWARD_ICONS, VoucherCard } from '@/components/app/perks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Perks, User } from '@/types';

interface VouchersScreenProps {
  user: User | null;
  perks: Perks | null;
  onGoToPoints: () => void;
  onGoToAuth: () => void;
}

/**
 * Vouchers - the iOS app's VouchersScreen: the points balance as a link to the
 * points page, then two tabs, the vouchers earned and the progress towards
 * each reward. Everything comes from the server, so it matches the app exactly.
 */
export function VouchersScreen({ user, perks, onGoToPoints, onGoToAuth }: VouchersScreenProps) {
  const [tab, setTab] = useState<'active' | 'progress'>('active');

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-muted">
            <Ticket className="size-7 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">سجّل الدخول لتجمع المكافآت وقسائم الخصم</p>
          <Button className="mt-2" onClick={onGoToAuth}>
            تسجيل الدخول
          </Button>
        </Card>
      </div>
    );
  }

  const loading = <p className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">القسائم</h1>
        <p className="text-sm text-muted-foreground">قسائم الخصم التي حصلت عليها، وتقدّمك نحو المكافآت القادمة.</p>
      </div>

      {/* The balance, one tap from the points page */}
      <button
        type="button"
        onClick={onGoToPoints}
        className="mb-6 flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-start shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Star className="size-5 fill-current" aria-hidden="true" />
        </span>
        <span className="flex-1 text-sm font-semibold">
          {perks?.points.balance ?? 0} نقطة · نقطة عن كل دينار
        </span>
        <ChevronLeft className="size-5 text-muted-foreground" aria-hidden="true" />
      </button>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'progress')} dir="rtl">
        <TabsList className="grid w-full grid-cols-2 sm:inline-grid sm:w-auto">
          <TabsTrigger value="active">القسائم الفعّالة</TabsTrigger>
          <TabsTrigger value="progress">التقدّم</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {!perks ? (
            loading
          ) : perks.vouchers.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-12 text-center">
              <Ticket className="size-10 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                لا قسائم بعد — أكمل مكافأة من تبويب «التقدّم» لتحصل على قسيمة خصم.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {perks.vouchers.map((v) => (
                <VoucherCard key={v.code} voucher={v} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="progress" className="mt-4">
          {!perks ? (
            loading
          ) : (
            <Card>
              <ul className="divide-y">
                {perks.progress.map((r) => {
                  const Icon = REWARD_ICONS[r.icon] ?? Ticket;
                  return (
                    <li key={r.key} className="flex gap-4 p-5">
                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-md',
                          r.complete ? 'bg-success/10 text-success' : 'bg-muted text-primary'
                        )}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{r.title}</p>
                          {r.complete && (
                            <Badge variant="success" className="shrink-0 gap-1">
                              <Check className="size-3" aria-hidden="true" />
                              مكتملة
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{r.body}</p>
                        <div className="mt-3 flex items-center gap-3">
                          {/* Radix fills from the left; mirrored so the bar grows from the start side */}
                          <Progress
                            value={Math.max(0, Math.min(1, r.ratio)) * 100}
                            className="h-2"
                            aria-label={r.title}
                          />
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {r.value} / {r.target}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
