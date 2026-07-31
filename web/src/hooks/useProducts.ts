import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Product } from '@/types';

/**
 * Fetches the catalogue once for the whole app — the shop grid, the product
 * detail page and the wishlist all read from the same list.
 */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProducts();
      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { products, loading, error, reload: load };
}
