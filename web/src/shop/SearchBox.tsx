import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ScanBarcode, Search } from 'lucide-react';

import { searchProducts } from '@/lib/productSearch';
import { trackSearch } from '@/lib/pixel';
import { cn } from '@/lib/utils';

import { TIER_KEYS, TIER_TITLE, describe, displayName, featuredVariant, parseSize, sizeText, variantsOf } from './catalog';
import { photoOf } from './ProductCard';
import { href, useRouter, type Route } from './router';
import { useShop } from './state';
import { Price, SizeText } from './ui';

interface Option {
  id: string;
  to: string;
}

/**
 * The header's search with its suggestions (handoff WebSearch): after two
 * letters, sizes that match, the tiers, three mattresses with their price, and
 * «كل النتائج (n)». Arrows move, Enter opens, Escape closes. The matching is
 * the shop's own (lib/productSearch.ts: hamzas, ة/ه, ى/ي and everyday words).
 */
export function SearchBox({ className }: { className?: string }) {
  const shop = useShop();
  const { go, route } = useRouter();
  const [q, setQ] = useState(route.name === 'search' ? route.query : '');
  const [debounced, setDebounced] = useState(q);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (route.name === 'search') setQ(route.query);
    setOpen(false);
  }, [route]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 150);
    return () => window.clearTimeout(t);
  }, [q]);

  // A click anywhere else closes it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const term = debounced.trim();
  const results = useMemo(() => (term.length >= 2 ? searchProducts(shop.products, term) : []), [shop.products, term]);

  // Sizes sold that contain the digits typed: «180» → 180×200, 180×190.
  const sizeHints = useMemo(() => {
    const digits = term.match(/\d{2,3}/)?.[0];
    if (!digits) return [];
    const all = new Set<string>();
    for (const p of shop.products) for (const v of variantsOf(p)) {
      const s = parseSize(v);
      if (s.width !== null && (String(s.width) === digits || String(s.length) === digits)) all.add(sizeText(s));
    }
    return [...all].slice(0, 3);
  }, [shop.products, term]);

  const options: Option[] = [
    ...sizeHints.map((s) => ({ id: `size-${s}`, to: `/mattresses?size=${s.replace('×', 'x')}` })),
    ...results.slice(0, 3).map((p) => ({ id: `p-${p.id}`, to: href({ name: 'product', id: p.id }) })),
    ...(results.length ? [{ id: 'all', to: href({ name: 'search', query: term }) }] : []),
  ];
  const showPanel = open && term.length >= 2;

  function openTo(to: string) {
    setOpen(false);
    go(to);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (active >= 0 && options[active]) return openTo(options[active].to);
    const query = q.trim();
    if (!query) return;
    trackSearch(query);
    go({ name: 'search', query } as Route);
  }

  function onKey(e: KeyboardEvent) {
    if (!showPanel) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const optClass = (id: string) => cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start hover:bg-accent', options[active]?.id === id && 'bg-accent');

  return (
    <div ref={box} className={cn('relative', className)}>
      <form role="search" onSubmit={submit} className="flex h-12 items-center gap-3 rounded-full bg-image-bg px-5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-[22px] shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="عن ماذا تبحث؟"
          aria-label="ابحث عن مرتبة"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={active >= 0 && options[active] ? `${listId}-${options[active].id}` : undefined}
          aria-autocomplete="list"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-text-tertiary"
          enterKeyHint="search"
        />
        <ScanBarcode className="size-[22px] shrink-0 text-muted-foreground md:hidden" strokeWidth={1.8} aria-hidden />
      </form>

      {showPanel ? (
        <div id={listId} role="listbox" aria-label="اقتراحات البحث" className="absolute inset-x-0 top-[calc(100%+8px)] z-50 grid animate-drop-in gap-6 rounded-lg border border-border bg-popover p-4 shadow-lg md:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col gap-2">
            {sizeHints.length ? (
              <>
                <b className="px-3 text-[13px] text-muted-foreground">اقتراحات</b>
                {sizeHints.map((s) => (
                  <button key={s} id={`${listId}-size-${s}`} role="option" aria-selected={options[active]?.id === `size-${s}`} type="button" className={optClass(`size-${s}`)} onClick={() => openTo(`/mattresses?size=${s.replace('×', 'x')}`)}>
                    <Search className="size-4 text-muted-foreground" aria-hidden />
                    <span>
                      مرتبة <SizeText>{s}</SizeText>
                    </span>
                  </button>
                ))}
              </>
            ) : null}
            <b className="px-3 text-[13px] text-muted-foreground">الفئات</b>
            <div className="flex flex-wrap gap-2 px-3">
              {TIER_KEYS.map((t) => (
                <button key={t} type="button" className="rounded-full border border-border px-3.5 py-1.5 text-sm font-bold hover:border-foreground" onClick={() => openTo(href({ name: 'category', tier: t }))}>
                  {TIER_TITLE[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <b className="px-3 text-[13px] text-muted-foreground">مراتب</b>
            {results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">لا توجد مراتب بهذا الاسم. اضغط Enter للبحث.</p>
            ) : (
              results.slice(0, 3).map((p) => {
                const v = featuredVariant(p);
                return (
                  <button key={p.id} id={`${listId}-p-${p.id}`} role="option" aria-selected={options[active]?.id === `p-${p.id}`} type="button" className={optClass(`p-${p.id}`)} onClick={() => openTo(href({ name: 'product', id: p.id }))}>
                    <img src={photoOf(p)} alt="" className="size-14 shrink-0 bg-image-bg object-cover" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="text-[15px]">{displayName(p)}</b>
                      <span className="truncate text-[13px] text-muted-foreground">{describe(p, v)}</span>
                    </span>
                    <Price amount={v.price} size="row" />
                  </button>
                );
              })
            )}
            {results.length ? (
              <button id={`${listId}-all`} role="option" aria-selected={options[active]?.id === 'all'} type="button" className={cn(optClass('all'), 'justify-center font-bold underline underline-offset-4')} onClick={() => openTo(href({ name: 'search', query: term }))}>
                كل النتائج ({results.length})
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
