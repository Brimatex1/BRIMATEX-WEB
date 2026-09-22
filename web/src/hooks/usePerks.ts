import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { Perks } from '@/types';

/**
 * The signed-in customer's loyalty - vouchers, reward progress and points -
 * from the server, where the website and the app share one balance. Null
 * while signed out or before the first load.
 */
export function usePerks(token: string | null) {
  const [perks, setPerks] = useState<Perks | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setPerks(null);
      return;
    }
    try {
      setPerks(await api.getPerks(token));
    } catch {
      /* Keep what is shown; the next refresh tries again */
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { perks, refresh, activeVouchers: perks?.vouchers.filter((v) => v.state === 'active') ?? [] };
}
