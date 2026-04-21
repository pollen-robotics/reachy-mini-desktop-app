import { useState, useEffect } from 'react';

/**
 * Track whether the window currently has focus via native events.
 * No polling - relies entirely on focus/blur event listeners.
 */
export function useWindowFocus(): boolean {
  const [hasFocus, setHasFocus] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hasFocus() : true
  );

  useEffect(() => {
    const onFocus = (): void => setHasFocus(true);
    const onBlur = (): void => setHasFocus(false);

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return hasFocus;
}
