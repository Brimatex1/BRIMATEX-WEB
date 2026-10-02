import { Heart } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { canOrderVariant, featuredVariant } from '../catalog';
import { useTitle } from '../hooks';
import { ProductCard } from '../ProductCard';
import { useRouter } from '../router';
import { useShop } from '../state';
import { Container, EmptyState } from '../ui';
import { Breadcrumb } from './CategoryPage';

/**
 * المفضّلة (handoff WebFavorites, WebFavoritesGuest): the saved mattresses and
 * «أضف الكل إلى السلة». A guest's are kept in this browser, with a note that
 * signing in carries them to the account (state.tsx merges them).
 */
export function FavoritesPage() {
  const shop = useShop();
  const { go } = useRouter();
  useTitle('المفضّلة');
  const saved = shop.favorites.ids.map((id) => shop.products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const guest = !shop.auth.user;

  function addAll() {
    let last: (typeof saved)[number] | null = null;
    for (const p of saved) {
      const v = featuredVariant(p);
      if (!canOrderVariant(v)) continue;
      shop.addToCart(p, v);
      last = p;
    }
    if (!last) go({ name: 'cart' });
  }

  return (
    <Container className="pb-16">
      <Breadcrumb items={[{ label: 'المفضّلة' }]} />
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
        <h1 className="font-display text-[28px] font-bold lg:text-[40px]">المفضّلة</h1>
        {saved.length > 1 ? (
          <Button size="store" onClick={addAll}>
            أضف الكل إلى السلة
          </Button>
        ) : null}
      </div>

      {guest && saved.length ? (
        <div className="mb-8 flex flex-col items-start gap-4 bg-image-bg p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Heart className="mt-0.5 size-5 shrink-0 fill-dark-ocean text-dark-ocean dark:fill-blue-violet dark:text-blue-violet" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <b className="text-[15px]">المفضّلة محفوظة على هذا المتصفح</b>
              <span className="text-sm text-muted-foreground">سجّل الدخول لتبقى معك على كل أجهزتك. ما حفظته الآن ينتقل إلى حسابك تلقائياً.</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-10 px-5" onClick={() => shop.requireLogin('account')}>
            تسجيل الدخول
          </Button>
        </div>
      ) : null}

      {saved.length ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
          {saved.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Heart />} title="قائمة المفضّلة فارغة" body="اضغط على القلب في أي مرتبة لحفظها هنا والرجوع إليها لاحقاً." action="تصفّح المراتب" onAction={() => go({ name: 'category', tier: null })} />
      )}
    </Container>
  );
}
