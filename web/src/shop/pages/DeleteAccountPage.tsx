import { useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useTitle } from '../hooks';
import { Link, useRouter } from '../router';
import { useShop } from '../state';
import { Container } from '../ui';
import { Breadcrumb } from './CategoryPage';

/** What deleting removes and what stays - the same words as the app's. */
const FACTS = [
  'الحذف نهائي ولا يمكن التراجع عنه، ويتم فوراً.',
  'تُحذف بياناتك وعناوينك والمفضّلة وتقييماتك، ويُلغى رصيد نقاط الولاء.',
  'يُزال اسمك ورقمك وعنوانك من سجلات طلباتك في الموقع.',
  'الفواتير التي يُلزمنا القانون بحفظها تبقى في نظام الشركة المحاسبي.',
  'الطلب الجاري يُكمَل أو يُلغى حسب حالته.',
];

/** ٠١٢… typed on an Arabic keyboard become 012…. */
const latinDigits = (t: string) => t.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * brimatex.ly/delete-account - deleting a Brimatex account without the app
 * (Google Play's data deletion requirement; the app and «حسابي» lead here too).
 * The phone number and password, then the same deletion the app calls. An
 * account that never set a password sets one with «نسيت كلمة المرور» first.
 */
export function DeleteAccountPage() {
  useTitle('حذف الحساب');
  const shop = useShop();
  const { go } = useRouter();
  const [phone, setPhone] = useState(shop.auth.user?.phone ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!phone || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Signed in already with this number: that session; otherwise sign in first.
      const signedIn = shop.auth.token && shop.auth.user?.phone === phone;
      const token = signedIn ? shop.auth.token! : (await api.login(phone, password)).token;
      await api.deleteAccount(token, { password });
      shop.auth.signOut();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حذف الحساب');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="pb-16 lg:pb-24">
      <Breadcrumb items={[{ label: 'حذف الحساب' }]} />
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold lg:text-3xl">حذف حسابك في بريماتكس</h1>
        {done ? (
          <div role="status" className="mt-6 space-y-4">
            <p className="text-[15px] leading-relaxed">حُذف حسابك نهائياً. شكراً لك على ثقتك ببريماتكس.</p>
            <Button size="store" onClick={() => go({ name: 'home' })}>
              العودة إلى المتجر
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">يمكنك حذف حسابك من هنا دون التطبيق. قبل المتابعة:</p>
            <ul className="mt-4 space-y-2.5">
              {FACTS.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
                  <TriangleAlert aria-hidden className="mt-1 size-4 shrink-0 text-destructive" />
                  {f}
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                placeholder="09X XXX XXXX"
                aria-label="رقم الهاتف"
                value={phone}
                onChange={(e) => setPhone(latinDigits(e.target.value).replace(/\D/g, '').slice(0, 10))}
              />
              <Input type="password" autoComplete="current-password" placeholder="كلمة المرور" aria-label="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" variant="destructive" size="store" className="w-full" loading={busy} disabled={!phone || !password}>
                حذف الحساب نهائياً
              </Button>
            </form>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              لم تعيّن كلمة مرور، أو نسيتها؟ عيّنها من «نسيت كلمة المرور» عند تسجيل الدخول، ثم عُد إلى هنا. أو راسلنا:{' '}
              <a href="mailto:privacy@brimatex.ly" dir="ltr" className="underline">
                privacy@brimatex.ly
              </a>{' '}
              ·{' '}
              <a href="tel:+218935770070" dir="ltr" className="underline">
                093 577 00 70
              </a>
              . وتفاصيل بياناتك في <Link to={{ name: 'legal', page: 'privacy' }} className="underline">سياسة الخصوصية</Link>.
            </p>
          </>
        )}
      </div>
    </Container>
  );
}
