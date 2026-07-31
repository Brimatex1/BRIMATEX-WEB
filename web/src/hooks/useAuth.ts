import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/types';

const TOKEN_KEY = 'auth_token';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setUser(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    api
      .me(token)
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (cancelled) return;
        // Stale or invalid session — drop it.
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  /** Patch the cached user after a profile change (addresses, wishlist). */
  const patchUser = useCallback((changes: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...changes } : prev));
  }, []);

  return { token, user, checking, signIn, signOut, patchUser };
}
