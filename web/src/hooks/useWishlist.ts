import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import type { User } from '@/types';

/**
 * Wishlist lives on the server and requires an account. The ids are seeded
 * from /api/auth/me (which returns the saved wishlist) and then kept in sync
 * optimistically, rolling back if the request fails.
 */
export function useWishlist(token: string | null, user: User | null) {
  const [ids, setIds] = useState<number[]>([]);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    setIds(user?.wishlist?.map((w) => Number(w.productId)).filter(Number.isInteger) ?? []);
  }, [user]);

  const has = useCallback((productId: number) => ids.includes(productId), [ids]);

  const toggle = useCallback(
    async (productId: number) => {
      if (!token) {
        throw new ApiError('سجّل الدخول لحفظ المفضلة', 401);
      }

      const wasSaved = ids.includes(productId);
      setPending(productId);
      setIds((prev) =>
        wasSaved ? prev.filter((id) => id !== productId) : [...prev, productId]
      );

      try {
        if (wasSaved) {
          await api.removeFromWishlist(token, productId);
        } else {
          await api.addToWishlist(token, productId);
        }
        return !wasSaved;
      } catch (err) {
        // Put the id back the way it was.
        setIds((prev) =>
          wasSaved ? [...prev, productId] : prev.filter((id) => id !== productId)
        );
        throw err;
      } finally {
        setPending(null);
      }
    },
    [token, ids]
  );

  return { ids, has, toggle, pending };
}
