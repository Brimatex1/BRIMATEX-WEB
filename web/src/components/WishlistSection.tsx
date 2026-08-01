import { Heart } from 'lucide-react';

import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Product, User } from '@/types';

interface WishlistSectionProps {
  user: User | null;
  products: Product[];
  savedIds: number[];
  wishlistPending: number | null;
  justAddedId: number | null;
  onAdd: (product: Product) => void;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onGoToAuth: () => void;
  onContinueShopping: () => void;
}

export function WishlistSection({
  user,
  products,
  savedIds,
  wishlistPending,
  justAddedId,
  onAdd,
  onOpen,
  onToggleWishlist,
  onGoToAuth,
  onContinueShopping,
}: WishlistSectionProps) {
  if (!user) {
    return (
      <section className="container max-w-2xl animate-fade-up py-12">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <Heart className="size-7" aria-hidden="true" />
            </div>
            <h1 className="mb-3 font-heading text-2xl font-semibold text-primary">المفضلة</h1>
            <p className="mb-6 text-muted-foreground">
              سجّل الدخول لحفظ منتجاتك المفضلة والوصول إليها من أي جهاز.
            </p>
            <Button onClick={onGoToAuth}>تسجيل الدخول</Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const saved = products.filter((p) => savedIds.includes(p.id));

  return (
    <section className="container animate-fade-up">
      <div className="pt-12 pb-6">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-primary">
          المفضلة
        </h1>
        <p className="mt-3 text-muted-foreground">
          {saved.length > 0
            ? `${saved.length} منتج محفوظ في قائمتك.`
            : 'لم تحفظ أي منتج بعد.'}
        </p>
      </div>

      {saved.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="mb-6 text-muted-foreground">
              اضغط على أيقونة القلب في أي منتج لحفظه هنا.
            </p>
            <Button onClick={onContinueShopping}>تصفّح المنتجات</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8 pb-12 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              justAdded={justAddedId === product.id}
              saved
              wishlistPending={wishlistPending === product.id}
              onAdd={onAdd}
              onOpen={onOpen}
              onToggleWishlist={onToggleWishlist}
            />
          ))}
        </div>
      )}
    </section>
  );
}
