import { useEffect, useState } from 'react';

/** Below Tailwind's md breakpoint - where the app's phone chrome (top bar, tab bar) takes over. */
const PHONE_QUERY = '(max-width: 767px)';

/**
 * True on a phone-sized screen, and kept current when the window is resized or
 * the phone is rotated. Read once synchronously, so the first paint already
 * picks the right layout instead of flashing the desktop one.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
  );

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isPhone;
}
