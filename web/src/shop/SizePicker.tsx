import { cn } from '@/lib/utils';
import type { Product, ProductVariant } from '@/types';

import { canOrderVariant, fixedHeight, heightsOf, parseSize, sizeText, variantsOf } from './catalog';
import { SizeText } from './ui';

interface Props {
  product: Product;
  value: ProductVariant;
  onChange: (v: ProductVariant) => void;
}

function SizeButton({ label, selected, disabled, onClick, note }: { label: string; selected: boolean; disabled?: boolean; onClick: () => void; note?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      title={note}
      className={cn(
        'h-12 min-w-0 rounded-lg border text-[15px] font-bold tabular-nums transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-2 border-foreground' : 'border-border hover:border-foreground',
        // A size this height does not come in: hatched and out of reach (handoff WebProductComfort).
        disabled && 'cursor-not-allowed border-border text-text-tertiary [background:repeating-linear-gradient(-45deg,transparent_0_6px,hsl(var(--border))_6px_7px)] hover:border-border'
      )}
    >
      <SizeText>{label}</SizeText>
    </button>
  );
}

/**
 * المقاس (handoff WebProduct / WebProductComfort): Premium and Elite are one
 * height, so a row of sizes; Comfort picks the height first, then a size from
 * two rows (190 and 200 long). Everything comes from the product's variants -
 * a combination Odoo does not have is disabled, never invented.
 */
export function SizePicker({ product, value, onChange }: Props) {
  const all = variantsOf(product);
  const chosen = parseSize(value);
  const fixed = fixedHeight(product);
  const heights = fixed === null ? heightsOf(product) : [];

  const sizesAt = (height: number | null) => all.filter((v) => height === null || parseSize(v).height === height);
  const key = (v: ProductVariant) => sizeText(parseSize(v));

  // Every size this product has (any height), shortest first, then narrowest.
  const allSizes = [...new Map(all.map((v) => [key(v), parseSize(v)])).entries()]
    .filter(([k]) => k)
    .sort((a, b) => a[1].length! - b[1].length! || a[1].width! - b[1].width!);

  function pickHeight(h: number) {
    const sameSize = all.find((v) => parseSize(v).height === h && key(v) === key(value));
    const first = sizesAt(h).find(canOrderVariant) ?? sizesAt(h)[0];
    const next = sameSize ?? first;
    if (next) onChange(next);
  }

  function pickSize(k: string) {
    const at = all.filter((v) => key(v) === k);
    const next = at.find((v) => parseSize(v).height === chosen.height) ?? at[0];
    if (next) onChange(next);
  }

  if (all.length <= 1) return null;

  return (
    <div className="flex flex-col gap-3">
      {heights.length > 1 ? (
        <>
          <b className="text-[15px]">الارتفاع: {chosen.height} سم</b>
          <div role="radiogroup" aria-label="الارتفاع" className="grid grid-cols-3 gap-1 rounded-full bg-image-bg p-1">
            {heights.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={chosen.height === h}
                onClick={() => pickHeight(h)}
                className={cn('h-10 rounded-full text-[15px] font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', chosen.height === h ? 'bg-foreground text-background' : 'hover:bg-background')}
              >
                {h} سم
              </button>
            ))}
          </div>
        </>
      ) : null}

      <b className="text-[15px]">
        المقاس: <SizeText>{key(value)}</SizeText> سم
      </b>

      {heights.length > 1 ? (
        // Comfort: one row per length.
        [...new Set(allSizes.map(([, s]) => s.length))].map((length) => (
          <div key={length} className="flex flex-col gap-2">
            <span className="text-[13px] text-muted-foreground">طول {length} سم</span>
            <div role="radiogroup" aria-label={`المقاسات بطول ${length} سم`} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {allSizes
                .filter(([, s]) => s.length === length)
                .map(([k]) => {
                  const exists = all.some((v) => key(v) === k && parseSize(v).height === chosen.height);
                  return <SizeButton key={k} label={k} selected={k === key(value)} disabled={!exists} note={exists ? undefined : `غير متوفّر بارتفاع ${chosen.height} سم`} onClick={() => pickSize(k)} />;
                })}
            </div>
          </div>
        ))
      ) : (
        <div role="radiogroup" aria-label="المقاس" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {allSizes.map(([k]) => (
            <SizeButton key={k} label={k} selected={k === key(value)} onClick={() => pickSize(k)} />
          ))}
        </div>
      )}
    </div>
  );
}
