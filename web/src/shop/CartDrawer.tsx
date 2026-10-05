import { CheckCircle2, ShoppingBasket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

import { displayName, featuredVariant, lineParts, tierOf } from './catalog';
import { photoOf } from './ProductCard';
import { Link, useRouter } from './router';
import { lineItem, useShop } from './state';
import { MaintenanceNote, Price, SizeText } from './ui';

/** «3 منتجات» */
export function itemsText(n: number): string {
  if (n === 1) return 'منتج واحد';
  if (n === 2) return 'منتجان';
  return n <= 10 ? `${n} منتجات` : `${n} منتجاً`;
}

/**
 * أُضيفت إلى السلة (handoff WebCartDrawer): from the left after «أضف إلى
 * السلة» - the line added, the cart's total, «إتمام الطلب», «عرض السلة»,
 * «متابعة التسوّق», and two mattresses from the same tier. From the header's
 * basket it shows the same, without the «added» line.
 */
export function CartDrawer() {
  const shop = useShop();
  const { go } = useRouter();
  const { open, addedId } = shop.cartDrawer;
  const added = addedId ? lineItem(shop.find, addedId) : null;
  const addedLine = addedId ? shop.cart.lines.find((l) => l.id === addedId) : undefined;
  const tier = added?.product ? tierOf(added.product) : null;
  const suggestions = shop.products.filter((p) => p.id !== added?.product?.id && (!tier || tierOf(p) === tier)).slice(0, 2);
  const close = () => shop.setCartDrawerOpen(false);

  return (
    <Sheet open={open} onOpenChange={shop.setCartDrawerOpen}>
      <SheetContent side="left" className="flex w-full flex-col gap-5 overflow-y-auto p-6 pt-6 sm:max-w-[520px] sm:p-8">
        <SheetTitle className="flex items-center gap-2 text-lg font-bold">
          {added?.product ? <CheckCircle2 className="size-6 text-success" aria-hidden /> : <ShoppingBasket className="size-6" aria-hidden />}
          {added?.product ? 'أُضيفت إلى السلة' : 'السلة'}
        </SheetTitle>
        <SheetDescription className="sr-only">ملخّص السلة</SheetDescription>

        {added?.product && addedLine ? (
          <div className="flex items-center gap-4 border-y border-border py-4">
            <img src={photoOf(added.product, 80)} alt="" className="size-20 shrink-0 bg-image-bg object-cover" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <b className="text-[15px]">{displayName(added.product)}</b>
              <LinePartsText variant={added.variant} />
            </div>
            <Price amount={addedLine.price} size="row" />
          </div>
        ) : null}

        {shop.cart.count === 0 ? (
          <p className="py-6 text-center text-muted-foreground">سلتك فارغة.</p>
        ) : (
          <div className="flex items-center justify-between text-[15px]">
            <span>السلة ({itemsText(shop.cart.count)})</span>
            <Price amount={shop.cart.total} size="row" />
          </div>
        )}

        <div className="flex flex-col gap-3">
          {shop.cart.count > 0 ? (
            <Button
              size="store"
              disabled={Boolean(shop.maintenance)}
              onClick={() => {
                close();
                shop.requireLogin('checkout', () => go({ name: 'checkout' }));
              }}
            >
              إتمام الطلب
            </Button>
          ) : null}
          {shop.cart.count > 0 && shop.maintenance ? <MaintenanceNote message={shop.maintenance} /> : null}
          <Button asChild variant="outline" size="store">
            <Link to={{ name: 'cart' }} onClick={close}>
              عرض السلة
            </Link>
          </Button>
          <button type="button" className="self-center py-2 text-sm font-bold underline underline-offset-4" onClick={close}>
            متابعة التسوّق
          </button>
        </div>

        {suggestions.length ? (
          <div className="mt-2 flex flex-col gap-3">
            <b>قد تحتاج أيضاً</b>
            <div className="grid grid-cols-2 gap-4">
              {suggestions.map((p) => (
                <Link key={p.id} to={{ name: 'product', id: p.id }} onClick={close} className="flex flex-col gap-2">
                  <img src={photoOf(p, 140)} alt="" className="aspect-square w-full bg-image-bg object-cover" />
                  <b className="text-[15px]">{displayName(p)}</b>
                  <Price amount={featuredVariant(p).price} size="row" />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** «180×200 سم · ارتفاع 28 سم» */
export function LinePartsText({ variant, extra }: { variant?: Parameters<typeof lineParts>[0]; extra?: string }) {
  const { size, height } = lineParts(variant);
  return (
    <span className="text-[13px] text-muted-foreground">
      {size ? (
        <>
          <SizeText>{size}</SizeText> سم
        </>
      ) : null}
      {height ? ` · ارتفاع ${height} سم` : ''}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}
