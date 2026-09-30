import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  locate,
  sizeName,
  thicknessName,
  variantForSize,
  type SizeChoices,
  type SizeStatus,
} from '@/lib/sizeOptions';
import { cn } from '@/lib/utils';

const STATUS_TEXT: Record<SizeStatus, string> = { ready: 'متوفّر', preorder: 'طلب مسبق', out: 'نفد' };

const itemClass = (status: SizeStatus) =>
  cn(
    'group h-auto flex-col gap-0.5 rounded-md border px-3 py-2.5 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
    // In stock stands out - a green edge and "متوفّر" - from one made to order.
    status === 'ready' && 'border-success/60 bg-success/5'
  );

function StatusLine({ status }: { status: SizeStatus }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-[11px] leading-4 group-data-[state=on]:text-primary-foreground/85',
        status === 'ready' ? 'font-semibold text-success' : 'text-muted-foreground'
      )}
    >
      {status === 'ready' && (
        <span className="size-1.5 rounded-full bg-success group-data-[state=on]:bg-primary-foreground" aria-hidden="true" />
      )}
      {STATUS_TEXT[status]}
    </span>
  );
}

interface SizePickerProps {
  choices: SizeChoices;
  selectedId: number;
  onSelect: (variantId: number) => void;
}

/**
 * Two steps, as a customer thinks about a mattress: the size of the bed, then
 * how thick. The owner's main sizes are shown; the rest wait behind "مقاسات
 * أخرى" - open already when the size on screen is one of them. A size reads
 * "متوفّر" when any of its thicknesses is; each thickness then says its own.
 */
export function SizePicker({ choices, selectedId, onSelect }: SizePickerProps) {
  const current = locate(choices, selectedId);
  const main = useMemo(() => choices.sizes.filter((s) => s.main), [choices]);
  const others = useMemo(() => choices.sizes.filter((s) => !s.main), [choices]);
  // No main size at all (an unusual product): every size is simply listed.
  const [showOthers, setShowOthers] = useState(main.length === 0 || current?.size.main === false);
  useEffect(() => {
    if (current && !current.size.main) setShowOthers(true);
  }, [current]);

  const visible = showOthers || main.length === 0 ? [...main, ...others] : main;

  function pickSize(key: string) {
    const size = choices.sizes.find((s) => s.key === key);
    if (!size || size.key === current?.size.key) return;
    onSelect(variantForSize(size, current?.thickness.height ?? null).id);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-semibold">
          {choices.hasThickness ? '١. ' : ''}المقاس <span className="font-normal text-muted-foreground">(سم)</span>
          {current && (
            <span className="font-normal text-muted-foreground">
              {' '}— <bdi dir="ltr">{sizeName(current.size)}</bdi>
            </span>
          )}
        </p>
        <ToggleGroup
          type="single"
          dir="rtl"
          value={current?.size.key ?? ''}
          onValueChange={(v) => v && pickSize(v)}
          aria-label="المقاس"
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        >
          {visible.map((s) => (
            <ToggleGroupItem
              key={s.key}
              value={s.key}
              disabled={s.status === 'out'}
              aria-label={`${sizeName(s)} — ${STATUS_TEXT[s.status]}`}
              className={itemClass(s.status)}
            >
              {/* Left to right, as the owner writes sizes: 90 × 190, never 190 × 90. */}
              <bdi dir="ltr" className="tabular text-base font-semibold">
                {sizeName(s)}
              </bdi>
              <StatusLine status={s.status} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {main.length > 0 && others.length > 0 && !showOthers && (
          <button
            type="button"
            onClick={() => setShowOthers(true)}
            className="flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            مقاسات أخرى ({others.length})
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* One height for every size: said once, nothing to choose. */}
      {!choices.hasThickness && current?.thickness.height != null && (
        <p className="text-sm">
          <span className="font-semibold">الارتفاع</span>{' '}
          <span className="text-muted-foreground">{thicknessName(current.thickness.height)}</span>
        </p>
      )}

      {choices.hasThickness && current && current.size.thicknesses.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">
            ٢. الارتفاع
            {current.thickness.height !== null && (
              <span className="font-normal text-muted-foreground"> — {thicknessName(current.thickness.height)}</span>
            )}
          </p>
          <ToggleGroup
            type="single"
            dir="rtl"
            value={String(current.thickness.variant.id)}
            onValueChange={(v) => v && onSelect(Number(v))}
            aria-label="الارتفاع"
            className="flex flex-wrap justify-start gap-2"
          >
            {current.size.thicknesses.map((t) => (
              <ToggleGroupItem
                key={t.variant.id}
                value={String(t.variant.id)}
                disabled={t.status === 'out'}
                aria-label={`${t.height !== null ? thicknessName(t.height) : 'ارتفاع واحد'} — ${STATUS_TEXT[t.status]}`}
                className={cn(itemClass(t.status), 'min-w-[88px]')}
              >
                <span className="tabular text-base font-semibold">
                  {t.height !== null ? thicknessName(t.height) : 'ارتفاع واحد'}
                </span>
                <StatusLine status={t.status} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </div>
  );
}
