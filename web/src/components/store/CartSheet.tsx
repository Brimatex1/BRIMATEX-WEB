import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';

import { findProduct, ProductImage } from '@/components/store/ProductCard';
import { PreorderTag } from '@/components/store/PreorderNotice';
import { preorderLines } from '@/lib/preorder';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatPrice } from '@/lib/utils';
import type { CartLine, Product } from '@/types';

/**
 * The cart as a side drawer - opened from the header's bag on every page, so
 * adding a mattress never takes the customer away from what they were
 * looking at. Checkout itself stays on the cart page (/cart).
 */
export function CartSheet({
  open,
  onOpenChange,
  lines,
  total,
  products,
  onSetQty,
  onRemove,
  onCheckout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartLine[];
  total: number;
  products: Product[];
  onSetQty: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  onCheckout: () => void;
}) {
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const leadOf = new Map(preorderLines(lines, products).map((p) => [p.line.id, p.leadDays]));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The cart slides in from the page's end side: the left, in Arabic */}
      <SheetContent side="left" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5 text-start">
          <SheetTitle>سلة المشتريات{count > 0 && ` (${count})`}</SheetTitle>
          <SheetDescription>الدفع عند الاستلام · توصيل مجاني</SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-muted">
              <ShoppingBag className="size-7 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="font-semibold">سلتك فارغة</p>
            <p className="text-sm text-muted-foreground">أضف مرتبة وتظهر هنا.</p>
            <SheetClose asChild>
              <Button variant="outline" className="mt-2">
                تصفّح المراتب
              </Button>
            </SheetClose>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y overflow-y-auto px-5">
              {lines.map((line) => {
                const product = findProduct(products, line.id);
                return (
                  <li key={line.id} className="flex gap-3 py-4">
                    {product ? (
                      <ProductImage product={product} className="size-20 shrink-0 rounded-md border" />
                    ) : (
                      <span className="size-20 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="line-clamp-2 text-sm font-medium leading-5">{line.name}</p>
                      <p className="mt-1 text-sm font-semibold text-primary">{formatPrice(line.price)} د.ل</p>
                      {leadOf.has(line.id) && <PreorderTag leadDays={leadOf.get(line.id) ?? null} />}
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div className="flex items-center rounded-md border">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-e-none"
                            onClick={() => onSetQty(line.id, line.qty + 1)}
                            aria-label={`زيادة كمية ${line.name}`}
                          >
                            <Plus />
                          </Button>
                          <span className="min-w-8 text-center text-sm tabular-nums" aria-live="polite">
                            {line.qty}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-s-none"
                            onClick={() => (line.qty > 1 ? onSetQty(line.id, line.qty - 1) : onRemove(line.id))}
                            aria-label={`إنقاص كمية ${line.name}`}
                          >
                            <Minus />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemove(line.id)}
                          aria-label={`حذف ${line.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <SheetFooter className="flex-col gap-3 border-t p-5 sm:flex-col">
              <div className="flex items-center justify-between text-base">
                <span className="text-muted-foreground">المجموع</span>
                <span className="font-bold">{formatPrice(total)} د.ل</span>
              </div>
              <Separator />
              <Button size="lg" className="w-full" onClick={onCheckout}>
                إتمام الطلب
              </Button>
              <SheetClose asChild>
                <Button variant="outline" className="w-full">
                  متابعة التسوق
                </Button>
              </SheetClose>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
