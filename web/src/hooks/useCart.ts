import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CartLine, Product } from '@/types';

const STORAGE_KEY = 'cart';
const MAX_QTY = 999;

function readStoredCart(): CartLine[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
      .filter((i) => Number.isInteger(i.id))
      .map((i) => ({
        id: Number(i.id),
        name: String(i.name ?? ''),
        price: Number(i.price) || 0,
        qty: Math.min(MAX_QTY, Math.max(1, parseInt(String(i.qty), 10) || 1)),
      }));
  } catch {
    return [];
  }
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(readStoredCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  const add = useCallback((product: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.id === product.id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l
        );
      }
      return [
        ...prev,
        { id: product.id, name: product.name, price: Number(product.price) || 0, qty: 1 },
      ];
    });
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, qty: Math.min(MAX_QTY, Math.max(1, qty)) } : l))
    );
  }, []);

  const remove = useCallback((id: number) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.qty, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  return { lines, add, setQty, remove, clear, total, count };
}
