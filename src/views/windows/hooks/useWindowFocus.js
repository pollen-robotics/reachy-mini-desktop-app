import { useState, useEffect } from 'react';

/**
 * Hook to detect if the window has focus
 * @returns {boolean} True if window has focus, false otherwise
 */
export function useWindowFocus() {
  const [hasFocus, setHasFocus] = useState(() => {
    // Check initial focus state
    if (typeof document !== 'undefined') {
      return document.hasFocus();
    }
    return true; // Default to true if document is not available
  });

  useEffect(() => {
    const handleFocus = () => {
      setHasFocus(true);
    };

    const handleBlur = () => {
      setHasFocus(false);
    };

    // Listen to window focus/blur events
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Also check document focus state periodically (for cases where events might not fire)
    const checkFocus = () => {
      if (typeof document !== 'undefined') {
        setHasFocus(document.hasFocus());
      }
    };
    
    // Check focus state every 500ms as a fallback
    const focusCheckInterval = setInterval(checkFocus, 500);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      clearInterval(focusCheckInterval);
    };
  }, []);

  return hasFocus;
}

