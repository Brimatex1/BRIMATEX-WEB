import { cn } from '@/lib/utils';
import type { Product } from '@/types';

/**
 * Product imagery placeholder.
 *
 * Renders `product.image` when the catalogue has one. Until real photography
 * exists it draws an abstract layered composition instead — mattress-like
 * strata for beds, a soft rounded form for pillows, folded bands for bedding.
 * The intent is that an empty catalogue reads as a deliberate visual style
 * rather than as broken images.
 */

interface ProductVisualProps {
  product: Product;
  /** `hero` is the large PDP composition, `card` the grid thumbnail. */
  variant?: 'card' | 'hero';
  className?: string;
}

/**
 * Every colour here comes from the brand palette via CSS custom properties —
 * Cloud Dancer as the surface, Porcelain and Blue Violet as the depth ramp.
 * Nothing is hard-coded, so retinting the brand retints the artwork.
 */

/** Deterministic per-product tint weight so the grid does not look uniform. */
function tintBias(id: number): number {
  return ((id * 37) % 12) / 100;
}

function MattressArt({ id, layers }: { id: number; layers: number }) {
  const bias = tintBias(id);
  const strata = Array.from({ length: layers });

  return (
    <div className="absolute inset-0 flex items-center justify-center p-[8%]">
      <div
        className="relative w-full overflow-hidden rounded-[10px] shadow-lg"
        style={{ aspectRatio: '16 / 9', background: 'hsl(var(--brand-cloud))' }}
      >
        {/* stacked comfort layers — paler at the top, denser toward the base */}
        <div className="absolute inset-0 flex flex-col">
          {strata.map((_, i) => (
            <div
              key={i}
              className="w-full"
              style={{
                flex: i === strata.length - 1 ? 2.4 : 1,
                background: `hsl(var(--brand-violet) / ${(0.05 + i * 0.11 + bias).toFixed(3)})`,
              }}
            />
          ))}
        </div>
        {/* quilted top stitching */}
        <div
          className="absolute inset-x-0 top-0 h-[34%] opacity-40"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 14px, hsl(0 0% 100% / .55) 14px 15px)',
          }}
        />
        <div className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-black/10" />
      </div>
    </div>
  );
}

function PillowArt({ id }: { id: number }) {
  const bias = tintBias(id);
  return (
    <div className="absolute inset-0 flex items-center justify-center p-[14%]">
      <div
        className="relative w-full rounded-[42%_42%_38%_38%/50%_50%_46%_46%] shadow-lg"
        style={{
          aspectRatio: '3 / 2',
          background: `radial-gradient(120% 90% at 50% 25%, hsl(var(--brand-cloud)), hsl(var(--surface-calm) / ${(0.55 + bias).toFixed(3)}))`,
        }}
      >
        <div className="absolute inset-[12%] rounded-[40%] opacity-45 ring-1 ring-inset ring-white/70" />
      </div>
    </div>
  );
}

function BeddingArt({ id }: { id: number }) {
  const bias = tintBias(id);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-[12%]"
    >
      <div
        className="relative w-full overflow-hidden rounded-lg shadow-lg"
        style={{ aspectRatio: '4 / 3', background: 'hsl(var(--brand-cloud))' }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute inset-x-0"
            style={{
              top: `${i * 25}%`,
              height: '25%',
              background: `hsl(var(--surface-calm) / ${(0.28 + i * 0.16 + bias).toFixed(3)})`,
              transform: `translateX(${i % 2 === 0 ? '-2%' : '2%'})`,
            }}
          />
        ))}
        <div className="absolute inset-0 ring-1 ring-inset ring-black/10" />
      </div>
    </div>
  );
}

export function ProductVisual({ product, variant = 'card', className }: ProductVisualProps) {
  const frame = cn(
    'relative isolate overflow-hidden rounded-xl bg-gradient-to-b from-muted/70 to-muted',
    variant === 'hero' ? 'aspect-[4/3]' : 'aspect-[5/4]',
    className
  );

  if (product.image) {
    return (
      <div className={frame}>
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    );
  }

  // Thicker mattresses get more visible strata, capped so it stays legible.
  const layers = Math.min(6, Math.max(3, Math.round((product.size?.height ?? 22) / 6)));

  return (
    <div className={frame} role="img" aria-label={product.name}>
      {product.category === 'pillow' ? (
        <PillowArt id={product.id} />
      ) : product.category === 'bedding' ? (
        <BeddingArt id={product.id} />
      ) : (
        <MattressArt id={product.id} layers={layers} />
      )}
    </div>
  );
}
