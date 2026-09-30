import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';

import { ProductImage } from '@/components/store/ProductCard';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

/**
 * The product's pictures: its photo, then - when one ships - the cutaway of
 * what is inside (src/data/product-photos.json, "layers"). Swipe between them
 * on a phone, or pick one below; a mattress with a single picture shows it
 * alone, as before. The cutaway sits on white, so it is shown whole
 * (contained), not cropped like the photo.
 */
export function ProductGallery({ product, overlay }: { product: Product; overlay?: React.ReactNode }) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  // Another product: back to its photo.
  useEffect(() => {
    api?.scrollTo(0, true);
    setIndex(0);
  }, [api, product.id]);

  if (!product.layersImage) {
    return (
      <div className="relative overflow-hidden rounded-xl border">
        <ProductImage product={product} className="aspect-square" />
        {overlay}
      </div>
    );
  }

  const views = [
    { key: 'photo', label: 'الصورة' },
    { key: 'layers', label: 'من الداخل' },
  ];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border">
        <Carousel setApi={setApi} opts={{ direction: 'rtl' }} aria-label={`صور ${product.name}`}>
          <CarouselContent className="ms-0">
            <CarouselItem className="ps-0">
              <ProductImage product={product} className="aspect-square" />
            </CarouselItem>
            <CarouselItem className="ps-0">
              <div className="grid aspect-square place-items-center bg-white p-3">
                <img
                  src={product.layersImage}
                  alt={`طبقات ${product.name} من الداخل`}
                  className="max-h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
        {overlay}
        {/* On the photo, say there is more to see: a tap opens the inside. */}
        {index === 0 && (
          <button
            type="button"
            onClick={() => api?.scrollTo(1)}
            className="absolute bottom-3 start-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Layers className="size-4 text-primary" aria-hidden="true" />
            شوف الطبقات من الداخل
          </button>
        )}
      </div>

      <div className="flex gap-2" role="tablist" aria-label="صور المنتج">
        {views.map((v, i) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={index === i}
            onClick={() => api?.scrollTo(i)}
            className={cn(
              'w-20 overflow-hidden rounded-md border-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              index === i ? 'border-primary' : 'border-transparent opacity-80 hover:opacity-100'
            )}
          >
            {i === 0 ? (
              <ProductImage product={product} className="aspect-[4/3]" />
            ) : (
              <div className="aspect-[4/3] bg-white">
                <img src={product.layersImage!} alt="" className="size-full object-contain" loading="lazy" />
              </div>
            )}
            <span className="block bg-muted py-0.5 text-[11px] font-medium">{v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
