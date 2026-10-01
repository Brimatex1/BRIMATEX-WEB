import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';

import { ProductImage, priceFrom } from '@/components/store/ProductCard';
import { Input } from '@/components/ui/input';
import { searchProducts } from '@/lib/productSearch';
import { openSupport } from '@/lib/support';
import { cn, formatPrice } from '@/lib/utils';
import type { Product } from '@/types';

/** What people look for - one tap fills the search. */
const POPULAR = ['طبية', 'نوابض', 'ميموري', 'اقتصادية', '160×200', '180×200'];

const MAX_RESULTS = 5;

interface HeaderSearchProps {
  products: Product[];
  /** The whole result list, in the shop. */
  onSearch: (query: string) => void;
  onOpenProduct: (product: Product, query: string) => void;
  /** Focus as soon as it shows - the phone's panel opens to type in. */
  autoFocus?: boolean;
  /** Ideas to tap while the box is empty (the phone's panel). */
  showPopular?: boolean;
  /** Called once a choice has been made, so a panel can close. */
  onDone?: () => void;
  className?: string;
}

/**
 * Search from any page: the mattresses that match show as the customer types
 * (photo, name, price from), best first - a tap opens one; Enter, or "كل
 * النتائج", opens them all in the shop. Arrows move through the list.
 */
export function HeaderSearch({ products, onSearch, onOpenProduct, autoFocus, showPopular, onDone, className }: HeaderSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const q = query.trim();
  const results = useMemo(() => (q.length >= 2 ? searchProducts(products, q).slice(0, MAX_RESULTS) : []), [products, q]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // A tap outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => setActive(-1), [q]);

  function finish() {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    onDone?.();
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (active >= 0 && results[active]) return pick(results[active]);
    if (!q) return;
    onSearch(q);
    finish();
  }

  function pick(product: Product) {
    onOpenProduct(product, q);
    finish();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      if (open && q) setOpen(false);
      else onDone?.();
    }
  }

  const showList = open && q.length >= 2;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <form onSubmit={submit} role="search" className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          ref={inputRef}
          // Text, not "search": the browser would add a second clear button beside ours.
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="ابحث عن مرتبة، مقاس، أو «طبية»"
          aria-label="بحث في المراتب"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          enterKeyHint="search"
          className="h-10 border-border pe-9 ps-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="مسح البحث"
            className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </form>

      {/* Ideas, while nothing is typed (the phone's panel) */}
      {showPopular && !q && (
        <div className="mt-3 flex flex-wrap gap-2">
          {POPULAR.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setQuery(p);
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="rounded-full border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-muted active:scale-[0.97]"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {showList && (
        <div
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
          style={{ transformOrigin: 'top center' }}
        >
          {results.length > 0 ? (
            <>
              <ul id={listId} role="listbox" aria-label="نتائج البحث" className="max-h-[60vh] overflow-y-auto py-1">
                {results.map((p, i) => (
                  <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={active === i}>
                    <button
                      type="button"
                      onClick={() => pick(p)}
                      onPointerEnter={() => setActive(i)}
                      className={cn('flex w-full items-center gap-3 px-3 py-2 text-start', active === i && 'bg-muted')}
                    >
                      <ProductImage product={p} className="size-12 shrink-0 rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        {p.tier && <span className="block text-xs text-muted-foreground">{p.tier.name}</span>}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-primary">
                        <span className="text-xs font-normal text-muted-foreground">من </span>
                        {formatPrice(priceFrom(p))} د.ل
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => submit()}
                className="flex w-full items-center justify-between border-t px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted"
              >
                كل النتائج عن «{q}»
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className="space-y-2 p-4 text-sm">
              <p>ما لقيناش مرتبة فيها «{q}».</p>
              <p className="text-muted-foreground">جرّب: طبية، نوابض، ميموري، أو مقاس زي 160×200.</p>
              <button
                type="button"
                onClick={() => {
                  openSupport({ topic: 'product', message: `أدوّر على: ${q}\n` });
                  finish();
                }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                اسألنا وفريقنا يساعدك
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
