import { useEffect, useState } from 'react';
import { BadgeCheck, HandCoins, MessageCircle, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';

import { ProductCard, ProductImage, TierBadge, WishlistButton } from '@/components/store/ProductCard';
import { ProductReviewsSection } from '@/components/store/ProductReviewsSection';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { iconSrc, resolveFeatureIcons } from '@/lib/icons';
import { openSupport } from '@/lib/support';
import { formatPrice, isComingSoon } from '@/lib/utils';
import type { Product } from '@/types';

interface ProductPageProps {
  product: Product;
  related: Product[];
  justAddedId: number | null;
  saved: boolean;
  wishlistPending: boolean;
  isSaved: (productId: number) => boolean;
  wishlistPendingId: number | null;
  onAdd: (product: Product) => void;
  /** "Buy now": add, then straight to the cart. */
  onBuyNow: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
  onGoHome: () => void;
  onOpenShop: (tierKey?: string) => void;
}

const PROMISES = [
  { Icon: HandCoins, text: 'الدفع عند الاستلام' },
  { Icon: Truck, text: 'توصيل مجاني لباب بيتك' },
  { Icon: ShieldCheck, text: 'ضمان حتى 10 سنوات لبعض المنتجات' },
];

/**
 * A product: its photo beside its name, price and sizes, the buy buttons,
 * then the details in an accordion, the reviews, and "you may also like".
 * What goes in the cart is the chosen size's own id, price and stock - that
 * id is what Odoo needs to price and fulfil the order.
 */
export function ProductPage({
  product,
  related,
  justAddedId,
  saved,
  wishlistPending,
  isSaved,
  wishlistPendingId,
  onAdd,
  onBuyNow,
  onToggleWishlist,
  onOpenProduct,
  onGoHome,
  onOpenShop,
}: ProductPageProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants?.[0]?.id ?? product.id);
  useEffect(() => {
    setSelectedVariantId(product.variants?.[0]?.id ?? product.id);
  }, [product.id, product.variants]);

  const variants = product.variants ?? [];
  const selected = variants.find((v) => v.id === selectedVariantId);
  const price = selected?.price ?? product.price;
  const inStock = (selected ? selected.inStock !== false : product.inStock !== false) && !isComingSoon(product.category);
  const stock = selected?.stock ?? product.stock;
  const sku = selected?.sku || product.sku;
  const justAdded = justAddedId === selectedVariantId;
  const cartProduct: Product = selected
    ? { ...product, id: selected.id, price: selected.price, sku: selected.sku, stock: selected.stock, inStock: selected.inStock }
    : product;
  const features = resolveFeatureIcons(product.iconFeatures);

  function ask() {
    const size = selected?.label ? ` (المقاس: ${selected.label})` : '';
    openSupport({ message: `عندي سؤال عن ${product.name}${size}: ` });
  }

  const buyButtons = (
    <>
      <Button size="lg" variant="accent" className="flex-1" disabled={!inStock} onClick={() => onBuyNow(cartProduct)}>
        {inStock ? 'اشترِ الآن' : 'نفد المخزون'}
      </Button>
      <Button size="lg" className="flex-1" disabled={!inStock || justAdded} onClick={() => onAdd(cartProduct)}>
        {justAdded ? (
          <>
            <BadgeCheck /> تمت الإضافة
          </>
        ) : (
          <>
            <ShoppingBag /> أضف للسلة
          </>
        )}
      </Button>
    </>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 md:px-6 md:pb-16 md:pt-10">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onGoHome();
              }}
            >
              الرئيسية
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              href={product.tier ? `/shop?category=${encodeURIComponent(product.tier.key)}` : '/shop'}
              onClick={(e) => {
                e.preventDefault();
                onOpenShop(product.tier?.key);
              }}
            >
              {product.tier ? `مراتب ${product.tier.name}` : 'المراتب'}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        {/* ── The photo: stays in view while the details scroll ── */}
        <div className="md:sticky md:top-32 md:self-start">
          <div className="relative overflow-hidden rounded-xl border">
            <ProductImage product={product} className="aspect-square" />
            <WishlistButton
              saved={saved}
              disabled={wishlistPending}
              onClick={() => onToggleWishlist(product)}
              className="absolute end-4 top-4 size-10"
            />
          </div>
        </div>

        {/* ── Name, price, sizes, buy ── */}
        <div className="space-y-6">
          <div className="space-y-3">
            <TierBadge product={product} />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{product.name}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-3xl font-bold text-primary">{formatPrice(price)} د.ل</p>
              {inStock ? (
                <Badge variant="success">{stock && stock > 0 ? `متوفّر · ${stock}` : 'متوفّر'}</Badge>
              ) : (
                <Badge variant="secondary">نفد المخزون</Badge>
              )}
            </div>
            {sku && <p className="text-xs text-muted-foreground">رمز المنتج: {sku}</p>}
          </div>

          <Separator />

          {variants.length > 1 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                المقاس{selected ? <span className="font-normal text-muted-foreground"> — {selected.label}</span> : null}
              </p>
              <ToggleGroup
                type="single"
                dir="rtl"
                value={String(selectedVariantId)}
                onValueChange={(v) => v && setSelectedVariantId(Number(v))}
                aria-label="المقاس"
                className="flex-wrap justify-start gap-2"
              >
                {variants.map((v) => (
                  <ToggleGroupItem
                    key={v.id}
                    value={String(v.id)}
                    disabled={v.inStock === false}
                    className="h-auto min-w-[88px] rounded-md border px-3 py-2 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {v.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {/* Larger screens: the buttons in the flow; phones: a bar fixed at the bottom */}
          <div className="hidden gap-3 md:flex">{buyButtons}</div>

          <ul className="space-y-2.5 rounded-lg bg-muted/60 p-4">
            {PROMISES.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>

          <Accordion type="multiple" defaultValue={['description', 'specs']} className="w-full">
            {product.description && (
              <AccordionItem value="description">
                <AccordionTrigger>الوصف</AccordionTrigger>
                <AccordionContent className="text-base leading-7 text-muted-foreground">{product.description}</AccordionContent>
              </AccordionItem>
            )}
            {features.length > 0 && (
              <AccordionItem value="specs">
                <AccordionTrigger>المواصفات</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-3 gap-2">
                    {features.map((f) => (
                      <div key={f.key} className="flex flex-col items-center rounded-md border p-3 text-center">
                        <img src={iconSrc(f.file)} alt="" className="size-10 object-contain" />
                        <span className="mt-2 line-clamp-2 text-xs leading-4">{f.label}</span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            <AccordionItem value="delivery">
              <AccordionTrigger>التوصيل والدفع</AccordionTrigger>
              <AccordionContent className="leading-7 text-muted-foreground">
                نوصّل المرتبة لباب بيتك مجاناً، وتدفع ثمنها نقداً عند الاستلام — ما تدفع شي قبل ما تشوفها.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="warranty">
              <AccordionTrigger>الضمان</AccordionTrigger>
              <AccordionContent className="leading-7 text-muted-foreground">
                مراتبنا من مصنعنا في ليبيا، وعليها ضمان المصنع — حتى 10 سنوات لبعض المنتجات.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button variant="outline" className="w-full gap-2" onClick={ask}>
            <MessageCircle /> عندك سؤال على هذي المرتبة؟
          </Button>
        </div>
      </div>

      <div className="mt-12">
        <ProductReviewsSection productId={product.id} />
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-5 text-xl font-bold tracking-tight md:text-2xl">قد يعجبك أيضاً</h2>
          <Carousel opts={{ direction: 'rtl', align: 'start' }} className="group">
            <CarouselContent>
              {related.slice(0, 10).map((p) => (
                <CarouselItem key={p.id} className="basis-1/2 md:basis-1/3 lg:basis-1/4">
                  <ProductCard
                    product={p}
                    saved={isSaved(p.id)}
                    wishlistPending={wishlistPendingId === p.id}
                    onOpen={onOpenProduct}
                    onToggleWishlist={onToggleWishlist}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            {related.length > 4 && (
              <>
                <CarouselPrevious className="hidden md:inline-flex" />
                <CarouselNext className="hidden md:inline-flex" />
              </>
            )}
          </Carousel>
        </section>
      )}

      {/* ── Phone: the buy bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="flex gap-2">{buyButtons}</div>
      </div>
    </div>
  );
}
